# 改动日志

## v1.6.2 — 2026-06-14 · 人设同步修复 + 全面功能文档

### Bug 修复
- **🎭 茉子人设修改不生效**（根因修复）
  - `--input-format stream-json` + `sdk-ts` 模式下 claude.exe 不会自动读取 CLAUDE.md
  - 服务端从未将 CLAUDE.md / SKILL.md 内容注入到 AI prompt 中
  - **修复**：新会话（history 为空）时自动读取并注入人设内容到 prompt 头部
  - 已有历史时不重复注入以节省 token
  - 移除已过时的「使用 Skill 工具加载 mako-lore」指令（内容已直接注入）
  - 验证：日志确认 `Persona injected (6.3KB, new session)`

### 新增
- **📄 `MAKOCODE-OVERVIEW.md`** — 面向 AI 评审的全面功能概览文档（669 行）
  - 覆盖软件全部功能点，包括上传文件按钮、Skills/插件文件夹管理、输入框自动扩展等细节
  - 基于事实，不夸大不遗漏

### 修改文件
- `server.js` — 新增人设注入逻辑（~36 行）
- `package.json` — 版本 1.6.1 → 1.6.2
- `MAKOCODE-OVERVIEW.md` — 新增

## v1.6.0 — 2026-06-14 · 多LLM后端 + 模块化重构

### 新增
- **🔀 多LLM后端供应商预设** — 9 家 AI 供应商一键切换
  - 🚀 DeepSeek / 🏛️ Anthropic官方 / 🔀 OpenRouter / ⚡ 硅基流动
  - ☁️ 阿里百炼 / 🌋 火山引擎方舟 / 💼 腾讯混元 / 🌙 Kimi / 🔵 百度千帆
  - 所有 Base URL 和模型名均来自官方文档核实（2026-06）
  - 设置面板新增 `📋 供应商预设` 按钮 → 弹窗浏览 → 一键填充
  - 向导页同步新增预设按钮（file://模式内置4家回退数据）
  - API Key 不覆盖，需用户自行填写
- **新增 `lib/llm-presets.js`** — 预设数据模块
- **新增 `GET /api/llm-presets`** — 返回所有预设 JSON

### 优化 (v1.5.0 合并)
- **🏗️ 模块化重构** — server.js 1402→1108行 (-21%)
  - 新增 `lib/constants.js` — 22个全局常量
  - 新增 `lib/utils.js` — 14个可复用工具函数
  - 新增 `lib/settings.js` — 设置管理独立模块
  - 新增 `lib/installer.js` — 安装器逻辑剥离
  - electron-main.js 使用共享常量和日志
- **📋 8点后端架构验收** — `ACCEPTANCE-REPORT.md`
  - 先验规则/目录责任/最小模块演练/接口示例
  - 框架复用/启动证据/真源文档/Git锁定
  - 判定：可进入业务开发

### 修改文件
- `server.js` — 模块化重构 + 新增 `/api/llm-presets`
- `electron-main.js` — 使用共享模块
- `galchat.html` — 预设弹窗UI + JS（~120行）
- `wizard.html` — 预设按钮 + 弹窗（~80行）
- `package.json` — 版本 1.4.0 → 1.6.0
- 新增 `lib/` 目录（5个模块）

### 安装包
- `dist/MakoCode Setup 1.6.0.exe` (550 MB)

---

## v1.4.0 — 2026-06-13 · 新手友好功能

### 新增
- **📁 文件夹快捷方式** — 系统设置新增「Skills 文件夹」和「插件文件夹」按钮
  - Electron 模式通过 `shell.openPath()` 直接打开资源管理器
  - 浏览器模式通过 `explorer.exe` 回退
  - 新增 server.js `/api/open-skills-folder`、`/api/open-plugins-folder` 端点
- **✏️ 茉子人设编辑器** — 系统设置 → 「修改茉子人设」→ 双标签 Markdown 编辑器
  - 主设定标签：编辑 `CLAUDE.md`（茉子人格/说话风格/规则）
  - 世界观标签：编辑 `SKILL.md`（穗织设定/人物/API 速查表）
  - Electron IPC 和 server API 双通道读写
  - 保存后下次启动生效
- **📝 输入框自动扩展** — `<input>` → `<textarea>`，支持多行输入
  - 文字超长自动换行扩展（40px → 160px，最大 4 倍）
  - 超出最大高度可滚动查看
  - 输入框扩展时对话层自动上移避免重叠
  - Enter 发送 / Shift+Enter 换行
  - 发送后自动恢复原始高度

### 修改文件
- `electron-main.js` — 新增 open-skills-folder / open-plugins-folder / read-persona / write-persona IPC handlers (~80 行)
- `preload.js` — 新增 4 个桥接方法 (~14 行)
- `server.js` — 新增 4 个 API 端点 (~90 行)
- `galchat.html` — 设置面板按钮 + 人设编辑器覆层 + textarea 改造 + 自动扩展逻辑 (~315 行)

---

## v1.3.0 — 2026-06-13 · 自动更新系统

