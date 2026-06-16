/**
 * MakoCode Electron 涓昏繘绋?
 * - 鍚姩 server.js 鍚庣
 * - 鍒涘缓绐楀彛鍔犺浇 galchat.html
 * - 绠＄悊搴旂敤鐢熷懡鍛ㄦ湡
 * - 鑷姩鏇存柊锛坋lectron-updater + NSIS 闈欓粯瀹夎锛?
 *
 * 鈿狅笍 闃查€掑綊璁捐锛?
 *   瀛愯繘绋嬮€氳繃 MAKO_SERVER_MODE=1 鐜鍙橀噺鏍囪锛屽彧杩愯 server.js锛?
 *   涓嶅垱寤轰换浣?BrowserWindow銆傝繖闃叉浜?spawn(process.execPath) 鈫?閫掑綊鍚姩
 *   Electron 鈫?鍐?spawn 鈫?鍐嶅惎鍔?鐨勬棤闄愬惊鐜紙fork bomb锛夈€?
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// 鈹€鈹€鈹€ 瀵煎叆鍏变韩妯″潡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const { DEFAULT_PORT, WINDOW_DEFAULTS, UPDATE_CHECK_DELAY_MS, UPDATE_CHECK_INTERVAL_MS } = require('./lib/constants');
const { createLogger } = require('./lib/utils');
const log = createLogger('MakoCode');

let autoUpdater = null; // lazy init in normal Electron mode

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 馃敀 鏈嶅姟妯″紡妫€娴?鈥?蹇呴』鍦ㄦ墍鏈?Electron 閫昏緫涔嬪墠鎵ц
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

if (process.env.MAKO_SERVER_MODE === '1') {
  // 鈹€鈹€ 绾?HTTP 鏈嶅姟妯″紡锛堟棤 GUI锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  // 琚埗杩涚▼閫氳繃 spawn(process.execPath) 鍚姩锛?
  // 鍙繍琛?server.js锛屼笉鍒涘缓浠讳綍绐楀彛
  const serverPath = path.join(__dirname, 'server.js');
  if (fs.existsSync(serverPath)) {
    require(serverPath);
    // server.js 璋冪敤 server.listen() 淇濇寔浜嬩欢寰幆瀛樻椿
    // 姘歌繙涓嶆墽琛?app.whenReady()锛屼笉鍒涘缓 BrowserWindow
  } else {
    console.error('[MakoCode] Server mode: server.js not found');
    process.exit(1);
  }
  // 鈿狅笍 鍏抽敭锛氬埌杩欓噷鍚?module 椤跺眰浠ｇ爜鎵ц瀹屾瘯锛岃繘绋嬮潬 server.listen() 瀛樻椿
  // 涓嬮潰鐨勬墍鏈?Electron 鍒濆鍖栦唬鐮侀兘涓嶄細鎵ц
} else {

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 馃枼锔?姝ｅ父 Electron 搴旂敤妯″紡
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

// 鈹€鈹€鈹€ 璺緞閰嶇疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// asar: false 鈫?鎵€鏈夋枃浠跺潎鍦?__dirname 涓嬶紝鏃犻渶鍖哄垎 dev/packaged
const APP_DIR = __dirname;
const SERVER_PORT = DEFAULT_PORT;
const MAIN_URL = `http://127.0.0.1:${SERVER_PORT}`;

// 鈹€鈹€鈹€ 鐘舵€?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
let serverProc = null;
let mainWindow = null;
let serverReady = false;

// 鈹€鈹€鈹€ 娓呯悊鏃ц繘绋?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// Windows 涓?SIGTERM 涓嶅彲闈狅紝蹇呴』鐢?taskkill /F /T 鏉€鏁翠釜杩涚▼鏍?
function killServerProc() {
  if (serverProc && serverProc.exitCode === null) {
    try {
      // /F = 寮哄埗 /T = 杩涚▼鏍戯紙鍚瓩杩涚▼濡?claude.exe锛?
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

// 鈹€鈹€鈹€ 鍚姩 server.js 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(APP_DIR, 'server.js');
    if (!fs.existsSync(serverPath)) {
      reject(new Error(`server.js not found at ${serverPath}`));
      return;
    }

    // 鍏堟竻鐞嗘棫杩涚▼锛岄伩鍏?EADDRINUSE
    killOldServer();
    log(`Starting server in child process`);

    // 璇诲彇 mako-settings.json 涓殑鐜鍙橀噺璁剧疆
    const settingsPath = path.join(APP_DIR, 'mako-settings.json');
    let envSettings = {};
    try {
      if (fs.existsSync(settingsPath)) {
        envSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
    } catch (e) { /* ignore */ }

    // 鏌ユ壘 claude 鍙墽琛屾枃浠惰矾寰勶紙npm 鍏ㄥ眬瀹夎鐨?Claude Code CLI锛?
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
      // 鈿狅笍 鍏抽敭锛歁AKO_SERVER_MODE=1 鍛婅瘔瀛愯繘绋嬪彧杩愯 server.js锛屼笉鍒涘缓绐楀彛
      // 杩欐槸闃叉 fork bomb 鐨勬満鍒?
      MAKO_SERVER_MODE: '1',
      ANTHROPIC_BASE_URL: envSettings.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
      ANTHROPIC_AUTH_TOKEN: envSettings.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_API_KEY: envSettings.ANTHROPIC_AUTH_TOKEN || '',
      ANTHROPIC_MODEL: envSettings.ANTHROPIC_MODEL || 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_OPUS_MODEL: envSettings.ANTHROPIC_DEFAULT_OPUS_MODEL || 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_SONNET_MODEL: envSettings.ANTHROPIC_DEFAULT_SONNET_MODEL || 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: envSettings.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'deepseek-v4-flash',
      CLAUDE_CODE_SUBAGENT_MODEL: envSettings.CLAUDE_CODE_SUBAGENT_MODEL || 'deepseek-v4-flash',
      CLAUDE_CODE_EFFORT_LEVEL: envSettings.CLAUDE_CODE_EFFORT_LEVEL || 'high',
      NO_COLOR: '1',
      NODE_NO_WARNINGS: '1',
    };

    // 浣跨敤 process.execPath锛圗lectron 鍐呯疆杩愯鏃讹級+ MAKO_SERVER_MODE=1
    // 瀛愯繘绋嬫娴嬪埌 MAKO_SERVER_MODE=1 鍚庡彧杩愯 server.js锛屼笉鍒涘缓绐楀彛
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

