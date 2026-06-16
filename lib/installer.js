/**
 * MakoCode 工具安装模块
 * 从 server.js 提取，负责 Node.js / Git / Claude Code 的后台静默安装
 *
 * 职责：
 * - 查找嵌入的安装包（bundled-tools 目录）
 * - 逐工具静默安装（Node.js MSI / Git EXE / Claude Code npm）
 * - NDJSON 流式输出安装进度
 * - 安装完成后清理未勾选的安装包
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const { writeNDJsonLine } = require('./utils');
const { APP_DIRS } = require('./constants');

// ─── 工具函数 ──────────────────────────────────────────

function checkCommandExists(cmd) {
  try {
    const result = require('child_process').spawnSync("cmd.exe", ["/d", "/c", "where", cmd, "2>nul"]);
    return result.status === 0;
  } catch { return false; }
}

/**
 * 清理未勾选的安装包文件
 * @param {string} appDir - 应用目录
 * @param {string[]} keepTools - 用户勾选保留的工具列表 ["node", "git"]
 */
function cleanupBundledTools(appDir, keepTools) {
  const toolsDir = path.join(appDir, APP_DIRS.BUNDLED_TOOLS);
  try {
    if (!fs.existsSync(toolsDir)) return;
    const files = fs.readdirSync(toolsDir);
    for (const f of files) {
      const fullPath = path.join(toolsDir, f);
      let shouldDelete = false;
      if (f.startsWith("node-") && f.endsWith(".msi") && !keepTools.includes("node")) {
        shouldDelete = true;
      } else if (f.startsWith("Git-") && f.endsWith(".exe") && !keepTools.includes("git")) {
        shouldDelete = true;
      }
      if (shouldDelete) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) { /* ignore */ }
      }
    }
    const remaining = fs.readdirSync(toolsDir);
    if (remaining.length === 0) {
      fs.rmdirSync(toolsDir);
    }
  } catch { /* ignore */ }
}

/**
 * NDJSON 流式安装工具（用于 server.js HTTP 响应）
 * @param {http.ServerResponse} res - HTTP 响应对象
 * @param {string} appDir - 应用目录
 * @param {string[]} tools - 待安装的工具列表
 */