### 新增
- **🔄 应用内自动更新** — electron-updater + NSIS 静默安装
  - 启动时后台检查 latest.yml → 发现新版本自动下载（带进度）
  - 下载完成通知用户 → 点击安装 → NSIS 静默覆盖安装 → 自动重启
  - 每 4 小时自动检查一次
  - 环境变量 `MAKO_UPDATE_URL` 可覆盖更新服务器地址
- 系统设置面板新增「版本更新」区域：状态显示 / 进度条 / 检查按钮 / 安装按钮
- `server.js` 新增 `/api/version`、`/api/update/status` 端点
- `preload.js` 新增 `checkForUpdate` / `installUpdate` / `onUpdateStatus` API

### 修改文件
- `package.json` — electron-updater 依赖 + publish 配置（generic provider）
- `electron-main.js` — setupAutoUpdater() + IPC handlers (~200 行)
- `preload.js` — 更新桥接 API (~15 行)
- `server.js` — 版本/更新状态端点 (~35 行)
- `galchat.html` — 更新 UI + JS (~130 行)
- `.gitignore` — 排除 `.update-status.json`

### 待激活
- 需配置 HTTP 更新服务器（GitHub Releases 可用）。配置 `publish.url` 后即生效。

---

## v1.2.5 — 2026-06-13 · 权限确认修复

### 修复
- **权限确认失效**（根因：`server.js` `proc.stdin.end()` 过早关闭 stdin，用户点击"允许"后答案无法送达 Claude）
  1. 添加 `--input-format stream-json` — Claude 逐行读取 JSON 消息
  2. 移除 `proc.stdin.end()` — stdin 保持打开接收权限答案
  3. 答案以 stream-json 用户消息格式写回 stdin
  4. result 消息到达后关闭 stdin 让进程正常退出
  5. 答案索引映射为实际选项值（optionsRaw）
- **OAuth 回退被阻断** — `buildEnv()` 空 `ANTHROPIC_AUTH_TOKEN` 不再覆盖全局凭证

---

## 2026-06-11 (4) — will-change 恢复为 4 属性

- **`galchat.html`** — `.char-sprite-wrap will-change` 恢复为 `transform, opacity, filter, left`（主人要求加回，对性能影响不大）

## 2026-06-11 (3) — 性能修复 + 项目改名 MakoCode

### 性能修复
- **`galchat.html`** — `#settings-overlay` 从 `display:flex + opacity:0` 改为 `display:none`（根除 backdrop-filter GPU 空转，卡顿主因）
- **`galchat.html`** — `.char-sprite-wrap will-change` 从 4 属性减为 2（transform, opacity），省 VRAM

### 项目改名
- 全局：`AI 协奏曲` / `AI Concerto` → `MakoCode`
- 文件涉及：`galchat.html`, `index.html`, `server.js`, `server-kun.js`, `go.bat`, `stop.bat`, `go-kun.bat`
- 网页标题 `<title>` → `MakoCode`
- 主界面水印 `Claude引擎就绪 ✓` → `Design by liebaojun`（Dancing Script 花体字）

## 2026-06-11 (2) — Effort Level 默认值调整 + 设置按钮修复

### 修改
- `mako-settings.json` / `server.js` — `CLAUDE_CODE_EFFORT_LEVEL` 从 `max` 改为 `high`（平衡思考质量与速度）
- `galchat.html` — 修复系统设置按钮在标题画面点击无响应（document click 监听器事件竞争）

## 2026-06-11 — Claude Code 环境变量设置功能

### 新增
- **`mako-settings.json`** — 茉子专属配置文件，存储所有 Claude Code 环境变量映射
  - 默认值：所有模型映射 → `deepseek-v4-flash`，Effort Level → `max`
  - API Key 已预填（仅用于本地运行，打包 exe 前会清空）
- **`server.js`** — 设置加载/保存系统
  - `loadMakoSettings()` / `saveMakoSettings()` — 配置文件读写
  - `GET /api/mako-settings` — 返回当前设置（API Key 脱敏显示）
  - `POST /api/mako-settings` — 保存设置（白名单过滤）
  - `buildEnv()` — 现在从 `mako-settings.json` 读取所有环境变量
- **`galchat.html`** — 系统设置面板新增「🔧 Claude Code 环境变量」区域
  - 8 个可配置字段：BASE_URL、API Key、5 个模型映射、Effort Level
  - API Key 字段使用 `password` 类型输入框
  - 保存按钮 → 调用 API 持久化到文件
  - 不影响现有 Flash/Pro 切换按钮

### 修改
- `server.js` — 新增约 80 行（设置系统）
- `galchat.html` — 新增约 120 行（设置 UI + JS），CSS 约 40 行
- `.gitignore` — 排除 WebGAL-4.6.0 源码目录

### 测试结果
- ✅ 服务器正常启动，默认模型 Flash
- ✅ GET/POST /api/mako-settings 工作正常
- ✅ Flash ↔ Pro 切换不受影响
- ✅ 设置持久化到文件 → 重启后保留
- ✅ 前端环境变量字段正确渲染和填充
- ✅ 保存后文件内容正确更新
