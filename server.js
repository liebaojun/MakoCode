/**
 * MakoCode 后端服务器 (Node.js)
 * 通过 shell 启动 claude 命令（与终端完全一致），NDJSON 流式传输给前端。
 * 零外部依赖，仅使用 Node.js 内置模块。
 *
 * 用法: node server.js [端口号，默认8080]
 *
 * 模块化：共享常量 → lib/constants.js | 工具函数 → lib/utils.js
 *         设置管理 → lib/settings.js | 安装逻辑 → lib/installer.js
 */
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// ─── 导入共享模块 ──────────────────────────────────────
const {
  DEFAULT_PORT, RECENT_HISTORY_WINDOW, HISTORY_PREVIEW_LENGTH, MAX_UPLOAD_SIZE,
  MIME_TYPES, APP_DIRS, SETTINGS_ALLOWED_KEYS,
} = require('./lib/constants');
const {
  createLogger, modelLabel, isUserSpeaker, safeSessionId,
  filterAllowedKeys, writeNDJsonLine, jsonError, ndjsonError, maskApiKey,
} = require('./lib/utils');
const settings = require('./lib/settings');
const llmPresets = require('./lib/llm-presets');
const installer = require('./lib/installer');

// ─── 常量 ──────────────────────────────────────────────
const PORT = parseInt(process.argv[2]) || DEFAULT_PORT;
const SAVES_DIR = path.join(__dirname, APP_DIRS.SAVES);
const UPLOADS_DIR = path.join(__dirname, APP_DIRS.UPLOADS);
const VOICE_DIR = path.join(__dirname, APP_DIRS.VOICE);

const pendingQuestions = new Map(); // qId -> { proc, res }
const log = createLogger('server');
const MIME = MIME_TYPES; // 向后兼容别名

// ─── 设置初始化 ─────────────────────────────────────────
settings.load(__dirname);
// 向后兼容：暴露 currentModel 变量（其他代码直接引用）
let currentModel = settings.getCurrentModel();
// 向后兼容函数别名
function buildEnv() { return settings.buildEnv(); }
function loadMakoSettings() { settings.load(__dirname); currentModel = settings.getCurrentModel(); }
function saveMakoSettings(s) { return settings.save(__dirname, s); }

// 确保目录存在
function ensureAppDirs() {
  const dirs = [SAVES_DIR, UPLOADS_DIR, VOICE_DIR];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}
ensureAppDirs();

// ─── 存档 API ────────────────────────────────────────
function listSaves(res) {
  fs.readdir(SAVES_DIR, (err, files) => {
    if (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "读取存档目录失败" }));
      return;
    }
    const saves = [];
    let pending = files.filter(f => f.endsWith(".json")).length;
    if (pending === 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([]));
      return;
    }
    files.filter(f => f.endsWith(".json")).forEach(file => {
      fs.readFile(path.join(SAVES_DIR, file), "utf8", (err, data) => {
        pending--;
        if (!err) {
          try {
            const save = JSON.parse(data);
            saves.push({
              id: save.id,
              title: save.title || "无标题",
              createdAt: save.createdAt,
              updatedAt: save.updatedAt,
              messageCount: (save.history || []).length,
            });
          } catch {}
        }
        if (pending === 0) {
          saves.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(saves));
        }
      });
    });
  });
}

function loadSave(res, id) {
  const filePath = path.join(SAVES_DIR, `${id}.json`);
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "存档不存在" }));
      return;
    }
    try {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ error: "存档损坏" }));
    }
  });
}

