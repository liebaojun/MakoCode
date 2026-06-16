# MakoCode 完整功能规格文档 v1.6.1

> 本文档记录 MakoCode 的所有功能、UI元素、动画、API端点及交互逻辑。
> **修改任何代码前必须通读本文档，确保不遗漏/破坏任何功能。**

---

## 目录

1. [安装器 (NSIS)](#1-安装器-nsis)
2. [Electron 主进程](#2-electron-主进程)
3. [后端服务器 (server.js)](#3-后端服务器-serverjs)
4. [前端界面 (galchat.html)](#4-前端界面-galchathtml)
5. [首次配置向导 (wizard.html)](#5-首次配置向导-wizardhtml)
6. [预加载桥接 (preload.js)](#6-预加载桥接-preloadjs)
7. [共享模块 (lib/)](#7-共享模块-lib)
8. [资源文件 (assets/)](#8-资源文件-assets)
9. [BGM 系统](#9-bgm-系统)
10. [语音/TTS 系统](#10-语音tts-系统)
11. [角色立绘系统](#11-角色立绘系统)
12. [对话与历史系统](#12-对话与历史系统)
13. [存档系统](#13-存档系统)
14. [环境变量/LLM 供应商](#14-环境变量llm-供应商)
15. [文件上传系统](#15-文件上传系统)
16. [快捷指令系统](#16-快捷指令系统)
17. [自动更新系统](#17-自动更新系统)
18. [樱花粒子动画](#18-樱花粒子动画)
19. [思考气泡系统](#19-思考气泡系统)
20. [动画时序列表](#20-动画时序列表)

---

## 1. 安装器 (NSIS)

### 1.1 文件：package.json build.nsis
- **安装方式**: NSIS (oneClick=false, allowToChangeInstallationDirectory=true)
- **图标**: `icon.ico`（必须是标准多尺寸 32bit icon，否则 Win11 可能崩溃）
- **桌面快捷方式**: 创建 `MakoCode` 快捷方式到桌面
- **自动追加子目录**: 安装路径末尾自动追加 `\MakoCode`
- **许可协议**: 显示 `LICENSE.txt`（需 UTF-8 BOM 编码，description 用纯 ASCII）
- **安装完成后**: 复选框"运行 MakoCode"

### 1.2 文件：installer.nsh

#### customInit（安装初始化时）
- 检查 `$INSTDIR` 末尾是否有 `MakoCode` 子目录
- 如果没有，自动追加 `$INSTDIR\MakoCode`

#### customInstall（文件解压后）
- 再次检查子目录，必要时移动文件并创建子目录
- 创建三个数据目录：`saves/`, `uploads/`, `voice-data/`
- 检测 Node.js 和 Git 是否已安装（`where node` / `where git`）
- 如有缺失，弹出提示框告知用户（但不阻止安装）

#### customUnInstall（卸载时）
- 弹窗选项：保留数据（saves/uploads/voice-data）或全部删除
- `IDYES` → 保留，`IDNO` → RMDir /r 删除所有数据目录

### 1.3 安装器侧边图（installerSidebar）
- **源文件**: `build/installerSidebar.bmp`（202KB，164x314 像素 BMP）
- **来源**: 从 `b1c8fb57e94fd25b097fdeca2196da1df76c14708075-373Lmu_fw658.webp` 转换
- **转换方法**: sharp（webp→PNG）+ System.Drawing（PNG→BMP 164x314 resize）
- **配置项**: `package.json > build.nsis.installerSidebar`
- **⚠️ 注意**: electron-builder 不会自动检测此文件，必须在 NSIS 配置中显式指定
- **显示位置**: NSIS 安装向导每一页的左侧面板
- **默认值**: 如未配置，NSIS 使用默认蓝色渐变图

### 1.4 构建命令
```
npx electron-builder --win          # 完整安装器
npx electron-builder --win --dir    # 仅解压目录（调试用）
```

---

## 2. Electron 主进程

### 2.1 文件：electron-main.js

#### 服务模式保护 (MAKO_SERVER_MODE=1)
- **位置**: 文件顶部 if 块
- **作用**: 子进程检测此变量后只运行 server.js，不创建窗口
- **防递归**: 防止 spawn(process.execPath) → Electron 再 spawn 的无限循环

#### 端口清理：killOldServer()
- **触发时机**: `startServer()` 开始时
- **命令**: `netstat -ano | findstr ":8080.*LISTENING"` → 找到 PID → `taskkill /PID %a /F /T`
- **参数详解**: `/F` = 强制结束, `/T` = 结束整个进程树（含孙进程如 claude.exe）
- **⚠️ 注意**: 会无差别杀掉所有占用 8080 端口的进程

#### 服务进程管理：killServerProc()
- **触发时机**: 窗口关闭时 (`window-all-closed`), 应用退出前 (`before-quit`)
- **方法**: `taskkill /PID %a /F /T`（Windows 上 SIGTERM 不可靠，改用此方法）
- **作用**: 杀死 server.js 子进程及其所有后代进程

#### 启动流程：app.whenReady()
1. 调用 `startServer()` → `killOldServer()` → spawn 子进程 (MAKO_SERVER_MODE=1) → 加载 server.js
2. `waitForServer(30)` → 每 1 秒检查 GET `/api/projects` 是否返回 200
3. 超时(30s)则调用 `createFallbackWizard()`（file:// 模式加载 wizard.html）
4. `isFirstRun()` 检查 mako-settings.json 是否存在且含 AUTH_TOKEN + SETUP_COMPLETE=true
5. 首次运行 → 创建窗口加载 `http://127.0.0.1:8080/wizard.html`
6. 非首次 → 创建窗口加载 `http://127.0.0.1:8080/`（即 galchat.html）

#### BrowserWindow 配置
- **尺寸**: 1024x768, 最小 800x600
- **背景色**: `#1A1410`（深木色）
- **标题**: `MakoCode - 常陆茉子`
- **图标**: `icon.ico`（⚠️ 256x256 16-color icon 曾经导致 explorer.exe 崩溃）
- **preload**: `preload.js`（contextIsolation=true, nodeIntegration=false）
- **autoHideMenuBar**: true, `setMenuBarVisibility(false)`
- **wizard 专用**（回退模式）: 背景色 `#1A1428`, 标题 `MakoCode - 常陆茉子 · 初次见面`, loadFile

#### 首次运行引导：showFirstRunSetup()
- 加载页面后调用 `showSettings()` 函数
- 500ms 后聚焦到第一个密码输入框

#### IPC Handler 列表

| channel | 参数 | 功能 | 触发场景 |
|---------|------|------|----------|
| `install-tools` | `tools[]` | 后台静默安装 Node.js MSI / Git EXE / Claude Code npm | wizard.html 点击"开始安装" |
| `cleanup-bundled-tools` | 无 | 删除 bundled-tools 目录 | wizard 完成时 |
| `open-skills-folder` | 无 | 打开 `~/.claude/skills/` | 设置面板"打开 Skills 文件夹" |
| `open-plugins-folder` | 无 | 打开 `~/.claude/plugins/` | 设置面板"打开插件文件夹" |
| `read-persona` | 无 | 读取 CLAUDE.md + SKILL.md | 人设编辑器打开时 |
| `write-persona` | `{persona, lore}` | 保存 CLAUDE.md + SKILL.md | 人设编辑器保存时 |
| `check-for-update` | 无 | 手动触发自动更新检查 | 系统设置"检查更新"按钮 |
| `install-update` | 无 | 安装已下载的更新（退出+静默安装+重启） | 系统设置"安装更新"按钮 |
| `update-status` | (推送) | 通知前端更新状态变化 | 后端推送 |

#### 自动更新系统
- **依赖**: electron-updater v6.8.9
- **配置**: `publish.url`（generic provider, 暂未激活）
- **启动后检查**: 延迟 3 秒初次检查，之后每 4 小时自动检查
- **autoDownload**: true, autoInstallOnAppQuit: false
- **状态变更**: 写入 `.update-status.json` + IPC 推送前端

#### 应用生命周期事件
- `window-all-closed`: 日志 → `killServerProc()` → `app.quit()`
- `before-quit`: `killServerProc()`
- `activate` (macOS): 创建窗口（Windows 不会触发）

---

## 3. 后端服务器 (server.js)

### 3.1 默认端口：8080
### 3.2 绑定地址：127.0.0.1

### 3.3 HTTP API 端点清单

| 方法 | 路径 | 参数 | 返回 | 功能 |
|------|------|------|------|------|
| GET | `/api/projects` | 无 | `{projects:[]}` | 健康检查（server就绪判定用） |
| GET | `/api/model` | 无 | `{model, label}` | 读取当前模型 |
| GET/HEAD | `/api/commands` | 无 | `[{command, description}]` | 快捷指令列表 |
| GET | `/api/llm-presets` | 无 | `[{id, name, baseUrl, ...}]` | 9家LLM供应商预设 |
| GET | `/api/mako-settings` | 无 | `{ANTHROPIC_*}` | 读取设置（脱敏） |
| GET | `/api/saves` | 无 | `[{id, title, createdAt, ...}]` | 列出所有存档 |
| GET | `/api/saves/:id` | 无 | `{id, history, ...}` | 读取存档 |
| GET | `/api/version` | 无 | `{version}` | 读取版本号(从package.json) |
| GET | `/api/persona` | 无 | `{persona, lore}` | 读取CLAUDE.md+SKILL.md |
| GET | `/api/open-skills-folder` | 无 | `{ok, path}` | 打开skills文件夹(浏览器模式) |
| GET | `/api/open-plugins-folder` | 无 | `{ok, path}` | 打开plugins文件夹(浏览器模式) |
| GET | `/api/voice/:voiceId` | 无 | audio/wav | 获取已缓存的语音文件 |
| GET | `/*.html, *.js, *.css, ...` | 无 | 静态文件 | 静态文件服务 |
| POST | `/api/chat` | `{message, sessionId, history, ...}` | NDJSON流 | 聊天（调用claude） |
| POST | `/api/respond` | `{qId, answer}` | `{ok}` | 回答权限问题 |
| POST | `/api/model` | `{model}` | `{model, label}` | 切换模型 |
| POST | `/api/mako-settings` | `{ANTHROPIC_*}` | `{ok, model}` | 保存设置 |
| POST | `/api/saves` | `{id, title, history}` | `{ok}` | 保存存档 |
| POST | `/api/tts` | `{text}` | audio/wav | TTS语音（打包版仅预生成） |
| POST | `/api/upload` | `{sessionId, files}` | `{files}` | 文件上传 |
| POST | `/api/quit` | 无 | `{ok}` | 关闭服务器(1s后process.exit) |
| POST | `/api/persona` | `{persona, lore}` | `{ok}` | 保存人设 |
| POST | `/api/check-command` | `{command}` | `{found}` | 检查命令是否存在 |
| POST | `/api/install-claude-code` | 无 | `{ok, output}` | 安装Claude Code |
| POST | `/api/install-tools` | `{tools}` | NDJSON流 | 后台静默安装工具 |
| POST | `/api/save-settings` | `{ANTHROPIC_*}` | `{ok}` | 保存设置(简化版) |
| POST | `/api/test-connection` | `{endpoint, key, model}` | `{ok, message}` | 测试API连接 |
| POST | `/api/finish-setup` | `{keepTools}` | `{ok}` | 标记设置完成+清理安装包 |
| GET | `/api/update/status` | 无 | `{state, version, progress}` | 读取更新状态 |
| DELETE | `/api/saves/:id` | 无 | `{ok}` | 删除存档 |

### 3.4 聊天处理 (streamChat)

#### 参数构建
- `--output-format stream-json --verbose --input-format stream-json`
- `--session-id`（如提供）
- `--allowedTools`（如提供）
- `--permission-mode`（如提供，default=默认）
- `--model $currentModel --print`

#### claude.exe 定位策略
1. 优先：`%APPDATA%/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe`
2. 回退：`cmd.exe /d /c claude`

#### stdin 通信协议
- 发送 JSON 消息行：`{"type":"user","message":{"role":"user","content":"prompt"}}`
- stdin 保持打开以接收权限问题的答案
- `proc.stdin.end()` 在收到 `type=result` 消息后关闭

#### stdout 解析 (NDJSON)
- `type=claude_json` → 转发原始 Claude 消息给前端
- `type=system, subtype=init` → 初始化消息
- `type=system, subtype!=init` → 检测是否有权限问题（`detectQuestion()`）
- `type=result` → 关闭 stdin + 流结束
- `type=assistant, message.content` → 聊天回复
- `type=assistant, message.content[].type=thinking/reasoning` → 思考内容

#### 权限问题检测 (detectQuestion)
- 检测 `msg.options` 数组存在且有长度 → 提取 `{text, options, optionsRaw}`
- 检测 `type=assistant, message.type=tool_use` → 生成 `{text, options: [允许,总是允许,拒绝]}`
- 通过 `gallm_question` NDJSON 消息推送给前端

#### Token 优化：分层历史注入
- 最近10轮：保留完整原文
- 10轮以前：压缩为摘要（截断60字+省略号）
- 早期对话标记 `【早期对话摘要】`，近期标记 `【最近对话】`

#### 模型切换命令
- `/model flash` → 切换到 deepseek-v4-flash
- `/model pro` → 切换到 deepseek-v4-pro
- 通过聊天内 /command 触发，立即回复确认消息

### 3.5 文件上传处理 (handleUpload)
- 接收 base64 编码的文件数据
- 存储在 `uploads/{sessionId}/` 子目录
- 单次总大小限制 50MB
- 文件名安全过滤（替换 `\ / : * ? " < > |` 为 `_`）

### 3.6 后台静默安装 (installer.installToolsStreaming)
- 见下方 [lib/installer.js 说明](#73-installerjs)

---

## 4. 前端界面 (galchat.html)

### 4.1 总体布局（z-index 分层）

| 层级 | z-index | 内容 | 说明 |
|------|---------|------|------|
| 背景 | 0 | `#bg-layer` | 场景背景图，过渡动画1.5s |
| 樱花 | 5 | `#sakura-container` | 35片花瓣，CSS动画 |
| 角色 | 8 | `#character-layer` | 茉子+芳乃立绘 |
| 对话 | 20 | `#dialogue-layer` | 底部对话框+文字 |
| 思考气泡 | 25 | `#think-bubble-layer` | AI思考气泡 |
| 标题画面 | 100 | `#title-screen` | 主菜单 |
| Overlay | 200+ | 各设置/存档面板 | 模态框 |

### 4.2 标题画面 (`#title-screen`)
- **新建游戏** → `newGame()` → 开始新对话
- **继续游戏** → `continueGame()` → 加载最近的存档
- **系统设置** → `showSettings()` → 打开设置面板
- **退出游戏** → `quitGame()` → 关闭窗口

### 4.3 对话框 (`#dialogue-box`)
- 显示说话者名称标签（茉子=红色, 主人=金色）
- 打字机效果文字输出（8-16ms/字，比之前快约2倍）
- 点击对话框可跳过打字动画
- 打字完成后自动渲染 Markdown（使用 marked.js）
- 支持 KaTeX 公式渲染（`$...$`, `$$...$$`, `\(...\)`, `\[...\]`）
- 链接默认新标签页打开
- 完成后显示「✦ 点击继续」提示

### 4.4 状态指示器 (`#status-dot`)
- `disconnected`: 灰色圆点
- `connected`: 绿色圆点 + "已连接"
- `thinking`: 黄色圆点 + 随机茉子思考短语（每3-5秒轮播）

### 4.5 输入框 (`#user-input`, `<textarea>`)
- 单行显示，文字超长时自动扩展高度（40px→160px，4倍）
- 扩展时对话层自动上移避免重叠，发送后恢复
- Enter 发送，Shift+Enter 换行
- 发送按钮 + 文件上传按钮
- 文件上传后会显示文件标签栏（🖼️📄📝📊💻📎 按类型显示图标）
- 每个文件标签有 × 删除按钮

### 4.6 模型切换按钮 (`#model-toggle`)
- 对话界面右上角切换 Flash↔Pro
- 发送中不允许切换
- 切换后 Toast 提示

### 4.7 设置面板 (`#settings-overlay`)
- **模型切换**: Flash/Pro 按钮，高亮当前模型
- **环境变量设置**: 8 个字段（API地址/Key/模型映射/Effort Level）
  - API Key 为 password 类型输入框
  - 「📋 供应商预设」弹窗 → 一键填充9家供应商配置
  - 保存后自动关闭面板
- **版本更新区域**: 显示当前版本号、检查更新按钮、安装更新按钮、下载进度条
- **打开 Skills 文件夹** → 调用 Electron IPC 或 HTTP API
- **打开插件文件夹** → 同上
- **修改茉子人设** → 打开人设编辑器（双标签：主设定 + 世界观）

### 4.8 人设编辑器 (`#persona-overlay`)
- 双标签页：主设定 / 世界观
- 读取/写入 CLAUDE.md + `.claude/skills/mako-lore/SKILL.md`
- 优先 Electron IPC，回退到 HTTP API
- 保存后 Toast 提示「下次启动生效」，800ms后关闭

### 4.9 历史面板 (`#history-panel`)
- 右侧滑出面板
- 显示所有对话历史（茉子消息带语音重播标记）
- 点击茉子消息可重播语音
- ESC 或点击外部关闭
- 新建存档/继续游戏时自动更新

### 4.10 Toast 消息 (`#error-toast`)
- 黄色=错误消息（5秒自动消失）
- 绿色=成功提示（2.5秒自动消失）
- 同时只能显示一条

### 4.11 存档 UI (`#save-overlay`)
- 标题画面"继续游戏"或ESC存档列表
- 显示存档标题、时间、消息数
- 点击存档加载，点击「删除」按钮确认删除
- 空列表显示「还没有存档记录」

### 4.12 加载中指示器 (`#loading-dots`)
- 三个弹跳圆点动画
- 伴随思考气泡 + 状态栏轮播 + 思考语音

### 4.13 存档保存 Toast (`#save-toast`)
- 自动存档成功后显示「💾 已保存」
- 2秒后自动消失

### 4.14 输入框动画时序
1. `newGame()` → 隐藏标题画面 → 400ms后角色入场
2. 600ms后茉子问候语音+打字 → 等待打字完成
3. 显示输入框 → 聚焦输入框 → 重置输入框高度
4. 用户输入 → Enter发送 → showMsg('主人', ...) → 等待打字完成
5. 显示 loading + 思考气泡 → 接收流式回复 → 清除气泡 → 茉子打字回复
6. 打字完成 → 渲染Markdown + 显示输入框 → 自动存档

### 4.15 ESC 快捷键行为
| 条件 | 行为 |
|------|------|
| 人设编辑器打开中 | 关闭人设编辑器 |
| 设置面板打开中 | 关闭设置面板 |
| 存档列表打开中 | 关闭存档列表 |
| 历史面板打开中 | 关闭历史面板 |
| 游戏中且非打字/发送中 | `saveAndExit()`（存档并返回标题） |

---

## 5. 首次配置向导 (wizard.html)

### 5.1 协议检测
- `IS_FILE_PROTOCOL`: 检测是否从 file:// 加载（后端未启动）
- 如果从 file:// 加载且后端可用 → 跳转到 `http://127.0.0.1:8080/wizard.html`
- `backendAvailable = !IS_FILE_PROTOCOL`

### 5.2 API 地址拼接
- file:// 模式：所有 API 调用加前缀 `http://127.0.0.1:8080`
- HTTP 模式：使用相对路径

### 5.3 向导步骤 (STATE.step)

#### Step 0: 工具检测
- 自动检测 Node.js / Git / Claude Code 是否已安装
- 三个复选框（已安装的自动取消勾选）
- 「确认选择，继续 →」按钮

#### Step 1: 后台安装（条件显示）
- 如果有未安装的工具，显示安装按钮 → `startAutoInstall()`
- 安装进度实时显示（等待→安装中→完成/失败）
- 安装日志显示在终端风格框中
- 三种安装路径：
  - Node.js: `msiexec /i xxx.msi /qn /norestart` (PowerShell提权)
  - Git: `xxx.exe /VERYSILENT /NORESTART` (PowerShell提权)
  - Claude Code: `npm install -g @anthropic-ai/claude-code`
- 工具安装顺序：Node.js → Git → Claude Code（通过排序确保）
- 安装完成显示「装好了，继续 →」
- 如果什么都不选，直接跳到 Step 2

#### Step 2: 配置 API
- API 地址输入框 + API Key 密码框 + 模型名输入框
- 「📋 预设」按钮 → 显示9家LLM供应商弹窗 → 一键填充
- 「测试连接」按钮 → 测试API连通性

#### Step 3: 测试连接
- 显示测试结果（成功/失败+错误信息）
- 未填写 Key 时提示"请先填写 API Key"

#### Step 4: 完成设置
- 两个复选框：保留 Node.js 安装包 / 保留 Git 安装包
- 「开始使用」按钮 → 调用 `/api/finish-setup`
- 清理未勾选的安装包 → 设置 SETUP_COMPLETE=true
- 跳转到 `http://127.0.0.1:8080/`（主界面）

### 5.4 预设弹窗 (LLM供应商)
- 同主界面设置面板的供应商预设功能
- 9家供应商独立渲染
- 服务器不可用时回退到6家离线预设
- 点击预设卡片 → 填充 API 地址 + 模型名

### 5.5 背景粒子动画
- 30个紫色圆点，浮动上升动画（8秒循环）
- 随机大小(1-5px)，随机延迟，随机位置

### 5.6 头像
- 茉子圆形头像：48x48px，引用 `assets/images/0cb495904212b96009e6e987647dba571389871921.jpg`
- 用于所有茉子对话气泡左上角

---

## 6. 预加载桥接 (preload.js)

### 6.1 暴露 API (contextBridge)

| API | 参数 | 映射 IPC channel | 说明 |
|-----|------|------------------|------|
| `isElectron` | - | - | `true` (boolean) |
| `platform` | - | - | `process.platform` |
| `installTools(tools)` | `string[]` | `install-tools` | 后台安装工具 |
| `cleanupBundledTools()` | 无 | `cleanup-bundled-tools` | 清理安装包 |
| `openSkillsFolder()` | 无 | `open-skills-folder` | 打开skills文件夹 |
| `openPluginsFolder()` | 无 | `open-plugins-folder` | 打开plugins文件夹 |
| `readPersona()` | 无 | `read-persona` | 读取人设 |
| `writePersona(data)` | `{persona, lore}` | `write-persona` | 保存人设 |
| `checkForUpdate()` | 无 | `check-for-update` | 检查更新 |
| `installUpdate()` | 无 | `install-update` | 安装更新 |
| `onUpdateStatus(callback)` | `function` | `update-status` | 监听更新状态（返回取消函数） |

---

## 7. 共享模块 (lib/)

### 7.1 constants.js

| 导出 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_PORT` | 8080 | 服务器监听端口 |
| `DEFAULT_API_BASE` | `https://api.deepseek.com/anthropic` | 默认API地址 |
| `DEFAULT_MODEL` | `deepseek-v4-flash` | 默认模型 |
| `DEFAULT_EFFORT_LEVEL` | `high` | Claude Code Effort |
| `DEFAULT_MAKO_SETTINGS` | 对象 | 所有模型映射到 flash 的默认设置 |
| `SETTINGS_ALLOWED_KEYS` | `string[]` | 8个允许保存的字段 |
| `MIME_TYPES` | 对象 | 13种静态文件MIME映射 |
| `WINDOW_DEFAULTS` | `{width, height, ...}` | 窗口尺寸和颜色 |
| `APP_DIRS` | 对象 | saves/uploads/voice/skills/plugins 路径 |
| `UPDATE_CHECK_*` | 3000/4h | 更新检查间隔 |

### 7.2 utils.js

| 函数 | 说明 |
|------|------|
| `createLogger(prefix)` | 返回 `[prefix] msg` 格式的 stderr 日志函数 |
| `modelLabel(model)` | pro → "Pro", 其他 → "Flash" |
| `isUserSpeaker(speaker)` | 判断是否为主人/用户/玩家发言 |
| `safeFilename(name)` | 替换文件名中的非法字符 |
| `safeSessionId(id)` | 替换sessionId中的非安全字符 |
| `truncateText(text, maxLen)` | 截断文本+省略号 |
| `ensureDir(fs, dirPath)` | 确保目录存在 |
| `safeJsonParse(raw)` | 安全JSON解析 |
| `safeJsonRead(fs, filePath)` | 安全JSON文件读取 |
| `filterAllowedKeys(input, keys)` | 白名单过滤设置字段 |
| `writeNDJsonLine(res, obj)` | 写NDJSON行到响应 |
| `jsonError(res, msg, statusCode)` | HTTP JSON错误响应 |
| `ndjsonError(res, msg)` | NDJSON格式错误响应 |
| `maskApiKey(token)` | API Key 脱敏（前4+后4） |

### 7.3 installer.js

| 函数 | 参数 | 说明 |
|------|------|------|
| `checkCommandExists(cmd)` | 命令名 | `where cmd` 检查命令是否存在 |
| `cleanupBundledTools(appDir, keepTools)` | 应用目录，保留列表 | 删除未勾选的安装包 |
| `installToolsStreaming(res, appDir, tools)` | HTTP响应，应用目录，工具列表 | NDJSON流式安装 |

**安装逻辑详情**:
- Node.js: 查找 `bundled-tools/node-*.msi` → `msiexec /i /qn /norestart` (PowerShell提权)
- Git: 查找 `bundled-tools/Git-*.exe` → `/VERYSILENT /NORESTART` (PowerShell提权)
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- 安装顺序: node → git → claude（Claude Code 需要 npm）
- 每个工具独立捕获 stderr，超限截断前200字符
- exit code 3010 视为成功（需要重启）
- **重要**: bundled-tools/ 目录必须包含 Git-2.54.0-64-bit.exe (63MB) 和 node-v24.16.0-x64.msi (32MB)

### 7.4 settings.js

| 函数 | 说明 |
|------|------|
| `load(appDir)` | 加载 mako-settings.json，合并默认值 |
| `save(appDir, newSettings)` | 保存设置（合并模式，保留非标字段如SETUP_COMPLETE） |
| `getAll(maskAuth)` | 读取全部设置，可选脱敏 |
| `getCurrentModel()` | 返回当前模型 |
| `setCurrentModel(model)` | 设置当前模型 |
| `buildEnv()` | 构建 Claude Code 环境变量：ANTHROPIC_BASE_URL, AUTH_TOKEN, API_KEY, MODEL, EFFORT 等 |

### 7.5 llm-presets.js

9 家供应商预设数据：
- DeepSeek / Anthropic / OpenRouter / 硅基流动 / 阿里百炼 / 火山方舟 / 腾讯混元 / Kimi / 百度千帆
- 每家包含：id, name, baseUrl, defaultModel, heavyModel, balancedModel, lightModel, subagentModel, authLabel, authUrl, note
- `getPreset(id)` / `getAllPresets()`

---

## 8. 资源文件 (assets/)

### 8.1 目录结构
```
assets/
├── backgrounds/         # 背景图（JPG）
│   ├── scene00_washitsu.jpg    # 和室
│   ├── scene01_bath.jpg        # 浴室
│   ├── scene02_dining.jpg      # 餐厅
│   ├── scene03_dojo.jpg        # 道场
│   ├── scene04_inn.jpg         # 旅店
│   ├── scene05_shrine.jpg      # 神社
│   └── wallpapers/             # 壁纸（标题画面用）
├── bgm/                # 背景音乐（m4a 30首）
├── images/             # 其他图片
│   └── 0cb495904212b96009e6e987647dba571389871921.jpg  # 茉子头像（wizard用）
├── sprites/            # 角色立绘
│   ├── makoto/         # 茉子立绘（多表情）
│   └── yoshino/        # 芳乃立绘（多表情）
└── voice/              # 语音文件
    ├── greet_00~29.wav        # 30条预生成问候语音
    └── think_*.wav            # 思考口头禅语音
```

### 8.2 背景图 → BGM 映射
| 背景图 | BGM 曲目 |
|--------|----------|
| scene00_washitsu.jpg | 17 - ひとときの安息.m4a |
| scene01_bath.jpg | 18 - くつろぎの間.m4a |
| scene02_dining.jpg | 23 - 田心屋.m4a |
| scene03_dojo.jpg | 21 - 鍛錬.m4a |
| scene04_inn.jpg | 02 - 今昔の街.m4a |
| scene05_shrine.jpg | 03 - 伝統と格式.m4a |
| _title (标题画面) | 01 - 恋ひ恋ふ縁 (Title Version).m4a |
| _default (默认) | 19 - 本日は晴天なり.m4a |

### 8.3 角色立绘文件清单

#### 茉子 (makoto/) — 64张
- 基础表情 (A00~A21) × 和服/围裙两种服装
- 基础表情 (B00~B09) × 两种服装
- 每种表情命名: `A00_smile.png`, `A01_attention.png`, `A02_cold.png` 等

#### 芳乃 (yoshino/) — 50张
- 基础表情 (A00~A24) × 两种服装

### 8.4 语音文件

#### 问候语音 greet_00~29.wav（30条）
- 打包版专用：预生成 WAV 文件，不实时 TTS 合成
- 每条对应 GREETING_POOL 中的一条问候语

#### 思考语音 think_*.wav（7条）
- `think_hmm.wav` - 嗯...
- `think_howto.wav` - 怎么说呢...
- `think_nyaru.wav` - 喵...
- `think_ah.wav` - 啊...
- `think_naruhodo.wav` - 原来如此...
- `think_wait.wav` - 等一下...
- `think_ababa.wav` - 阿巴巴...

---

## 9. BGM 系统

### 9.1 状态变量
- `bgmAudio`: 当前 Audio 元素
- `bgmVolume`: 音量 0-1（默认0.4）
- `bgmMuted`: 静音状态
- `bgmPreMuteVolume`: 静音前音量
- `currentBgmTrack`: 当前曲目文件名
- `bgmFadeTimer`: fade 动画定时器

### 9.2 功能
- 标题画面：播放标题曲 `01 - 恋ひ恋ふ縁 (Title Version).m4a`
- 游戏中：根据当前背景图自动切换对应 BGM
- BGM 切换：fade-in 1s + fade-out 1s
- 音量持久化：localStorage('bgm-settings')
- 音量调节：滚动条 0-100%
- 静音/恢复：切换时保存/恢复音量

### 9.3 操作
- `#bgm-volume`: 音量滑块
- `#bgm-mute-btn`: 静音切换按钮

---

## 10. 语音/TTS 系统

### 10.1 语音类型
| 类型 | 来源 | 触发时机 |
|------|------|----------|
| 问候语音 | `assets/voice/greet_NN.wav` | 新游戏开始，随机选一条 |
| 思考语音 | `assets/voice/think_*.wav` | AI思考中，随机播放一条(不打断) |
| 回复语音 | 无（打包版不使用TTS合成） | - |
| 历史重播 | `voice-data/` 缓存 或 `assets/voice/` 预生成 | 点击历史面板茉子消息 |

### 10.2 语音缓存 (voiceCache)
- 上限 200MB，FIFO 淘汰
- voiceId → { blob, url, size, timestamp }

### 10.3 [VOICE: ...] 标签解析
- 从回复文本中提取 `[VOICE: xxx]` 标签
- 显示时去除标签，用纯文本展示

### 10.4 重播机制
1. 先查内存缓存 (voiceCache)
2. 回退到服务端 `GET /api/voice/:voiceId`
3. 404时首次点击 → Toast "缄茉不言"
4. 二次点击相同ID → 重新生成语音

### 10.5 语音音量
- 独立于 BGM 音量
- 范围 0-1.0，默认 0.8
- localStorage 持久化

---

## 11. 角色立绘系统

### 11.1 状态变量
- `makotoCostumeIdx`: 茉子服装索引（0=和服，1=围裙）
- `yoshinoOutfit`: 芳乃服装索引
- `makotoExprIdx`: 茉子表情索引
- `yoshinoExprIdx`: 芳乃表情索引
- `exprTimer`: 表情切换定时器

### 11.2 角色位置状态
| 状态 | 茉子位置 | 芳乃位置 | 说明 |
|------|----------|----------|------|
| `claude`（茉子说话） | 居中 50% scale(1.06) | 右侧 46% scale(1) | 茉子居中、放大 |
| `user`（主人说话） | 左侧 4% scale(1) | 居中 50% scale(1.06) | 芳乃居中、放大 |
| `listening`（对方在听） | 左移 4%→-4% scale(0.65) | 右移 46%→60% scale(0.65) | 缩小+变暗 |
| `thinking`（思考中） | 左侧 4% scale(1) | 右侧 46% scale(1) | 两人归位 |
| idle（空闲） | 左侧 4% scale(1) | 右侧 46% scale(1) | 默认位置 |

- 位置切换 CSS transition: 0.7s cubic-bezier(0.4, 0, 0.2, 1)
- 变暗效果：filter brightness(0.55) + drop-shadow
- 茉子居中时 z-index=10

### 11.3 表情切换
- 每 5-10 秒随机切换一次
- 当前说话者的表情随机变化
- `setCharState(who)` → 设定角色状态
- `startExprCycle(who)` → 启动表情轮播定时器
- `stopExprCycle()` → 停止定时器

### 11.4 initialAssets()
- 加载茉子和芳乃的初始立绘
- 设置初始表情索引为随机值

---

## 12. 对话与历史系统

### 12.1 数据结构
```javascript
history = [
  { speaker: '主人'|'茉子', text: '消息内容', voiceId: 'vxxx' }  // voiceId可选
]
```

### 12.2 状态变量
- `gameStarted`: 是否在游戏中
- `isTyping`: 打字机动画进行中
- `isSending`: 正在发送消息/等待回复
- `currentText`: 当前正在显示的文字
- `sessionId`: 当前会话ID（每次存档/重试时更新）
- `currentSaveId`: 当前存档ID
- `currentModel`: 'flash' | 'pro'
- `currentQId`: 当前权限问题ID
- `uploadedFiles`: 待发送的文件列表

### 12.3 函数列表
| 函数 | 说明 |
|------|------|
| `showMsg(speaker, text, showInput)` | 显示消息+打字效果+历史记录 |
| `showLoading()` | 显示加载动画+思考气泡 |
| `sendMsg()` | 发送用户输入 |
| `chatWithClaude(msg, files)` | 流式调用Claude API |
| `waitTypeDone()` | 等待打字完成 |
| `typeWrite(text, cb)` | 打字机效果（8-16ms/字） |
| `renderMarkdown(text)` | 渲染Markdown+公式 |
| `setSpeaker(name)` | 设置说话者标签 |
| `showError(msg)` | 错误Toast |
| `showToast(msg)` | 成功Toast |

### 12.4 历史管理
- 消息自动加入 `history[]`
- `renderHistory()` → 渲染历史面板
- 自动存档：每次AI回复后调用 `autoSave()`
- 每个history item可绑定 voiceId（用于重播）

---

## 13. 存档系统

### 13.1 API 端点
- GET `/api/saves` → 列出存档（排序：最近更新在前）
- GET `/api/saves/:id` → 读取存档
- POST `/api/saves` → 保存存档（含自动生成标题）
- DELETE `/api/saves/:id` → 删除存档

### 13.2 存档数据结构
```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "title": "存档标题（取第一条主人消息前30字）",
  "history": [{ "speaker": "", "text": "", "voiceId": "" }],
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### 13.3 存档目录
- 存储位置: `{appDir}/saves/`
- 每个存档独立文件: `{id}.json`

### 13.4 自动存档逻辑
- 触发条件: AI回复完成 + 有历史记录 + 有 currentSaveId
- 调用时机: `chatWithClaude()` 最后、`saveAndExit()` 时
- 保存后显示 Toast「💾 已保存」2秒

### 13.5 手动存档
- `saveAndExit()`: 自动存档 → 停止语音 → 停止表情切换 → 停止思考气泡 → 隐藏UI → 回到标题画面
- 标题画面"继续游戏": 加载最近存档
- 存档列表: 点击加载/Markdown显示/删除

---

## 14. 环境变量/LLM 供应商

### 14.1 8个可配置字段
| 环境变量 | 标签 | 默认值 | 说明 |
|----------|------|--------|------|
| `ANTHROPIC_BASE_URL` | API 地址 | `https://api.deepseek.com/anthropic` | Claude兼容端点 |
| `ANTHROPIC_AUTH_TOKEN` | API Key | 空 | 密码字段 |
| `ANTHROPIC_MODEL` | 默认模型 | `deepseek-v4-flash` | 主模型 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Opus 映射 | `deepseek-v4-flash` | 重模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Sonnet 映射 | `deepseek-v4-flash` | 均衡模型 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Haiku 映射 | `deepseek-v4-flash` | 轻量模型 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 子 Agent 模型 | `deepseek-v4-flash` | 子Agent用 |
| `CLAUDE_CODE_EFFORT_LEVEL` | Effort Level | `max` | Claude Code effort |

### 14.2 设置文件
- 文件名: `mako-settings.json`
- 存储位置: 应用根目录
- 包含字段: 以上8个 + `SETUP_COMPLETE`（非标字段）
- 加载时合并默认值
- 保存时保留所有非标字段（如 `SETUP_COMPLETE`）

### 14.3 供应商预设（9家离线可用）
预设ID: deepseek, anthropic, openrouter, siliconflow, dashscope, volcano, tencent, moonshot, qianfan
- 点击填充: API地址 + 4个模型映射 + 子Agent模型
- 不覆盖已有 API Key
- 离线回退: 服务器不可用时使用内置6家预设

### 14.4 模型切换
- 游戏内: 右上角模型切换按钮 Flash↔Pro
- 设置面板: 两个模型选择按钮
- 聊天内: `/model flash` / `/model pro` 命令
- 切换后 Toast 提示
- 发送中不允许切换

### 14.5 API 连接测试
- POST `/api/test-connection` → 调用 `/v1/chat/completions`
- 自动去掉 `/anthropic` 后缀
- 超时 15 秒
- 返回 ok=true + 成功消息 / ok=false + 错误信息

---

## 15. 文件上传系统

### 15.1 前端逻辑
1. 用户点上传按钮 → 弹出文件选择器
2. 选择文件 → FileReader 读取为 base64
3. POST `/api/upload` → 服务器保存到 `uploads/{sessionId}/`
4. 显示文件标签（按类型图标: 🖼️📄📝📊💻📎）
5. 每个标签可删除 ×
6. 发送消息时将文件列表随 chat 请求发送

### 15.2 后端逻辑
- 存储位置: `{appDir}/uploads/{sessionId}/`
- 文件名安全过滤: 替换非法字符为 `_`
- 单次上传总大小限制: 50MB
- 文件列表随 chat 请求的 `uploadedFiles` 传给 Claude

---

## 16. 快捷指令系统

### 16.1 内置指令列表（33条）
| 指令 | 说明 |
|------|------|
| `/permission` | 管理工具权限 |
| `/btw` | 发送旁白消息 |
| `/clear` | 清除对话历史 |
| `/config` | 查看和修改配置 |
| `/model` | 切换AI模型 |
| `/fast` | 切换快速模式 |
| `/help` | 查看帮助信息 |
| `/init` | 初始化项目 CLAUDE.md |
| `/review` | 代码审查 |
| `/security-review` | 安全审查 |
| `/simplify` | 简化代码 |
| `/verify` | 验证代码变更 |
| `/run` | 启动并测试项目 |
| `/loop` | 循环执行命令 |
| `/pdf` | 处理PDF文件 |
| `/xlsx` | 处理Excel文件 |
| `/pptx` | 处理PowerPoint文件 |
| `/docx` | 处理Word文件 |
| `/code-review` | 代码审查 (skill) |
| `/scientific-writing` | 科学写作辅助 |
| `/literature-review` | 文献综述 |
| `/paper-lookup` | 查找论文 |
| `/deep-research` | 深度研究报告 |
| `/generate-image` | 生成图片 |
| `/exploratory-data-analysis` | 探索性数据分析 |
| `/statistical-analysis` | 统计分析 |
| `/scientific-visualization` | 科学可视化 |
| `/matplotlib` | Matplotlib 绘图 |
| `/seaborn` | Seaborn 绘图 |
| `/scikit-learn` | 机器学习 |
| `/pytorch-lightning` | PyTorch Lightning |
| `/markdown-mermaid-writing` | Mermaid 图表 |
| `/exa-search` | 深度搜索 |

### 16.2 弹窗逻辑
- 输入 `/` 触发弹窗
- 从服务器 GET `/api/commands` 获取最新列表
- 服务器不可用时使用 `DEFAULT_COMMANDS`
- 点击指令自动填入输入框

---

## 17. 自动更新系统

### 17.1 技术栈
- `electron-updater` v6.8.9
- `electron-builder` publish.generic provider
- NSIS 静默安装

### 17.2 状态机
- `idle` → `checking` → `downloading` → `downloaded` → 用户点击安装

### 17.3 状态字段
- `state`: idle/checking/available/downloading/downloaded/error
- `version`: 新版本号
- `progress`: 0-100
- `error`: 错误信息

### 17.4 前端 UI
- 当前版本号显示
- 状态文字 + 颜色
- 进度条
- 检查更新按钮 / 安装更新按钮
- 更新状态通过 IPC 推送实时更新

### 17.5 自动检查
- 首次：启动后 3 秒
- 后续：每 4 小时
- 手动：点击"检查更新"按钮

### 17.6 更新文件
- 状态文件: `.update-status.json`（Electron主进程写入，server.js API读取）

---

## 18. 樱花粒子动画

### 18.1 初始化
- `createSakura()` → 35片花瓣
- 随机位置（left 0-100%）
- 随机大小（6-20px）
- 随机动画时长（8-22秒）
- 随机延迟（0-20秒，用于错开起始位置）
- 随机飘移（-60~120px）
- 随机旋转（360-1080度）

### 18.2 CSS 动画
- 从上到下飘落
- 透明度变化：0 → 0.7 → 0.5 → 0.2 → 0
- CSS自定义属性: `--fall-dur`, `--delay`, `--drift`, `--spin`
- `pointer-events: none`（不阻挡点击）

---

## 19. 思考气泡系统

### 19.1 触发时机
- `showLoading()` 时启动
- `clearThinkBubbles()` 时停止（在第一个回复片段到达时）

### 19.2 显示逻辑
- 每 2.2-4 秒弹出一个气泡
- 内容来源：
  1. 优先：真实思考内容（从 Claude stream 的 thinking/reasoning 块提取）
  2. 回退：随机俏皮话（从 MAKOTO_THINK_PHRASES + THINK_PHRASES 合并池中随机）

### 19.3 气泡样式
- 深色半透明背景（`rgba(42,26,14,0.92)`）
- 金色边框（`rgba(212,168,83,0.45)`）
- blur 背景效果
- 最大宽度 280px
- 圆角 14px，带伪元素小三角
- 动画: 5.5s 上升淡出（0→0.9→0.55→0）
- 左右交替：茉子立绘两侧

### 19.4 思考短语池
- `MAKOTO_THINK_PHRASES`: 63条（忍者本职/小恶魔/恐高/厨房/纯情/日常/深夜/护卫/吐槽/逃避）
- `THINK_PHRASES`: 40条（芳乃风格，备用）
- `YOSHINO_THINK_PHRASES`: 20条（芳乃风格，仅用于状态栏轮播）

### 19.5 状态栏轮播
- `startYoshinoThinkCarousel()`: 每 3-5 秒换一条 `randomMakotoThink()`
- 仅在 `thinking` 状态下运行

---

## 20. 动画时序列表

| 触发 | 延迟 | 动画 | 期间 | 说明 |
|------|------|------|------|------|
| 页面加载 | 0 | 樱花飘落 | 持续 | 35片花瓣CSS动画 |
| 页面加载 | 0 | 背景粒子(wizard) | 持续 | 30个粒子CSS动画 |
| 新游戏 | 0 | 隐藏标题画面 | - | class隐藏 |
| 新游戏 | 400ms | 角色入场 | 700ms | CSS transition位置切换 |
| 新游戏 | 600ms | 问候语音播放 | 不定 | WAV播放 |
| 新游戏 | 600ms | 打字机效果 | 按字数 | 8-16ms/字 |
| 打字完成 | 0 | Markdown渲染 | 立即 | marked.js+KaTeX |
| 打字完成 | 0 | 显示输入框 | 200ms | class添加, focus |
| 发送消息 | 0 | 消息打字 | 不定 | 主人消息打字 |
| 发送消息 | 0 | 加载动画 | 持续 | 三点弹跳 |
| 发送消息 | 0 | 思考气泡启动 | 2.2s间隔 | 气泡上升 |
| 发送消息 | 0 | 思考语音播放 | 不定 | 随机选(不打断) |
| AI回复到达 | 0 | 清除气泡 | - | 清空layer+停止timer |
| AI回复到达 | 0 | 茉子打字 | 8-16ms/字 | 带Markdown渲染 |
| 背景切换 | 0 | 背景图过渡 | 1.5s | CSS transition |
| BGM切换 | 0 | fade-out | 1s | 旧曲目逐渐降低 |
| BGM切换 | 0 | fade-in | 1s | 新曲目逐渐升高 |
| 表情切换 | 5-10s间隔 | 表情随机变化 | - | 替换img src |
| 角色位置变化 | 0 | 位置切换 | 700ms | cubic-bezier |
| 对话框点击(打字中) | 0 | 跳打+渲染Markdown | 立即 | 跳过打字 |
| 对话框点击(非打字) | 0 | 语音重播 | 立即 | 仅茉子消息 |
| 权限问题弹窗 | 0 | 问题选项按钮 | 持续 | 三个选项按钮 |
| 设置面板 | 0 | 面板展开 | - | class show |
| Toast | 0 | 显示 | 2.5s/5s | 自动消失 |
| 存档保存 | 0 | Toast | 2s | 💾 已保存 |
| ESC | 0 | 逐层关闭 | 立即 | 编辑器→设置→存档→历史→退出 |
| 停止语音 | 0 | pause+remove src | 立即 | 含思考语音 |

---

## 附录 A：文件清单

```
E:\mako-package\
├── electron-main.js          # Electron主进程（窗口/生命周期/IPC/自动更新）
├── server.js                 # HTTP后端（聊天/TTS/设置/存档/安装）
├── preload.js                # Electron桥接(contextBridge)
├── galchat.html              # 前端界面（对话/设置/存档/角色/樱花/BGM）
├── wizard.html               # 首次配置向导（工具安装/API配置/供应商预设）
├── package.json              # 项目配置/build配置/依赖
├── package-lock.json         # 依赖锁
├── installer.nsh             # NSIS安装脚本（初始化/安装/卸载）
├── CLAUDE.md                 # 茉子人设（主设定）
├── LICENSE.txt               # 许可证（UTF-8 BOM）
├── icon.ico                  # 应用图标（⚠️ 需标准多尺寸32bit）
├── go.bat                    # 开发启动脚本（不被打包）
├── stop.bat                  # 开发停止脚本（不被打包）
├── .gitignore                # Git忽略规则
├── mako-settings.json        # 运行时设置（不被打包）
├── bundled-tools/            # 安装包（必需！）
│   ├── Git-2.54.0-64-bit.exe       # 63MB
│   └── node-v24.16.0-x64.msi      # 32MB
├── assets/
│   ├── images/
│   │   └── 0cb4959042...jpg        # 茉子头像（wizard用）
│   ├── backgrounds/         # 6张场景背景JPG
│   ├── bgm/                 # 30首BGM m4a
│   ├── sprites/             # 114张角色立绘PNG
│   └── voice/               # 37个WAV语音文件
├── lib/
│   ├── constants.js         # 共享常量
│   ├── utils.js             # 共享工具函数
│   ├── settings.js          # 设置管理
│   ├── installer.js         # 后台安装逻辑
│   └── llm-presets.js       # LLM供应商预设
├── saves/                   # 运行时：存档文件（不被打包）
├── uploads/                 # 运行时：上传文件（不被打包）
├── voice-data/              # 运行时：语音缓存（不被打包）
└── dist/                    # 构建输出
    └── MakoCode Setup 1.6.1.exe    # NSIS安装器
```

---

## 附录 B：构建检查清单

修改任何代码后打包前，逐一确认 ✅：

- [ ] `bundled-tools/` 目录存在且包含 Git-2.54.0-64-bit.exe + node-v24.16.0-x64.msi
- [ ] `icon.ico` 是标准多尺寸 32bit icon（不能是单尺寸16色）
- [ ] `wizard.html` 中的头像路径正确指向 `assets/images/`
- [ ] `mako-settings.json` 已在 `files` 排除列表中
- [ ] `*.jpg` 排除规则不会误伤 `assets/backgrounds/` 中的背景图
- [ ] `*.png` 排除规则不会误伤 `assets/sprites/` 中的立绘
- [ ] `bundled-tools/**` 在 `files` 包含列表中
- [ ] `installer.nsh` 在 `files` 排除列表中（build时会自动找到）
- [ ] 打包命令：`npx electron-builder --win`
- [ ] 打包后验证：安装器大小约 479MB（含 bundled-tools）
- [ ] 打包后验证：`dist/win-unpacked/resources/app/assets/` 中背景图/立绘/语音存在
- [ ] 打包后验证：`dist/win-unpacked/resources/app/bundled-tools/` 存在安装包
- [ ] 打包后验证：`dist/win-unpacked/resources/app/wizard.html` 中头像路径正确
- [ ] 打包后安装测试：向导显示正常+头像显示正常+自动安装功能正常
