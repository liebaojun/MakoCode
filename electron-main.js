/**
 * MakoCode Electron 主进程
 * - 启动 server.js 后端
 * - 创建窗口加载 galchat.html
 * - 管理应用生命周期
 * - 自动更新（electron-updater + NSIS 静默安装）
 *
 * ⚠️ 防递归设计：
 *   子进程通过 MAKO_SERVER_MODE=1 环境变量标记，只运行 server.js，
 *   不创建任何 BrowserWindow。这防止了 spawn(process.execPath) → 递归启动
 *   Electron → 再 spawn → 再启动 的无限循环（fork bomb）。
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ─── 导入共享模块 ──────────────────────────────────────
const { DEFAULT_PORT, WINDOW_DEFAULTS, UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_INTERVAL_MS } = require('./lib/constants');
const { createLogger } = require('./lib/utils');
const log = createLogger('MakoCode');

let autoUpdater = null; // lazy init in normal Electron mode

// ═══════════════════════════════════════════════════════════
// 🔒 服务模式检测 — 必须在所有 Electron 逻辑之前执行
// ═══════════════════════════════════════════════════════════

if (process.env.MAKO_SERVER_MODE === '1') {
  // ── 纯 HTTP 服务模式（无 GUI）──────────────────────
  // 被父进程通过 spawn(process.execPath) 启动，
  // 只运行 server.js，不创建任何窗口
  const serverPath = path.join(__dirname, 'server.js');
  if (fs.existsSync(serverPath)) {
    require(serverPath);
    // server.js 调用 server.listen() 保持事件循环存活
    // 永远不执行 app.whenReady()，不创建 BrowserWindow
  } else {
    console.error('[MakoCode] Server mode: server.js not found');
    process.exit(1);
  }
  // ⚠️ 关键：到这里后 module 顶层代码执行完毕，进程靠 server.listen() 存活
  // 下面的所有 Electron 初始化代码都不会执行
} else {

// ═══════════════════════════════════════════════════════════
// 🖥️ 正常 Electron 应用模式
// ═══════════════════════════════════════════════════════════

// ─── 路径配置 ────────────────────────────────────────
// asar: false → 所有文件均在 __dirname 下，无需区分 dev/packaged
const APP_DIR = __dirname;
const SERVER_PORT = DEFAULT_PORT;
const MAIN_URL = `http://127.0.0.1:${SERVER_PORT}`;

// ─── 状态 ────────────────────────────────────────────
let serverProc = null;
let mainWindow = null;
let serverReady = false;

// ─── 清理旧进程 ──────────────────────────────────────
// Windows 上 SIGTERM 不可靠，必须用 taskkill /F /T 杀整个进程树
function killServerProc() {
  if (serverProc && serverProc.exitCode === null) {
    try {
      // /F = 强制 /T = 进程树（含孙进程如 claude.exe）
      spawnSync('taskkill', ['/PID', String(serverProc.pid), '/F', '/T'], { stdio: 'pipe' });
      log(`Server process tree killed`);
    } catch {}
  }
}

function killOldServer() {
  try {
    const result = spawnSync('cmd.exe', [
      '/d', '/c',
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr ":${SERVER_PORT}.*LISTENING" 2^>nul') do taskkill /PID %a /F /T 2>nul`
    ], { stdio: 'pipe', timeout: 10000 });
    if (result.stdout && result.stdout.toString().trim()) {
      log(`Killed old process on port ${SERVER_PORT}`);
    }
  } catch {}
}

// ─── 启动 server.js ─────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(APP_DIR, 'server.js');
    if (!fs.existsSync(serverPath)) {
      reject(new Error(`server.js not found at ${serverPath}`));
      return;
    }

    // 先清理旧进程，避免 EADDRINUSE
    killOldServer();
    log(`Starting server in child process`);

    // 读取 mako-settings.json 中的环境变量设置
    const settingsPath = path.join(APP_DIR, 'mako-settings.json');
    let envSettings = {};
    try {
      if (fs.existsSync(settingsPath)) {
        envSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e) { /* ignore */ }

    // 查找 claude 可执行文件路径（npm 全局安装的 Claude Code CLI）
    const npmGlobalPaths = [
      path.join(process.env.APPDATA || '', 'npm'),
      path.join(process.env.LOCALAPPDATA || '', 'npm-cache'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
      path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm'),
    ];
    const nodeDir = process.env.NODE_PATH || (process.argv0 ? path.dirname(process.argv0) : '');
    if (nodeDir) npmGlobalPaths.unshift(nodeDir);

    const extraPath = npmGlobalPaths.join(path.delimiter);
    const currentPath = process.env.PATH || '';

    const env = {
      ...process.env,
      PATH: `${currentPath}${path.delimiter}${extraPath}`,
      // ⚠️ 关键：MAKO_SERVER_MODE=1 告诉子进程只运行 server.js，不创建窗口
      // 这是防止 fork bomb 的机制
      MAKO_SERVER_MODE: '1',
      ANTHROPIC_BASE_URL: envSettings.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: envSettings.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_API_KEY: envSettings.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_MODEL: envSettings.ANTHROPIC_MODEL || 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_OPUS_MODEL: envSettings.ANTHROPIC_DEFAULT_OPUS_MODEL || 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: envSettings.ANTHROPIC_DEFAULT_SONNET_MODEL || 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: envSettings.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'deepseek-v4-flash',
      CLAUDE_CODE_SUBAGENT_MODEL: envSettings.CLAUDE_CODE_SUBAGENT_MODEL || 'deepseek-v4-flash',
      CLAUDE_CODE_EFFORT_LEVEL: envSettings.CLAUDE_CODE_EFFORT_LEVEL || 'high',
      NO_COLOR: '1',
      NODE_NO_WARNINGS: '1',
    };

    // 使用 process.execPath（Electron 内置运行时）+ MAKO_SERVER_MODE=1
    // 子进程检测到 MAKO_SERVER_MODE=1 后只运行 server.js，不创建窗口
    serverProc = spawn(process.execPath, [serverPath, String(SERVER_PORT)], {
      cwd: APP_DIR,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    serverProc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    serverProc.on('error', (err) => {
      log(`Server spawn error: ${err.message}`);
      reject(err);
    });

    serverProc.on('close', (code) => {
      log(`Server exited with code ${code}`);
      serverReady = false;
      serverProc = null;
    });

    resolve();
  });
}