// 鈹€鈹€鈹€ 绛夊緟鏈嶅姟灏辩华 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 妫€鏌ラ娆¤繍琛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鍒涘缓绐楀彛 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createWindow(firstRun = false) {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    title: 'MakoCode - 甯搁檰鑼夊瓙',
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

// 鈹€鈹€鈹€ 棣栨杩愯寮曞 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

// 鈹€鈹€鈹€ 鍚庡鏂规锛氫粠鏈湴鏂囦欢鍔犺浇鍚戝 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createFallbackWizard() {
  const wizardPath = path.join(APP_DIR, 'wizard.html');
  if (!fs.existsSync(wizardPath)) {
    dialog.showErrorBox('鍚姩澶辫触', '鎵句笉鍒板悜瀵奸〉闈㈡枃浠讹紝璇烽噸鏂板畨瑁?MakoCode銆?);
    app.quit();
    return;
  }

  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: WINDOW_DEFAULTS.width,
    height: WINDOW_DEFAULTS.height,
    minWidth: WINDOW_DEFAULTS.minWidth,
    minHeight: WINDOW_DEFAULTS.minHeight,
    title: 'MakoCode - 甯搁檰鑼夊瓙 路 鍒濇瑙侀潰',
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

// 鈹€鈹€鈹€ IPC: 鍚庡彴瀹夎宸ュ叿锛坒ile:// 鍚庡妯″紡锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

ipcMain.handle('install-tools', async (event, tools) => {
  const BUNDLED_DIR = path.join(APP_DIR, 'bundled-tools');
  const results = [];

  // 鈿狅笍 纭繚 node 鍦?claude 涔嬪墠
  const sortedTools = [...tools].sort((a, b) => {
    if (a === 'node' && b === 'claude') return -1;
    if (a === 'claude' && b === 'node') return 1;
    return 0;
  });

  for (const tool of sortedTools) {
    // 棰勬锛氬凡瀹夎鍒欒烦杩?
    try {
      const check = spawnSync('cmd.exe', ['/d', '/c', 'where', tool === 'claude' ? 'claude' : tool, '2>nul']);
      if (check.status === 0) {
        results.push({ tool, status: 'done', message: `${tool} 宸插畨瑁咃紝璺宠繃` });
        continue;
      }
    } catch {}

    if (tool === 'claude') {
      // npm install -g锛堥渶瑕?Node.js 瀹夎鍚庣殑 PATH锛?
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
          message: (exitCode === 0) ? 'Claude Code 瀹夎瀹屾垚' : `Claude Code 瀹夎澶辫触 (exit ${exitCode})`,
        });
      } catch (e) {
        results.push({ tool: 'claude', status: 'error', message: e.message });
      }
      continue;
    }

    // Node.js / Git锛氱敤 PowerShell Start-Process -Verb RunAs 鎻愭潈瀹夎
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
      results.push({ tool, status: 'skip', message: '瀹夎鍖呮湭鎵惧埌' });
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
        message: (exitCode === 0 || exitCode === 3010) ? `${tool} 瀹夎瀹屾垚` : `${tool} 瀹夎澶辫触 (exit ${exitCode})`,
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

// 鈹€鈹€鈹€ 鎵撳紑鏂囦欢澶?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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

// 鈹€鈹€鈹€ 鑼夊瓙浜鸿鏂囦欢璇诲啓 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

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
      // 纭繚鐩綍瀛樺湪
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

// 鈹€鈹€鈹€ 鑷姩鏇存柊 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

let updateStatus = {
  state: 'idle',        // idle | checking | available | downloading | downloaded | error
  version: null,
  progress: 0,           // 0-100
  error: null,
};

function sendUpdateStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateStatus);
  }
  // 鍚屾椂鍐欏叆鏂囦欢锛屼緵 server.js 鐨?/api/update/status 璇诲彇
  try {
    const statusFile = path.join(APP_DIR, '.update-status.json');
    fs.writeFileSync(statusFile, JSON.stringify(updateStatus), 'utf8');
  } catch {}
}