function saveGame(res, data) {
  if (!data.id) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "缺少存档 ID" }));
    return;
  }
  const filePath = path.join(SAVES_DIR, `${data.id}.json`);
  const saveData = {
    ...data,
    updatedAt: new Date().toISOString(),
    createdAt: data.createdAt || new Date().toISOString(),
  };
  fs.writeFile(filePath, JSON.stringify(saveData, null, 2), "utf8", (err) => {
    if (err) {
      log(`Save error: ${err.message}`);
      res.writeHead(500);
      res.end(JSON.stringify({ error: "保存失败" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
}

function deleteSave(res, id) {
  const filePath = path.join(SAVES_DIR, `${id}.json`);
  fs.unlink(filePath, (err) => {
    if (err) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "存档不存在" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
}

// ─── HTTP 服务器 ─────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:8080");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // ── GET / HEAD ──
  if (req.method === "GET" || req.method === "HEAD") {
    const isHead = req.method === "HEAD";
    // 快捷指令列表
    if (url.pathname === "/api/commands") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getCommands()));
      return;
    }

    // LLM 供应商预设列表
    if (url.pathname === "/api/llm-presets") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(llmPresets.getAllPresets()));
      return;
    }

    // 健康检查
    if (url.pathname === "/api/projects" || url.pathname === "/api/projects/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ projects: [] }));
      return;
    }

    // 读取当前模型
    if (url.pathname === "/api/model") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: currentModel, label: modelLabel(currentModel) }));
      return;
    }

    // 读取茉子设置
    if (url.pathname === "/api/mako-settings") {
      const safe = settings.getAll(true); // true = 脱敏 API Key
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(safe));
      return;
    }

    // 列出存档
    if (url.pathname === "/api/saves") {
      listSaves(res);
      return;
    }

    // 加载存档 /api/saves/:id
    const saveMatch = url.pathname.match(/^\/api\/saves\/([a-zA-Z0-9_-]+)$/);
    if (saveMatch) {
      loadSave(res, saveMatch[1]);
      return;
    }

    // 版本信息
    if (url.pathname === "/api/version") {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version: pkg.version || '1.0.0' }));
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version: '1.0.0' }));
      }
      return;
    }

    // 打开 skills 文件夹（浏览器模式回退）
    if (url.pathname === "/api/open-skills-folder") {
      const skillsDir = path.join(require('os').homedir(), '.claude', 'skills');
      try {
        if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
        const { exec } = require('child_process');
        exec(`explorer.exe "${skillsDir}"`, (err) => {
          if (err) log(`open-skills-folder error: ${err.message}`);
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: skillsDir }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // 打开 plugins 文件夹（浏览器模式回退）
    if (url.pathname === "/api/open-plugins-folder") {
      const pluginsDir = path.join(require('os').homedir(), '.claude', 'plugins');
      try {
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
        const { exec } = require('child_process');
        exec(`explorer.exe "${pluginsDir}"`, (err) => {
          if (err) log(`open-plugins-folder error: ${err.message}`);
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: pluginsDir }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // 读取茉子人设（CLAUDE.md + SKILL.md）
    if (url.pathname === "/api/persona") {
      const personaFile = path.join(__dirname, 'CLAUDE.md');
      const skillFile = path.join(__dirname, '.claude', 'skills', 'mako-lore', 'SKILL.md');
      try {
        const result = {};
        if (fs.existsSync(personaFile)) result.persona = fs.readFileSync(personaFile, 'utf8');
        if (fs.existsSync(skillFile)) result.lore = fs.readFileSync(skillFile, 'utf8');
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...result }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // 获取已保存的语音文件 /api/voice/:voiceId
    const voiceMatch = url.pathname.match(/^\/api\/voice\/([a-zA-Z0-9_-]+)$/);
    if (voiceMatch) {
      const voiceFile = path.join(VOICE_DIR, `${voiceMatch[1]}.wav`);
      fs.readFile(voiceFile, (err, data) => {
        if (err) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "语音文件不存在" }));
          return;
        }
        res.writeHead(200, {
          "Content-Type": "audio/wav",
          "Cache-Control": "public, max-age=31536000",
          "Content-Length": data.length,
        });
        res.end(data);
      });
      return;
    }

    // 静态文件 — 用 decodeURIComponent 解码路径（处理日文文件名）
    let rawPath = (req.url || "/").split("?")[0].split("#")[0];
    let filePath;
    try { filePath = decodeURIComponent(rawPath); }
    catch (e) { res.writeHead(400); res.end("Bad Request"); return; }
    if (filePath === "/") filePath = "/galchat.html";
    let safePath = path.normalize(filePath).replace(/^[/\\]+/, "");
    if (safePath.includes("..")) { res.writeHead(403); res.end("Forbidden"); return; }

    let fullPath = path.join(__dirname, safePath);
    fs.readFile(fullPath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') log(`404: ${safePath} → ${fullPath}`);
        res.writeHead(404); res.end("Not Found"); return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-cache",
      });
      res.end(isHead ? undefined : data);
    });
    return;
  }

  // ── POST ──
  if (req.method === "POST") {
    // TTS 语音（打包版：仅返回预生成问候语音文件，不调用 GPT-SoVITS）
    if (url.pathname === "/api/tts") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { text } = JSON.parse(body);
          if (!text) { jsonError(res, "缺少 text 参数"); return; }
          // 尝试匹配预生成语音（assets/voice/greet_NN.wav）
          const greetMatch = text.match(/greet_(\d{2})\.wav$/);
          let voicePath = null;
          if (greetMatch) {
            voicePath = path.join(__dirname, "assets", "voice", `greet_${greetMatch[1]}.wav`);
          }
          // 也检查 voice-data 缓存目录
          if (!voicePath || !fs.existsSync(voicePath)) {
            const cachePath = path.join(VOICE_DIR, `${crypto.createHash("md5").update(text).digest("hex").substring(0, 7)}.wav`);
            if (fs.existsSync(cachePath)) voicePath = cachePath;
          }
          if (voicePath && fs.existsSync(voicePath)) {
            const stat = fs.statSync(voicePath);
            res.writeHead(200, {
              "Content-Type": "audio/wav",
              "Content-Length": stat.size,
              "Cache-Control": "public, max-age=3600",
            });
            fs.createReadStream(voicePath).pipe(res);
          } else {
            // 无预生成语音 → 返回 404（前端静默处理）
            res.writeHead(404);
            res.end("No pre-generated voice available");
          }
        } catch { jsonError(res, "JSON 格式错误"); }
      });
      return;
    }

    // 聊天
    if (url.pathname === "/api/chat") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { message, sessionId, allowedTools, permissionMode, uploadedFiles, history } = JSON.parse(body);
          let prompt = (message || "").trim();

          // ═══════════════════════════════════════════════════════
          // Token 优化: 分层历史注入
          // 原因: --session-id 在 spawn/kill 循环中不可靠，必须手动维护上下文
          // 策略: 最近 10 轮原文 + 10 轮以前压缩为摘要（不丢记忆，但省 token）
          // ═══════════════════════════════════════════════════════
          if (history && history.length > 0) {
            const RECENT_WINDOW = 10; // 保留最近 N 轮完整对话
            if (history.length <= RECENT_WINDOW) {
              // 短对话：全部保留原文
              const historyCtx = history.map(h => {
                const isUser = h.speaker === '主人' || h.speaker === '用户' || h.speaker === '玩家';
                return isUser ? `玩家：${h.text}` : `茉子：${h.text}`;
              }).join('\n');
              prompt = `以下是你（茉子）与玩家之前的对话记录，请记住这些上下文，继续保持角色：\n\n${historyCtx}\n\n---\n玩家刚刚说：${prompt}`;
            } else {
              // 长对话：最近 10 轮原文 + 早期压缩
              const oldHistory = history.slice(0, -RECENT_WINDOW);
              const recentHistory = history.slice(-RECENT_WINDOW);
              // 压缩早期对话为简短摘要（减少 token，但不丢话题脉络）
              const oldSummary = oldHistory.map(h => {
                const isUser = h.speaker === '主人' || h.speaker === '用户' || h.speaker === '玩家';
                const preview = h.text.length > 60 ? h.text.substring(0, 60) + '…' : h.text;
                return isUser ? `玩家说了：「${preview}」` : `茉子回应了：「${preview}」`;
              }).join('\n');
              const recentCtx = recentHistory.map(h => {
                const isUser = h.speaker === '主人' || h.speaker === '用户' || h.speaker === '玩家';
                return isUser ? `玩家：${h.text}` : `茉子：${h.text}`;
              }).join('\n');
              prompt = `以下是你（茉子）与玩家之前的对话记录。\n\n【早期对话摘要】\n${oldSummary}\n\n【最近对话（请重点记住）】\n${recentCtx}\n\n---\n玩家刚刚说：${prompt}`;
            }
          }
          // 模型切换指令：/model flash 或 /model pro
          const modelMatch = prompt.match(/^\/model\s+(pro|flash)$/i);
          if (modelMatch) {
            const target = modelMatch[1].toLowerCase();
            currentModel = target === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';
            log(`Model switched to: ${currentModel} (via chat command)`);
            res.writeHead(200, {
              "Content-Type": "application/x-ndjson",
              "Cache-Control": "no-cache",
            });
            writeLine(res, { type: 'claude_json', data: {
              type: 'assistant', message: { content: [{ type: 'text', text: `🔀 模型已切换至 **${modelLabel(currentModel)}**，下条消息生效。` }] }
            }});
            writeLine(res, { type: 'done' });
            res.end();
            return;
          }
          // ═══════════════════════════════════════════════════════
          // 茉子人设注入：新会话（history为空）时加载 CLAUDE.md + SKILL.md
          // 原因: --input-format stream-json + sdk-ts 模式下 claude.exe 不会自动读取 CLAUDE.md
          // 策略: 仅在首条消息注入，后续复用 session 上下文以节省 token
          // ═══════════════════════════════════════════════════════
          if (!history || history.length === 0) {
            try {
              const personaParts = [];
              // 读取 CLAUDE.md（角色主设定）
              const personaFile = path.join(__dirname, 'CLAUDE.md');
              if (fs.existsSync(personaFile)) {
                let content = fs.readFileSync(personaFile, 'utf8').trim();
                // 移除「使用 Skill 工具加载 mako-lore」的提示（因为下面直接注入了 SKILL.md 内容）
                content = content.replace(
                  /> ⚠️ \*\*启动时使用 Skill 工具加载 `mako-lore`\*\* — 包含穗织世界观、神话诅咒、身边人物、API速查表。这些是你的背景知识，对话中随时可能用到。\n?/g,
                  ''
                );
                if (content) personaParts.push(content);
              }
              // 读取 SKILL.md（世界观/背景知识）
              const skillFile = path.join(__dirname, '.claude', 'skills', 'mako-lore', 'SKILL.md');
              if (fs.existsSync(skillFile)) {
                let content = fs.readFileSync(skillFile, 'utf8');
                // 去掉 YAML frontmatter (--- 之间的内容)
                content = content.replace(/^---[\s\S]*?---\n?/, '').trim();
                if (content) personaParts.push('# 世界观与背景知识\n' + content);
              }
              if (personaParts.length > 0) {
                prompt = personaParts.join('\n\n---\n\n') + '\n\n---\n\n' + prompt;
                log(`Persona injected (${(prompt.length / 1024).toFixed(1)}KB, new session)`);
              }
            } catch (e) {
              log(`Failed to load persona: ${e.message}`);
            }
          }

          // 如果有上传文件，在 prompt 中附加文件路径信息
          if (uploadedFiles && uploadedFiles.length > 0) {
            const fileList = uploadedFiles.map(f => `- ${f.path}`).join('\n');
            prompt = `${prompt}\n\n[用户上传了以下文件，请先使用 Read 工具逐个读取所有文件的内容，再根据文件内容回答用户的问题：]\n${fileList}`;
          }
          if (!prompt) {
            endWithError(res, "消息内容为空");
            return;
          }
          log(`Chat: ${prompt.substring(0, 120)}...`);
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          streamChat(res, prompt, sessionId, allowedTools, permissionMode);
        } catch (e) {
          log(`Parse error: ${e.message}`);
          endWithError(res, "请求体 JSON 格式错误");
        }
      });
      return;
    }

    // 问题回答
    if (url.pathname === "/api/respond") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { qId, answer } = JSON.parse(body);
          const entry = pendingQuestions.get(qId);
          if (entry && entry.proc.exitCode === null) {
            // 将前端传来的 1-based 索引映射为选项的实际值
            const idx = parseInt(answer) - 1;
            const question = entry.question;
            let answerValue = answer; // 默认直接用前端传的值
            if (question && question.optionsRaw && idx >= 0 && idx < question.optionsRaw.length) {
              const rawOpt = question.optionsRaw[idx];
              // rawOpt 可能是 {label, value} 对象，也可能是字符串
              if (typeof rawOpt === 'object' && rawOpt !== null && rawOpt.value) {
                answerValue = rawOpt.value;
              } else if (typeof rawOpt === 'string') {
                answerValue = rawOpt;
              }
            }
            log(`Question answered: idx=${idx}, value="${answerValue}" (raw=${answer})`);
            // 以 stream-json 用户消息格式写回 stdin，Claude 读取作为权限回答
            const respMsg = JSON.stringify({ type: "user", message: { role: "user", content: answerValue } });
            entry.proc.stdin.write(respMsg + "\n");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "question not found or process ended" }));
          }
        } catch {
          jsonError(res, "JSON 格式错误");
        }
      });
      return;
    }

    // 切换模型
    if (url.pathname === "/api/model") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { model } = JSON.parse(body);
          if (model === "flash" || model === "deepseek-v4-flash") {
            currentModel = "deepseek-v4-flash";
          } else if (model === "pro" || model === "deepseek-v4-pro") {
            currentModel = "deepseek-v4-pro";
          } else {
            jsonError(res, "未知模型，可选 flash / pro");
            return;
          }
          log(`Model switched to: ${currentModel}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ model: currentModel, label: modelLabel(currentModel) }));
        } catch {
          jsonError(res, "JSON 格式错误");
        }
      });
      return;
    }

    // 保存茉子人设
    if (url.pathname === "/api/persona") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { persona, lore } = JSON.parse(body);
          const personaFile = path.join(__dirname, 'CLAUDE.md');
          const skillFile = path.join(__dirname, '.claude', 'skills', 'mako-lore', 'SKILL.md');
          let saved = false;
          if (persona !== undefined && persona !== null) {
            const personaDir = path.dirname(personaFile);
            if (!fs.existsSync(personaDir)) fs.mkdirSync(personaDir, { recursive: true });
            fs.writeFileSync(personaFile, persona, 'utf8');
            saved = true;
          }
          if (lore !== undefined && lore !== null) {
            const loreDir = path.dirname(skillFile);
            if (!fs.existsSync(loreDir)) fs.mkdirSync(loreDir, { recursive: true });
            fs.writeFileSync(skillFile, lore, 'utf8');
            saved = true;
          }
          log('Persona files saved');
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          log(`Persona save error: ${e.message}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    // 保存茉子设置
    if (url.pathname === "/api/mako-settings") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const settings = JSON.parse(body);
          // 只允许白名单中的字段
          const allowed = [
            "ANTHROPIC_BASE_URL",
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "CLAUDE_CODE_SUBAGENT_MODEL",
            "CLAUDE_CODE_EFFORT_LEVEL",
          ];
          const filtered = {};
          for (const key of allowed) {
            if (settings[key] !== undefined) {
              filtered[key] = String(settings[key]).trim();
            }
          }
          if (saveMakoSettings(filtered)) {
            // 如果修改了 ANTHROPIC_MODEL，同步更新 currentModel
            if (filtered.ANTHROPIC_MODEL) {
              currentModel = filtered.ANTHROPIC_MODEL;
              log(`currentModel synced from settings: ${currentModel}`);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, model: currentModel, label: modelLabel(currentModel) }));
          } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "保存失败" }));
          }
        } catch {
          jsonError(res, "JSON 格式错误");
        }
      });
      return;
    }

    // 结束游戏（关闭服务器）
    if (url.pathname === "/api/quit") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      log("Quit requested — shutting down in 1s...");
      setTimeout(() => process.exit(0), 1000);
      return;
    }

    // 更新状态（从 .update-status.json 读取，由 Electron 主进程写入）
    if (url.pathname === "/api/update/status") {
      const updateFile = path.join(__dirname, '.update-status.json');
      try {
        if (fs.existsSync(updateFile)) {
          const data = JSON.parse(fs.readFileSync(updateFile, 'utf8'));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(data));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ state: 'idle', version: null, progress: 0, error: null }));
        }
      } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ state: 'idle' }));
      }
      return;
    }

    // 文件上传
    if (url.pathname === "/api/upload") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          handleUpload(res, JSON.parse(body));
        } catch {
          jsonError(res, "JSON 格式错误");
        }
      });
      return;
    }

    // ── 首次配置向导 API ──

    // 检查命令是否存在
    if (url.pathname === "/api/check-command") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { command } = JSON.parse(body);
          // 使用 where 命令检查（Windows）
          const check = spawn("cmd.exe", ["/d", "/c", "where", command || "", "2>nul"]);
          let out = "";
          check.stdout.on("data", (d) => (out += d.toString()));
          check.on("close", (code) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ found: code === 0, command }));
          });
        } catch { jsonError(res, "JSON 格式错误"); }
      });
      return;
    }

    // 安装 Claude Code
    if (url.pathname === "/api/install-claude-code") {
      req.on("data", () => {});
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        const install = spawn("cmd.exe", ["/d", "/c", "npm", "install", "-g", "@anthropic-ai/claude-code"], {
          stdio: ["pipe", "pipe", "pipe"],
        });
        let out = "", err = "";
        install.stdout.on("data", (d) => (out += d.toString()));
        install.stderr.on("data", (d) => (err += d.toString()));
        install.on("close", (code) => {
          res.end(JSON.stringify({ ok: code === 0, output: out + err }));
        });
        install.on("error", (e) => {
          res.end(JSON.stringify({ ok: false, output: e.message }));
        });
      });
      return;
    }

    // 后台静默安装 Node.js / Git（从 bundled-tools 嵌入包）
    if (url.pathname === "/api/install-tools") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { tools } = JSON.parse(body); // tools: ["node", "git"]
          if (!tools || !Array.isArray(tools) || tools.length === 0) {
            jsonError(res, "缺少 tools 参数");
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-cache",
          });
          installer.installToolsStreaming(res, __dirname, tools);
        } catch { jsonError(res, "JSON 格式错误"); }
      });
      return;
    }
    if (url.pathname === "/api/save-settings") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const settings = JSON.parse(body);
          const allowed = [
            "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL",
          ];
          const filtered = {};
          for (const key of allowed) {
            if (settings[key] !== undefined) {
              filtered[key] = String(settings[key]).trim();
            }
          }
          const ok = saveMakoSettings(filtered);
          if (filtered.ANTHROPIC_MODEL) currentModel = filtered.ANTHROPIC_MODEL;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok }));
        } catch { jsonError(res, "JSON 格式错误"); }
      });
      return;
    }

    // 测试 API 连接
    if (url.pathname === "/api/test-connection") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const { endpoint, key, model } = JSON.parse(body);
          let baseUrl = (endpoint || "https://api.deepseek.com").replace(/\/+$/, "");
          // 去掉 /anthropic 后缀 — Claude Code 用兼容端点，但测试必须用 OpenAI 原生 /v1/chat/completions
          const apiBase = baseUrl.replace(/\/anthropic\/?$/, '');
          const testUrl = `${apiBase}/v1/chat/completions`;
          const postData = JSON.stringify({
            model: model || "deepseek-chat",
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          });

          const https = require("https");
          const httpMod = require("http");
          const mod = testUrl.startsWith("https") ? https : httpMod;
          const req2 = mod.request(testUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`,
              "Content-Length": Buffer.byteLength(postData),
            },
            timeout: 15000,
          }, (apiRes) => {
            let data2 = "";
            apiRes.on("data", (d) => (data2 += d));
            apiRes.on("end", () => {
              res.writeHead(200, { "Content-Type": "application/json" });
              if (apiRes.statusCode === 200) {
                res.end(JSON.stringify({ ok: true, message: "API 连接正常！茉子可以正常运转啦～" }));
              } else {
                let errMsg = `HTTP ${apiRes.statusCode}`;
                try {
                  const errJson = JSON.parse(data2);
                  if (errJson.error?.message) errMsg = errJson.error.message;
                } catch {}
                res.end(JSON.stringify({ ok: false, message: errMsg }));
              }
            });
          });
          req2.on("error", (e) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, message: `连接失败：${e.message}` }));
          });
          req2.on("timeout", () => {
            req2.destroy();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, message: "连接超时，请检查 API 地址是否正确" }));
          });
          req2.write(postData);
          req2.end();
        } catch (e) {
          jsonError(res, e.message);
        }
      });
      return;
    }

    // 标记首次配置完成
    if (url.pathname === "/api/finish-setup") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        // 默认保留所有安装包（安全默认值），只有用户明确取消勾选才删除
        let keepTools = ["node", "git"];
        try {
          const parsed = JSON.parse(body || "{}");
          if (Array.isArray(parsed.keepTools)) {
            keepTools = parsed.keepTools;
          }
        } catch {}
        // 清理未勾选的安装包
        installer.cleanupBundledTools(__dirname, keepTools);
        // 在 mako-settings.json 中写入标记
        settings.save(__dirname, { SETUP_COMPLETE: "true" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // 保存存档
    if (url.pathname === "/api/saves") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try { saveGame(res, JSON.parse(body)); }
        catch { jsonError(res, "JSON 格式错误"); }
      });
      return;
    }
  }

  // ── DELETE ──
  if (req.method === "DELETE") {
    const delMatch = url.pathname.match(/^\/api\/saves\/([a-zA-Z0-9_-]+)$/);
    if (delMatch) {
      deleteSave(res, delMatch[1]);
      return;
    }
  }

  res.writeHead(404);
  res.end("Not Found");
});

// ─── 单次对话（--print 模式）─────────────────────────
function streamChat(res, prompt, sessionId, allowedTools, permissionMode) {
  const args = ["--output-format", "stream-json", "--verbose", "--input-format", "stream-json"];

  if (sessionId) {
    args.push("--session-id", sessionId);
  }

  if (allowedTools && allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(","));
  }

  if (permissionMode && permissionMode !== "default") {
    args.push("--permission-mode", permissionMode);
  }

  // --model 显式指定模型，优先级高于 settings.json 的 env.ANTHROPIC_MODEL
  args.push("--model", currentModel);
  args.push("--print");

  // Windows: spawn 无法直接运行 .cmd，需通过 cmd.exe /d /c 启动
  // 先尝试定位 claude.exe 真实路径，找不到则通过 cmd 兜底
  const npmDir = path.join(process.env.APPDATA || '', 'npm');
  const claudeExe = path.join(npmDir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  let claudeCmd, claudeArgs;
  if (fs.existsSync(claudeExe)) {
    // 直接调用 claude.exe（安全，不用 shell）
    claudeCmd = claudeExe;
    claudeArgs = args;
  } else {
    // 回退：通过 cmd.exe /d /c 调用 claude（保证 .cmd 能执行）
    claudeCmd = 'cmd.exe';
    claudeArgs = ['/d', '/c', 'claude', ...args];
  }

  log(`Spawning: ${claudeCmd} ${claudeArgs.join(" ")} (prompt via stdin, ${prompt.length} chars)`);

  const env = buildEnv();

  const proc = spawn(claudeCmd, claudeArgs, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // 注册待回答问题（供 /api/respond 使用）
  const qId = crypto.randomUUID();
  pendingQuestions.set(qId, { proc, res, question: null });

  // 客户端断开时杀死进程，防止会话锁定
  res.on('close', () => {
    pendingQuestions.delete(qId);
    if (proc.exitCode === null) {
      log('Client disconnected, killing claude process');
      proc.kill();
    }
  });

  // 发送 question ID 给前端（用于回答时关联）
  writeLine(res, { type: "gallm_init", qId });

  // 通过 stdin 发送 stream-json 格式的 prompt，不关闭 stdin（权限答案需回写）
  const stdinMsg = JSON.stringify({ type: "user", message: { role: "user", content: prompt } });
  proc.stdin.write(stdinMsg + "\n");
  // ⚠️ 不调用 proc.stdin.end() —— stdin 保持打开以接收权限问题的答案

  let lineCount = 0;
  let stderrData = "";
  let resultReceived = false;

  let stdoutBuf = "";
  proc.stdout.on("data", (data) => {
    stdoutBuf += data.toString("utf8");
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      lineCount++;
      try {
        const msg = JSON.parse(trimmed);
        writeLine(res, { type: "claude_json", data: msg });

        // 检测 result 消息 — Claude 完成本轮处理后关闭 stdin 让其退出
        if (msg.type === 'result') {
          resultReceived = true;
          if (!proc.stdin.destroyed) {
            proc.stdin.end();
          }
        }

        // 检测系统级问题/权限提示
        if (msg.type === 'system' && msg.subtype !== 'init') {
          const question = detectQuestion(msg);
          if (question) {
            // 存储问题数据，供 /api/respond 映射答案
            const entry = pendingQuestions.get(qId);
            if (entry) entry.question = question;
            writeLine(res, { type: "gallm_question", data: question });
          }
        }
      } catch {
        log(`Non-JSON: ${trimmed.substring(0, 200)}`);
        writeLine(res, { type: "raw", data: trimmed });
      }
    }
  });

  proc.stderr.on("data", (data) => {
    const str = data.toString("utf8");
    stderrData += str;
    process.stderr.write(str);  // 同步打到 go.bat 窗口
  });

  proc.on("close", (code) => {
    if (stdoutBuf.trim()) {
      try {
        const msg = JSON.parse(stdoutBuf.trim());
        writeLine(res, { type: "claude_json", data: msg });
        lineCount++;
      } catch {}
    }

    if (stderrData) {
      log(`Claude stderr:\n${stderrData}`);
      writeLine(res, { type: "stderr", data: stderrData });
    }

    log(`Process exited code=${code}, lines=${lineCount}`);

    if (lineCount === 0 && code !== 0) {
      const sessionInUse = stderrData && stderrData.includes('already in use');
      writeLine(res, {
        type: "claude_json",
        data: {
          type: "result",
          subtype: "error_during_execution",
          error: `claude exited with code ${code}` + (stderrData ? `\nstderr: ${stderrData.substring(0, 500)}` : ""),
          sessionInUse: !!sessionInUse,
        },
      });
    }

    writeLine(res, { type: "done" });
    res.end();
  });

  proc.on("error", (err) => {
    log(`Spawn error: ${err.message}`);
    writeLine(res, { type: "error", error: `无法启动: ${err.message}` });
    writeLine(res, { type: "done" });
    res.end();
  });
}

// ─── 工具函数（从 lib/utils.js 导入，保留向后兼容别名）─────
const writeLine = writeNDJsonLine;
const endWithError = ndjsonError;
// jsonError 直接从 utils 导入，已在上方解构

// ─── 快捷指令列表 ──────────────────────────────────────
const BUILTIN_COMMANDS = [
  // 内置斜杠命令
  { command: "/permission", description: "管理工具权限" },
  { command: "/btw", description: "发送旁白消息，不触发AI回复" },
  { command: "/clear", description: "清除对话历史" },
  { command: "/config", description: "查看和修改配置" },
  { command: "/model", description: "切换AI模型" },
  { command: "/fast", description: "切换快速模式" },
  { command: "/help", description: "查看帮助信息" },
  { command: "/init", description: "初始化项目 CLAUDE.md" },
  { command: "/review", description: "代码审查" },
  { command: "/security-review", description: "安全审查" },
  { command: "/simplify", description: "简化代码" },
  { command: "/verify", description: "验证代码变更" },
  { command: "/run", description: "启动并测试项目" },
  { command: "/loop", description: "循环执行命令" },
  // Skills
  { command: "/pdf", description: "处理PDF文件" },
  { command: "/xlsx", description: "处理Excel文件" },
  { command: "/pptx", description: "处理PowerPoint文件" },
  { command: "/docx", description: "处理Word文件" },
  { command: "/code-review", description: "代码审查 (skill)" },
  { command: "/scientific-writing", description: "科学写作辅助" },
  { command: "/literature-review", description: "文献综述" },
  { command: "/paper-lookup", description: "查找论文" },
  { command: "/deep-research", description: "深度研究报告" },
  { command: "/generate-image", description: "生成图片" },
  { command: "/exploratory-data-analysis", description: "探索性数据分析" },
  { command: "/statistical-analysis", description: "统计分析" },
  { command: "/scientific-visualization", description: "科学可视化" },
  { command: "/matplotlib", description: "Matplotlib 绘图" },
  { command: "/seaborn", description: "Seaborn 绘图" },
  { command: "/scikit-learn", description: "机器学习" },
  { command: "/pytorch-lightning", description: "PyTorch Lightning" },
  { command: "/markdown-mermaid-writing", description: "Mermaid 图表" },
  { command: "/exa-search", description: "深度搜索" },
];

function getCommands() {
  // 以后可以动态扫描 skills 目录来扩展
  return BUILTIN_COMMANDS;
}

// ─── 问题检测 ──────────────────────────────────────────
function detectQuestion(msg) {
  // Claude Code system 消息，可能包含权限/确认提示
  const text = msg.text || msg.prompt || msg.question || msg.message || '';
  const rawOptions = msg.options || [];
  if (text && rawOptions.length > 0) {
    // 规范化选项：Claude 可能发送 [{label, value}] 或 [string]
    // options: 显示用（字符串数组）
    // optionsRaw: 保留原始对象，供 /api/respond 取值用
    const options = rawOptions.map(o => typeof o === 'string' ? o : (o.label || o.value || String(o)));
    return { text, options, optionsRaw: rawOptions };
  }
  // 检查 assistant 消息中的 tool_use（需要权限的）
  if (msg.type === 'assistant' && msg.message?.type === 'tool_use') {
    return {
      text: `是否允许使用 "${msg.message.name}" 工具？`,
      options: ['允许 (yes)', '总是允许 (yes always)', '拒绝 (no)'],
      optionsRaw: [
        { label: '允许 (yes)', value: 'yes' },
        { label: '总是允许 (yes always)', value: 'yes-always' },
        { label: '拒绝 (no)', value: 'no' },
      ],
    };
  }
  return null;
}

// ─── 文件上传 ──────────────────────────────────────────
function handleUpload(res, body) {
  const { sessionId, files } = body;
  if (!sessionId || !files || !Array.isArray(files) || files.length === 0) {
    jsonError(res, "缺少 sessionId 或 files");
    return;
  }

  // 单次上传总大小限制 50MB
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
  let totalSize = 0;

  // 为每个会话创建子目录
  const sessionDir = path.join(UPLOADS_DIR, sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"));
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const results = [];
  for (const f of files) {
    if (!f.name || !f.data) continue;
    // 安全文件名
    const safeName = f.name.replace(/[\\/:*?"<>|]/g, "_");
    const filePath = path.join(sessionDir, safeName);
    try {
      const buf = Buffer.from(f.data, "base64");
      totalSize += buf.length;
      if (totalSize > MAX_UPLOAD_SIZE) {
        jsonError(res, "上传文件总大小超过 50MB 限制");
        return;
      }
      fs.writeFileSync(filePath, buf);
      results.push({ name: f.name, path: filePath, type: f.type, size: buf.length });
      log(`Uploaded: ${filePath} (${buf.length} bytes)`);
    } catch (e) {
      log(`Upload error: ${e.message}`);
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, files: results }));
}

// ─── 后台静默安装 Node.js / Git ──────────────────────
// 已提取至 lib/installer.js，通过 installer 模块调用
// installer.installToolsStreaming(res, __dirname, tools)
// installer.cleanupBundledTools(appDir, keepTools)

// ─── 启动 ────────────────────────────────────────────
server.listen(PORT, "127.0.0.1", () => {
  log("✦ MakoCode 后端已启动 ✦");
  log(`  地址: http://127.0.0.1:${PORT}`);
  log(`  模型: ${currentModel} (${modelLabel(currentModel)})`);
  log(`  存档: ${SAVES_DIR}`);
  log("");
});