// ─── 等待服务就绪 ────────────────────────────────────
function waitForServer(retries = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`${MAIN_URL}/api/projects`, (res) => {
        if (res.statusCode === 200) {
          serverReady = true;
          log('Server is ready');
          resolve(true);
        }
      });
      req.on('error', () => {
        if (attempts >= retries) {
          log('Server timeout');
          resolve(false);
        } else {
          setTimeout(check, 1000);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts >= retries) {
          resolve(false);
        } else {
          setTimeout(check, 1000);
        }
      });
    };
    setTimeout(check, 500);
  });
}

// ─── 检查首次运行 ────────────────────────────────────
function isFirstRun() {
  const settingsPath = path.join(APP_DIR, 'mako-settings.json');
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (!settings.ANTHROPIC_AUTH_TOKEN) return true;
      if (settings.SETUP_COMPLETE !== 'true') return true;
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

// ─── 用户配置备份与恢复 ─────────────────────────────
// 将 mako-settings.json / CLAUDE.md / .claude/ 备份到 %APPDATA%/MakoCode/
// 确保更新、换目录重装后用户配置不丢失

function getUserBackupDir() {
  return path.join(app.getPath('userData'), 'config-backup');
}

/**
 * 启动时从 %APPDATA% 恢复用户配置到安装目录
 * - mako-settings.json：仅当安装目录中缺失时恢复
 * - CLAUDE.md：始终从备份恢复（安装器会用默认版本覆盖）
 * - .claude/：仅当安装目录中缺失时恢复
 * 必须在 startServer() 之前调用
 */
function restoreUserConfig() {
  const backupDir = getUserBackupDir();
  if (!fs.existsSync(backupDir)) return;

  // mako-settings.json — 安装目录缺失时从备份恢复
  const settingsSrc = path.join(backupDir, 'mako-settings.json');
  const settingsDst = path.join(APP_DIR, 'mako-settings.json');
  if (!fs.existsSync(settingsDst) && fs.existsSync(settingsSrc)) {
    try {
      fs.copyFileSync(settingsSrc, settingsDst);
      log('Config: restored mako-settings.json from backup');
    } catch (e) {
      log(`Config: failed to restore mako-settings.json: ${e.message}`);
    }
  }

  // CLAUDE.md — 始终从备份恢复（防止更新覆盖用户自定义人设）
  const personaSrc = path.join(backupDir, 'CLAUDE.md');
  const personaDst = path.join(APP_DIR, 'CLAUDE.md');
  if (fs.existsSync(personaSrc)) {
    try {
      fs.copyFileSync(personaSrc, personaDst);
      log('Config: restored CLAUDE.md from backup');
    } catch (e) {
      log(`Config: failed to restore CLAUDE.md: ${e.message}`);
    }
  }

  // .claude/ 目录 — 安装目录缺失时从备份恢复
  const claudeDirSrc = path.join(backupDir, '.claude');
  const claudeDirDst = path.join(APP_DIR, '.claude');
  if (!fs.existsSync(claudeDirDst) && fs.existsSync(claudeDirSrc)) {
    try {
      copyDirRecursive(claudeDirSrc, claudeDirDst);
      log('Config: restored .claude/ directory from backup');
    } catch (e) {
      log(`Config: failed to restore .claude/: ${e.message}`);
    }
  }
}

/**
 * 退出时将用户配置备份到 %APPDATA%
 * 同步执行，保证 before-quit 期间完成
 */
function backupUserConfig() {
  try {
    const backupDir = getUserBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });

    // mako-settings.json
    const settingsSrc = path.join(APP_DIR, 'mako-settings.json');
    if (fs.existsSync(settingsSrc)) {
      fs.copyFileSync(settingsSrc, path.join(backupDir, 'mako-settings.json'));
    }

    // CLAUDE.md
    const personaSrc = path.join(APP_DIR, 'CLAUDE.md');
    if (fs.existsSync(personaSrc)) {
      fs.copyFileSync(personaSrc, path.join(backupDir, 'CLAUDE.md'));
    }

    // .claude/ 目录
    const claudeDirSrc = path.join(APP_DIR, '.claude');
    if (fs.existsSync(claudeDirSrc)) {
      const claudeDirDst = path.join(backupDir, '.claude');
      if (fs.existsSync(claudeDirDst)) {
        fs.rmSync(claudeDirDst, { recursive: true, force: true });
      }
      copyDirRecursive(claudeDirSrc, claudeDirDst);
    }

    log('Config: backup completed');
  } catch (e) {
    log(`Config: backup failed: ${e.message}`);
  }
}

