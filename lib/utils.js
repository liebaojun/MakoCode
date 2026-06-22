/**
 * MakoCode 共享工具函数
 * 从 server.js 和 electron-main.js 中提取
 */

const { DEFAULT_PRO_MODEL, DEFAULT_MODEL } = require('./constants');

// ─── 日志（统一格式）────────────────────────────────────
function createLogger(prefix) {
  return function log(msg) {
    process.stderr.write(`[${prefix}] ${msg}\n`);
  };
}

// ─── 模型标签 ──────────────────────────────────────────
function modelLabel(m) {
  const flashModel = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const proModel = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || DEFAULT_PRO_MODEL;
  const normalized = (m || '').toLowerCase();
  if (normalized === proModel.toLowerCase() && normalized !== flashModel.toLowerCase()) return "Pro";
  return "Flash";
}

// ─── 用户发言检测 ──────────────────────────────────────
const USER_SPEAKER_LABELS = ['主人', '用户', '玩家'];
function isUserSpeaker(speaker) {
  return USER_SPEAKER_LABELS.includes(speaker);
}

// ─── 安全文件名清理 ────────────────────────────────────
function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

// ─── 安全会话ID清理 ────────────────────────────────────
function safeSessionId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ─── 文本预览截断 ──────────────────────────────────────
function truncateText(text, maxLen = 60) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

// ─── 确保目录存在 ──────────────────────────────────────
function ensureDir(fs, dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ─── JSON安全解析 ──────────────────────────────────────
function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// ─── JSON安全读取文件 ──────────────────────────────────
function safeJsonRead(fs, filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── 设置字段过滤（白名单模式）─────────────────────────
function filterAllowedKeys(input, allowedKeys) {
  const filtered = {};
  for (const key of allowedKeys) {
    if (input[key] !== undefined) {
      filtered[key] = String(input[key]).trim();
    }
  }
  return filtered;
}

// ─── NDJSON 写入辅助 ────────────────────────────────────
function writeNDJsonLine(res, obj) {
  try { res.write(JSON.stringify(obj) + "\n"); } catch {}
}

// ─── HTTP 错误响应 ──────────────────────────────────────
function jsonError(res, msg, statusCode = 400) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

// ─── HTTP NDJSON 错误 ──────────────────────────────────
function ndjsonError(res, msg) {
  res.writeHead(200, { "Content-Type": "application/x-ndjson" });
  writeNDJsonLine(res, { type: "error", error: msg });
  writeNDJsonLine(res, { type: "done" });
  res.end();
}

// ─── API Key 脱敏 ──────────────────────────────────────
function maskApiKey(token) {
  if (!token || token.length <= 8) return token;
  return token.substring(0, 4) + "****" + token.slice(-4);
}

module.exports = {
  createLogger,
  modelLabel,
  isUserSpeaker,
  safeFilename,
  safeSessionId,
  truncateText,
  ensureDir,
  safeJsonParse,
  safeJsonRead,
  filterAllowedKeys,
  writeNDJsonLine,
  jsonError,
  ndjsonError,
  maskApiKey,
};