function installToolsStreaming(res, appDir, tools) {
  const toolsDir = path.join(appDir, APP_DIRS.BUNDLED_TOOLS);
  const installers = [];

  // 确保 node 在 claude 之前（Claude Code 需要 npm）
  const sortedTools = [...tools].sort((a, b) => {
    if (a === 'node' && b === 'claude') return -1;
    if (a === 'claude' && b === 'node') return 1;
    return 0;
  });

  for (const tool of sortedTools) {
    if (tool === "node") {
      if (checkCommandExists("node")) {
        writeNDJsonLine(res, { type: "install_status", tool: "node", status: "done", message: "Node.js 已安装，跳过" });
        continue;
      }
      try {
        const files = fs.readdirSync(toolsDir);
        const nodeMsi = files.find(f => f.startsWith("node-") && f.endsWith(".msi"));
        if (nodeMsi) {
          installers.push({ tool: "node", path: path.join(toolsDir, nodeMsi) });
        } else {
          writeNDJsonLine(res, { type: "install_status", tool: "node", status: "skip", message: "Node.js 安装包未找到（未嵌入）" });
        }
      } catch {
        writeNDJsonLine(res, { type: "install_status", tool: "node", status: "skip", message: "bundled-tools 目录不存在" });
      }
    } else if (tool === "git") {
      if (checkCommandExists("git")) {
        writeNDJsonLine(res, { type: "install_status", tool: "git", status: "done", message: "Git 已安装，跳过" });
        continue;
      }
      try {
        const files = fs.readdirSync(toolsDir);
        const gitExe = files.find(f => f.startsWith("Git-") && f.endsWith(".exe"));
        if (gitExe) {
          installers.push({ tool: "git", path: path.join(toolsDir, gitExe) });
        } else {
          writeNDJsonLine(res, { type: "install_status", tool: "git", status: "skip", message: "Git 安装包未找到（未嵌入）" });
        }
      } catch {
        writeNDJsonLine(res, { type: "install_status", tool: "git", status: "skip", message: "bundled-tools 目录不存在" });
      }
    } else if (tool === "claude") {
      if (checkCommandExists("claude")) {
        writeNDJsonLine(res, { type: "install_status", tool: "claude", status: "done", message: "Claude Code 已安装，跳过" });
        continue;
      }
      installers.push({ tool: "claude", path: "cmd.exe" });
    }
  }

  if (installers.length === 0) {
    writeNDJsonLine(res, { type: "install_done", message: "没有需要安装的工具" });
    res.end();
    return;
  }

  let idx = 0;
  function installNext() {
    if (idx >= installers.length) {
      writeNDJsonLine(res, { type: "install_done", message: "全部安装完成！" });
      res.end();
      return;
    }
    const item = installers[idx];
    writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "installing", message: `正在安装 ${item.tool}...` });

    let child;
    try {
      if (item.tool === "node") {
        if (!fs.existsSync(item.path)) {
          writeNDJsonLine(res, { type: "install_status", tool: "node", status: "error", message: `安装包不存在: ${item.path}` });
          idx++; installNext(); return;
        }
        const psCmd = `$p=Start-Process -FilePath msiexec -ArgumentList '/i','${item.path.replace(/\\/g, '\\\\')}','/qn','/norestart' -Wait -Verb RunAs -PassThru; exit $p.ExitCode`;
        child = spawn("powershell.exe", ["-NoProfile", "-Command", psCmd], { stdio: ["ignore", "pipe", "pipe"] });
      } else if (item.tool === "git") {
        if (!fs.existsSync(item.path)) {
          writeNDJsonLine(res, { type: "install_status", tool: "git", status: "error", message: `安装包不存在: ${item.path}` });
          idx++; installNext(); return;
        }
        const psCmd = `$p=Start-Process -FilePath '${item.path.replace(/\\/g, '\\\\')}' -ArgumentList '/VERYSILENT','/NORESTART','/DIR=C:\\Program Files\\Git' -Wait -Verb RunAs -PassThru; exit $p.ExitCode`;
        child = spawn("powershell.exe", ["-NoProfile", "-Command", psCmd], { stdio: ["ignore", "pipe", "pipe"] });
      } else if (item.tool === "claude") {
        const nodejsDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs');
        const extraPath = nodejsDir + path.delimiter + (process.env.PATH || '');
        child = spawn("cmd.exe", ["/d", "/c", "npm", "install", "-g", "@anthropic-ai/claude-code"], {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, PATH: extraPath },
        });
      }
    } catch (spawnErr) {
      writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "error", message: `启动安装失败: ${spawnErr.message}` });
      idx++; installNext(); return;
    }

    if (!child) {
      writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "error", message: `无法启动 ${item.tool} 安装程序` });
      idx++; installNext(); return;
    }

    let stderrData = "";
    child.stderr.on("data", (d) => { stderrData += d.toString(); });
    child.on("close", (code) => {
      if (code === 0 || code === 3010) {
        writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "done", message: `${item.tool} 安装完成${code === 3010 ? '（重启后生效）' : ''}` });
      } else {
        writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "error", message: `${item.tool} 安装失败 (exit ${code}): ${stderrData.substring(0, 200)}` });
      }
      idx++;
      installNext();
    });
    child.on("error", (err) => {
      writeNDJsonLine(res, { type: "install_status", tool: item.tool, status: "error", message: `${item.tool} 安装出错: ${err.message}` });
      idx++;
      installNext();
    });
  }
  installNext();
}

module.exports = {
  checkCommandExists,
  cleanupBundledTools,
  installToolsStreaming,
};