/** 递归复制目录 */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── 创建窗口 ────────────────────────────────────────
function createWindow(firstRun = false) {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    title: 'MakoCode - 常陆茉子',
    icon: path.join(APP_DIR, 'icon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: WINDOW_DEFAULTS.backgroundColor,
  });

  mainWindow.setMenuBarVisibility(false);

  const startUrl = firstRun ? `${MAIN_URL}/wizard.html` : MAIN_URL;
  log(`Loading: ${startUrl}`);
  mainWindow.loadURL(startUrl);

  mainWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── 首次运行引导 ────────────────────────────────────
async function showFirstRunSetup() {
  if (mainWindow && mainWindow.webContents) {
    try {
      await mainWindow.webContents.executeJavaScript(`
        if (typeof showSettings === 'function') {
          showSettings();
          setTimeout(() => {
            const inputs = document.querySelectorAll('#settings-overlay input[type="password"]');
            if (inputs.length > 0) inputs[0].focus();
          }, 500);
        }
      `);
    } catch (e) {
      log(`First-run script error: ${e.message}`);
    }
  }
}

// ─── 后备方案：从本地文件加载向导 ────────────────────
function createFallbackWizard() {
  const wizardPath = path.join(APP_DIR, 'wizard.html');
  if (!fs.existsSync(wizardPath)) {
    dialog.showErrorBox('启动失败', '找不到向导页面文件，请重新安装 MakoCode。');
    app.quit();
    return;
  }

  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    title: 'MakoCode - 常陆茉子 · 初次见面',
    icon: path.join(APP_DIR, 'icon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    backgroundColor: WINDOW_DEFAULTS.wizardBackgroundColor,
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(wizardPath);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── IPC: 后台安装工具（file:// 后备模式） ──────────

ipcMain.handle('install-tools', async (event, tools) => {
  const BUNDLED_DIR = path.join(APP_DIR, 'bundled-tools');
  const results = [];

  // ⚠️ 确保 node 在 claude 之前
  const sortedTools = [...tools].sort((a, b) => {
    if (a === 'node' && b === 'claude') return -1;
    if (a === 'claude' && b === 'node') return 1;
    return 0;
  });

  for (const tool of sortedTools) {
    // 预检：已安装则跳过
    try {
      const check = spawnSync('cmd.exe', ['/d', '/c', 'where', tool === 'claude' ? 'claude' : tool, '2>nul']);
      if (check.status === 0) {
        results.push({ tool, status: 'done', message: `${tool} 已安装，跳过` });
        continue;
      }
    } catch {}

    if (tool === 'claude') {
      // npm install -g（需要 Node.js 安装后的 PATH）
      log(`IPC install: claude via npm`);
      try {
        const nodejsDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs');
        const extraPath = nodejsDir + path.delimiter + (process.env.PATH || '');
        const exitCode = await new Promise((resolve) => {
          const child = spawn('cmd.exe', ['/d', '/c', 'npm', 'install', '-g', '@anthropic-ai/claude-code'], {
            stdio: 'ignore',
            env: { ...process.env, PATH: extraPath },
          });
          child.on('close', resolve);
          child.on('error', () => resolve(-1));
        });
        results.push({
          tool: 'claude',
          status: (exitCode === 0) ? 'done' : 'error',
          message: (exitCode === 0) ? 'Claude Code 安装完成' : `Claude Code 安装失败 (exit ${exitCode})`,
        });
      } catch (e) {
        results.push({ tool: 'claude', status: 'error', message: e.message });
      }
      continue;
    }

    // Node.js / Git：用 PowerShell Start-Process -Verb RunAs 提权安装
    let installerPath = null;
    if (tool === 'node') {
      try {
        const files = fs.readdirSync(BUNDLED_DIR);
        const msi = files.find(f => f.startsWith('node-') && f.endsWith('.msi'));
        if (msi) installerPath = path.join(BUNDLED_DIR, msi);
      } catch {}
    } else if (tool === 'git') {
      try {
        const files = fs.readdirSync(BUNDLED_DIR);
        const exe = files.find(f => f.startsWith('Git-') && f.endsWith('.exe'));
        if (exe) installerPath = path.join(BUNDLED_DIR, exe);
      } catch {}
    }

    if (!installerPath || !fs.existsSync(installerPath)) {
      results.push({ tool, status: 'skip', message: '安装包未找到' });
      continue;
    }

    log(`IPC install: ${tool} from ${installerPath}`);
    try {
      const exitCode = await new Promise((resolve) => {
        let psCmd;
        if (tool === 'node') {
          psCmd = `$p=Start-Process -FilePath msiexec -ArgumentList '/i','${installerPath}','/qn','/norestart' -Wait -Verb RunAs -PassThru; exit $p.ExitCode`;
        } else {
          psCmd = `$p=Start-Process -FilePath '${installerPath}' -ArgumentList '/VERYSILENT','/NORESTART','/DIR=C:\\Program Files\\Git' -Wait -Verb RunAs -PassThru; exit $p.ExitCode`;
        }
        const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCmd], { stdio: 'ignore' });
        child.on('close', resolve);
        child.on('error', () => resolve(-1));
      });

      results.push({
        tool,
        status: (exitCode === 0 || exitCode === 3010) ? 'done' : 'error',
        message: (exitCode === 0 || exitCode === 3010) ? `${tool} 安装完成` : `${tool} 安装失败 (exit ${exitCode})`,
      });
    } catch (e) {
      results.push({ tool, status: 'error', message: e.message });
    }
  }
  return results;
});

