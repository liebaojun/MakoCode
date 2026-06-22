/**
 * MakoCode 共享常量
 * 从 server.js 和 electron-main.js 中提取，消除魔法数字散落
 */

// ─── 服务器 ────────────────────────────────────────────
const DEFAULT_PORT = 8080;
const SERVER_HOST = "127.0.0.1";
const SERVER_START_RETRIES = 30;
const SERVER_START_DELAY_MS = 500;
const SERVER_RETRY_INTERVAL_MS = 1000;
const SERVER_REQUEST_TIMEOUT_MS = 2000;

// ─── DeepSeek API 默认值 ────────────────────────────────
const DEFAULT_API_BASE = "https://api.deepseek.com/anthropic";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_PRO_MODEL = "deepseek-v4-pro";
const DEFAULT_EFFORT_LEVEL = "high";

// ─── 茉子默认设置 (所有模型映射 → flash) ──────────────
const DEFAULT_MAKO_SETTINGS = {
  ANTHROPIC_BASE_URL: DEFAULT_API_BASE,
  ANTHROPIC_AUTH_TOKEN: "",
  ANTHROPIC_MODEL: DEFAULT_MODEL,
  ANTHROPIC_DEFAULT_OPUS_MODEL: DEFAULT_PRO_MODEL,
  ANTHROPIC_DEFAULT_SONNET_MODEL: DEFAULT_MODEL,
  ANTHROPIC_DEFAULT_HAIKU_MODEL: DEFAULT_MODEL,
  CLAUDE_CODE_SUBAGENT_MODEL: DEFAULT_MODEL,
  CLAUDE_CODE_EFFORT_LEVEL: DEFAULT_EFFORT_LEVEL,
};

// ─── 设置白名单字段 ──────────────────────────────────────
const SETTINGS_ALLOWED_KEYS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_EFFORT_LEVEL",
];

// ─── 聊天/对话 ──────────────────────────────────────────
const RECENT_HISTORY_WINDOW = 10;        // 保留最近N轮完整对话
const HISTORY_PREVIEW_LENGTH = 60;       // 长期历史摘要截断长度
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

// ─── 用户称谓标记 ──────────────────────────────────────
const USER_SPEAKER_LABELS = ['主人', '用户', '玩家'];

// ─── MIME 类型映射 ─────────────────────────────────────
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

// ─── Electron 窗口 ──────────────────────────────────────
const WINDOW_DEFAULTS = {
  width: 1024,
  height: 768,
  minWidth: 800,
  minHeight: 600,
  backgroundColor: '#1A1410',
  wizardBackgroundColor: '#1A1428',
};

// ─── 自动更新 ──────────────────────────────────────────
const UPDATE_CHECK_DELAY_MS = 3000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4小时

// ─── 文件路径 ──────────────────────────────────────────
const APP_FILES = {
  SETTINGS: "mako-settings.json",
  PERSONA: "CLAUDE.md",
  LORE_SKILL: ".claude/skills/mako-lore/SKILL.md",
  UPDATE_STATUS: ".update-status.json",
};

// ─── 目录 ──────────────────────────────────────────────
const APP_DIRS = {
  SAVES: "saves",
  UPLOADS: "uploads",
  VOICE: "voice-data",
  BUNDLED_TOOLS: "bundled-tools",
  SKILLS: ".claude/skills",
  PLUGINS: ".claude/plugins",
};

module.exports = {
  DEFAULT_PORT,
  SERVER_HOST,
  SERVER_START_RETRIES,
  SERVER_START_DELAY_MS,
  SERVER_RETRY_INTERVAL_MS,
  SERVER_REQUEST_TIMEOUT_MS,
  DEFAULT_API_BASE,
  DEFAULT_MODEL,
  DEFAULT_PRO_MODEL,
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_MAKO_SETTINGS,
  SETTINGS_ALLOWED_KEYS,
  RECENT_HISTORY_WINDOW,
  HISTORY_PREVIEW_LENGTH,
  MAX_UPLOAD_SIZE,
  USER_SPEAKER_LABELS,
  MIME_TYPES,
  WINDOW_DEFAULTS,
  UPDATE_CHECK_DELAY_MS,
  UPDATE_CHECK_INTERVAL_MS,
  APP_FILES,
  APP_DIRS,
};
