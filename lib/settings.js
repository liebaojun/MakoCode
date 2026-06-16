/**
 * MakoCode 设置管理模块
 * 从 server.js 提取，负责 mako-settings.json 的读写
 *
 * 职责：
 * - 加载/保存 mako-settings.json
 * - 合并默认值
 * - 提供白名单过滤
 * - 同步 currentModel
 */
const path = require('path');
const fs = require('fs');
const { DEFAULT_MAKO_SETTINGS, SETTINGS_ALLOWED_KEYS, DEFAULT_MODEL } = require('./constants');
const { safeJsonRead, filterAllowedKeys, createLogger } = require('./utils');

const log = createLogger('settings');

let makoSettings = { ...DEFAULT_MAKO_SETTINGS };
let currentModel = DEFAULT_MODEL;

function getSettingsFilePath(appDir) {
  return path.join(appDir, 'mako-settings.json');
}

/**
 * 加载设置文件，合并默认值
 */
function load(appDir) {
  const filePath = getSettingsFilePath(appDir);
  const data = safeJsonRead(fs, filePath);

  if (data) {
    makoSettings = { ...DEFAULT_MAKO_SETTINGS, ...data };
    log(`Loaded mako-settings.json: auth=${makoSettings.ANTHROPIC_AUTH_TOKEN ? 'set' : 'MISSING'}`);
    if (makoSettings.ANTHROPIC_MODEL) {
      currentModel = makoSettings.ANTHROPIC_MODEL;
      log(`currentModel = ${currentModel} (from settings)`);
    }
  } else {
    log("mako-settings.json not found, using defaults");
    makoSettings = { ...DEFAULT_MAKO_SETTINGS };
  }
}

/**
 * 保存设置（合并模式：保留非标准字段如 SETUP_COMPLETE）
 */
function save(appDir, newSettings) {
  const filePath = getSettingsFilePath(appDir);
  try {
    const existing = safeJsonRead(fs, filePath, {});
    const merged = { ...DEFAULT_MAKO_SETTINGS, ...existing, ...newSettings };
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
    makoSettings = merged;
    log("Saved mako-settings.json");
    return true;
  } catch (e) {
    log(`Failed to save mako-settings.json: ${e.message}`);
    return false;
  }
}

/**
 * 获取当前设置（可脱敏）
 */
function getAll(maskAuth = false) {
  if (!maskAuth) return { ...makoSettings };
  const safe = { ...makoSettings };
  if (safe.ANTHROPIC_AUTH_TOKEN && safe.ANTHROPIC_AUTH_TOKEN.length > 8) {
    safe.ANTHROPIC_AUTH_TOKEN_MASKED =
      safe.ANTHROPIC_AUTH_TOKEN.substring(0, 4) + "****" + safe.ANTHROPIC_AUTH_TOKEN.slice(-4);
  }
  return safe;
}

function getCurrentModel() {
  return currentModel;
}

function setCurrentModel(model) {
  currentModel = model;
  log(`currentModel updated to: ${currentModel}`);
}

/**
 * 获取 Claude Code 环境变量（用于 spawn）
 */
function buildEnv() {
  const env = { ...process.env };
  env.ANTHROPIC_BASE_URL = makoSettings.ANTHROPIC_BASE_URL;
  if (makoSettings.ANTHROPIC_AUTH_TOKEN) {
    env.ANTHROPIC_AUTH_TOKEN = makoSettings.ANTHROPIC_AUTH_TOKEN;
    env.ANTHROPIC_API_KEY = makoSettings.ANTHROPIC_AUTH_TOKEN;
  }
  env.ANTHROPIC_MODEL = currentModel;
  env.ANTHROPIC_DEFAULT_OPUS_MODEL = makoSettings.ANTHROPIC_DEFAULT_OPUS_MODEL;
  env.ANTHROPIC_DEFAULT_SONNET_MODEL = makoSettings.ANTHROPIC_DEFAULT_SONNET_MODEL;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = makoSettings.ANTHROPIC_DEFAULT_HAIKU_MODEL;
  if (makoSettings.CLAUDE_CODE_SUBAGENT_MODEL) {
    env.CLAUDE_CODE_SUBAGENT_MODEL = makoSettings.CLAUDE_CODE_SUBAGENT_MODEL;
  }
  if (makoSettings.CLAUDE_CODE_EFFORT_LEVEL) {
    env.CLAUDE_CODE_EFFORT_LEVEL = makoSettings.CLAUDE_CODE_EFFORT_LEVEL;
  }
  env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts";
  env.NO_COLOR = "1";
  env.NODE_NO_WARNINGS = "1";
  log(`buildEnv: model=${currentModel}, base=${env.ANTHROPIC_BASE_URL}, auth=${env.ANTHROPIC_AUTH_TOKEN ? 'set' : 'MISSING'}, effort=${env.CLAUDE_CODE_EFFORT_LEVEL || 'default'}`);
  return env;
}

module.exports = {
  load,
  save,
  getAll,
  getCurrentModel,
  setCurrentModel,
  buildEnv,
  SETTINGS_ALLOWED_KEYS,
  filterAllowedKeys,
};