ipcMain.handle('cleanup-bundled-tools', async () => {
  const BUNDLED_DIR = path.join(APP_DIR, 'bundled-tools');
  try {
    if (fs.existsSync(BUNDLED_DIR)) {
      const files = fs.readdirSync(BUNDLED_DIR);
      for (const f of files) {
        fs.unlinkSync(path.join(BUNDLED_DIR, f));
      }
      fs.rmdirSync(BUNDLED_DIR);
      log('Cleaned up bundled-tools directory');
      return { ok: true };
    }
  } catch (e) {
    log(`Cleanup error: ${e.message}`);
    return { ok: false, error: e.message };
  }
  return { ok: true };
});

// ─── 打开文件夹 ──────────────────────────────────────

ipcMain.handle('open-skills-folder', async () => {
  const skillsDir = path.join(os.homedir(), '.claude', 'skills');
  try {
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }
    const result = await shell.openPath(skillsDir);
    if (result) {
      log(`open-skills-folder error: ${result}`);
      return { ok: false, error: result };
    }
    return { ok: true, path: skillsDir };
  } catch (e) {
    log(`open-skills-folder error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-plugins-folder', async () => {
  const pluginsDir = path.join(os.homedir(), '.claude', 'plugins');
  try {
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true });
    }
    const result = await shell.openPath(pluginsDir);
    if (result) {
      log(`open-plugins-folder error: ${result}`);
      return { ok: false, error: result };
    }
    return { ok: true, path: pluginsDir };
  } catch (e) {
    log(`open-plugins-folder error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ─── 茉子人设文件读写 ─────────────────────────────────

ipcMain.handle('read-persona', async () => {
  const personaFile = path.join(APP_DIR, 'CLAUDE.md');
  const skillFile = path.join(APP_DIR, '.claude', 'skills', 'mako-lore', 'SKILL.md');
  try {
    const result = {};
    if (fs.existsSync(personaFile)) {
      result.persona = fs.readFileSync(personaFile, 'utf8');
    }
    if (fs.existsSync(skillFile)) {
      result.lore = fs.readFileSync(skillFile, 'utf8');
    }
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('write-persona', async (_event, { persona, lore }) => {
  const personaFile = path.join(APP_DIR, 'CLAUDE.md');
  const skillFile = path.join(APP_DIR, '.claude', 'skills', 'mako-lore', 'SKILL.md');
  try {
    if (persona !== undefined && persona !== null) {
      // 确保目录存在
      const personaDir = path.dirname(personaFile);
      if (!fs.existsSync(personaDir)) fs.mkdirSync(personaDir, { recursive: true });
      fs.writeFileSync(personaFile, persona, 'utf8');
    }
    if (lore !== undefined && lore !== null) {
      const loreDir = path.dirname(skillFile);
      if (!fs.existsSync(loreDir)) fs.mkdirSync(loreDir, { recursive: true });
      fs.writeFileSync(skillFile, lore, 'utf8');
    }
    log('Persona files saved successfully');
    return { ok: true };
  } catch (e) {
    log(`write-persona error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ─── 自动更新 ────────────────────────────────────────

let updateStatus = {
  state: 'idle',        // idle | checking | available | downloading | downloaded | error
  version: null,
  progress: 0,           // 0-100
  error: null,
};
let updateTimer = null;
let updateInterval = null;
let lastStatusWrite = 0;
let lastWrittenState = null;

function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
  // 节流写盘：状态变更立即写，下载进度最多每 500ms 写一次
  const now = Date.now();
  const stateChanged = updateStatus.state !== lastWrittenState;
  if (!stateChanged && now - lastStatusWrite < 500) return;
  lastStatusWrite = now;
  lastWrittenState = updateStatus.state;
  try {
    const statusFile = path.join(APP_DIR, '.update-status.json');
    fs.writeFileSync(statusFile, JSON.stringify(updateStatus), 'utf8');
  } catch {}
}

function setupAutoUpdater() {
  // 惰性加载 electron-updater（仅正常 Electron 模式需要）
  if (!autoUpdater) {
    try {
      autoUpdater = require('electron-updater').autoUpdater;
    } catch (e) {
      log(`Auto-update: electron-updater not available: ${e.message}`);
      return;
    }
  }

  // 配置更新服务器（可通过环境变量 MAKO_UPDATE_URL 覆盖）
  // 优先使用 package.json build.publish，其次依赖 electron-builder 生成的 app-update.yml
  const feedConfig = process.env.MAKO_UPDATE_URL || (() => {
    try {
      const pkgPath = path.join(__dirname, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const publish = pkg.build?.publish;
      if (publish && publish.provider === 'github') {
        return { provider: 'github', owner: publish.owner, repo: publish.repo };
      }
      if (publish && publish.provider === 'generic' && publish.url) {
        return publish.url;
      }
      // build.publish 缺失（打包后被剥离）→ 不覆盖，让 electron-updater 读取 app-update.yml
      return undefined;
    } catch { return undefined; }
  })();
  if (feedConfig) {
    autoUpdater.setFeedURL(feedConfig);
  }

  autoUpdater.autoDownload = true;   // 后台自动下载
  autoUpdater.autoInstallOnAppQuit = false; // 让用户手动点安装

  autoUpdater.on('checking-for-update', () => {
    log('Auto-update: checking...');
    updateStatus = { state: 'checking', version: null, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('update-available', (info) => {
    if (!autoUpdater) return;
    log(`Auto-update: available v${info.version}`);
    updateStatus = { state: 'downloading', version: info.version, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('update-not-available', () => {
    if (!autoUpdater) return;
    log('Auto-update: already latest');
    updateStatus = { state: 'idle', version: null, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (!autoUpdater) return;
    const pct = Math.floor(progressObj.percent);
    // 每 10% 打一次日志，减少噪声
    if (pct % 10 === 0 || pct >= 100) {
      log(`Auto-update: download ${pct}% (${progressObj.transferred}/${progressObj.total})`);
    }
    updateStatus = {
      state: 'downloading',
      version: updateStatus.version,
      progress: pct,
      error: null,
    };
    sendUpdateStatus();
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (!autoUpdater) return;
    log(`Auto-update: v${info.version} downloaded, ready to install`);
    updateStatus = { state: 'downloaded', version: info.version, progress: 100, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('error', (err) => {
    if (!autoUpdater) return;
    log(`Auto-update error: ${err.message}`);
    updateStatus = { state: 'error', version: null, progress: 0, error: err.message };
    sendUpdateStatus();
  });
}

// IPC: 手动检查更新
ipcMain.handle('check-for-update', async () => {
  log('Auto-update: manual check triggered by user');
  if (!autoUpdater) {
    updateStatus = { state: 'error', version: null, progress: 0, error: 'Auto-updater not initialized' };
    sendUpdateStatus();
    return { ok: false, error: 'Auto-updater not initialized' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    log(`Auto-update: check failed: ${err.message}`);
    updateStatus = { state: 'error', version: null, progress: 0, error: err.message };
    sendUpdateStatus();
    return { ok: false, error: err.message };
  }
});

// IPC: 安装已下载的更新
ipcMain.handle('install-update', async () => {
  log('Auto-update: user requested install');
  if (!autoUpdater) {
    log('Auto-update: autoUpdater not available, cannot install');
    return { ok: false, error: 'autoUpdater not available' };
  }
  try {
    // quitAndInstall 会退出应用、运行 NSIS 静默安装、再重启
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (err) {
    log(`Auto-update: install failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// ─── 应用生命周期 ────────────────────────────────────
app.whenReady().then(async () => {
  log('MakoCode starting...');

  // 从 %APPDATA% 恢复用户配置（防止更新/重装导致配置丢失）
  restoreUserConfig();

  try {
    await startServer();
  } catch (err) {
    log(`Server spawn failed: ${err.message}, falling back to file:// wizard`);
    createFallbackWizard();
    return;
  }

  const ready = await waitForServer();
  if (!ready) {
    log('Server start timeout, falling back to file:// wizard');
    createFallbackWizard();
    return;
  }

  const firstRun = isFirstRun();
  createWindow(firstRun);

  // 始终初始化自动更新（包括首次运行），确保用户可随时手动检查更新
  setupAutoUpdater();

  // 非首次运行时自动检查更新（首次运行让用户先完成设置向导）
  if (!firstRun) {
    // 启动后延迟检查更新，优先让主界面加载
    updateTimer = setTimeout(() => {
      if (!autoUpdater) return;
      autoUpdater.checkForUpdates().catch((err) => {
        log(`Auto-update: initial check failed: ${err.message}`);
      });
    }, UPDATE_CHECK_DELAY_MS);

    // 定期自动检查更新
    updateInterval = setInterval(() => {
      if (!autoUpdater) return;
      autoUpdater.checkForUpdates().catch((err) => {
        log(`Auto-update: periodic check failed: ${err.message}`);
      });
    }, UPDATE_CHECK_INTERVAL_MS);

    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => showFirstRunSetup(), 1500);
    });
  }
});

app.on('window-all-closed', () => {
  log('Window closed, shutting down...');
  killServerProc();
  app.quit();
});

app.on('before-quit', () => {
  if (updateTimer) clearTimeout(updateTimer);
  if (updateInterval) clearInterval(updateInterval);
  // 退出前备份用户配置到 %APPDATA%
  backupUserConfig();
  // 如果有已下载但未安装的更新，退出时自动安装
  if (updateStatus.state === 'downloaded' && autoUpdater) {
    killServerProc(); // 先杀子进程，避免文件锁导致 NSIS 安装失败
    try {
      autoUpdater.quitAndInstall(true, true);
      return; // quitAndInstall 会接管退出流程
    } catch (err) {
      log(`Auto-update: quitAndInstall failed: ${err.message}`);
    }
  }
  killServerProc();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

} // end of else block — normal Electron mode