function setupAutoUpdater() {
  // 鎯版€у姞杞?electron-updater锛堜粎姝ｅ父 Electron 妯″紡闇€瑕侊級
  if (!autoUpdater) {
    try {
      autoUpdater = require('electron-updater').autoUpdater;
    } catch (e) {
      log(`Auto-update: electron-updater not available: ${e.message}`);
      return;
    }
  }

  // 閰嶇疆鏇存柊鏈嶅姟鍣?URL锛堝彲閫氳繃鐜鍙橀噺 MAKO_UPDATE_URL 瑕嗙洊锛?
  if (process.env.MAKO_UPDATE_URL) {
    autoUpdater.setFeedURL(process.env.MAKO_UPDATE_URL);
  }
  // 未设置时，electron-updater 自动从 package.json 的 publish 读取

  autoUpdater.autoDownload = true;   // 鍚庡彴鑷姩涓嬭浇
  autoUpdater.autoInstallOnAppQuit = false; // 璁╃敤鎴锋墜鍔ㄧ偣瀹夎

  autoUpdater.on('checking-for-update', () => {
    log('Auto-update: checking...');
    updateStatus = { state: 'checking', version: null, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('update-available', (info) => {
    log(`Auto-update: available v${info.version}`);
    updateStatus = { state: 'downloading', version: info.version, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('update-not-available', () => {
    log('Auto-update: already latest');
    updateStatus = { state: 'idle', version: null, progress: 0, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const pct = Math.floor(progressObj.percent);
    // 姣?10% 鎵撲竴娆℃棩蹇楋紝鍑忓皯鍣０
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
    log(`Auto-update: v${info.version} downloaded, ready to install`);
    updateStatus = { state: 'downloaded', version: info.version, progress: 100, error: null };
    sendUpdateStatus();
  });

  autoUpdater.on('error', (err) => {
    log(`Auto-update error: ${err.message}`);
    updateStatus = { state: 'error', version: null, progress: 0, error: err.message };
    sendUpdateStatus();
  });
}

// IPC: 鎵嬪姩妫€鏌ユ洿鏂?
ipcMain.handle('check-for-update', async () => {
  log('Auto-update: manual check triggered by user');
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

// IPC: 瀹夎宸蹭笅杞界殑鏇存柊
ipcMain.handle('install-update', async () => {
  log('Auto-update: user requested install');
  try {
    // quitAndInstall 浼氶€€鍑哄簲鐢ㄣ€佽繍琛?NSIS 闈欓粯瀹夎銆佸啀閲嶅惎
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    log(`Auto-update: install failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

// 鈹€鈹€鈹€ 搴旂敤鐢熷懡鍛ㄦ湡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
app.whenReady().then(async () => {
  log('MakoCode starting...');

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

  // 鍒濆鍖栬嚜鍔ㄦ洿鏂帮紙闈為娆¤繍琛屾椂锛?
  if (!firstRun) {
    setupAutoUpdater();
    // 鍚姩鍚庡欢杩?3 绉掓鏌ユ洿鏂帮紝浼樺厛璁╀富鐣岄潰鍔犺浇
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        log(`Auto-update: initial check failed: ${err.message}`);
      });
    }, 3000);

    // 姣?4 灏忔椂鑷姩妫€鏌ヤ竴娆?
    setInterval(() => {
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
  killServerProc();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

} // end of else block 鈥?normal Electron mode
