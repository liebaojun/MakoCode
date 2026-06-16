# MakoCode（常陆茉子）— 全面功能概览 v1.6.1

> 本文档面向 AI 评审，全面、客观地记录 MakoCode 的所有功能。
> 基于实际代码分析，不夸大不遗漏，涵盖从核心到细节的每一个功能点。

---

## 目录

1. [软件概述](#1-软件概述)
2. [Galgame 视觉界面](#2-galgame-视觉界面)
3. [角色立绘与表情系统](#3-角色立绘与表情系统)
4. [对话系统](#4-对话系统)
5. [语音系统](#5-语音系统)
6. [BGM 背景音乐系统](#6-bgm-背景音乐系统)
7. [思考气泡与状态指示](#7-思考气泡与状态指示)
8. [樱花粒子动画](#8-樱花粒子动画)
9. [茉子人设编辑器](#9-茉子人设编辑器)
10. [多 LLM 后端支持](#10-多-llm-后端支持)
11. [系统设置面板](#11-系统设置面板)
12. [文件上传系统](#12-文件上传系统)
13. [快捷指令系统](#13-快捷指令系统)
14. [存档系统](#14-存档系统)
15. [标题画面与游戏流程](#15-标题画面与游戏流程)
16. [首次配置向导](#16-首次配置向导)
17. [一键环境配置](#17-一键环境配置)
18. [安装包与分发](#18-安装包与分发)
19. [自动更新系统](#19-自动更新系统)
20. [Skills/插件文件夹管理](#20-skills插件文件夹管理)
21. [输入框自动扩展](#21-输入框自动扩展)
22. [开发与调试工具](#22-开发与调试工具)

---

## 1. 软件概述

MakoCode 是一个**集成式 AI 对话伴侣桌面应用**，以柚子社《千恋＊万花》角色**常陆茉子**为主题形象。它将 Claude Code CLI 封装为 Galgame 风格的图形界面，实现"与 Galgame 角色对话"的体验。

**一句话定位**: 一个自带完整 Galgame 前端、可一键安装依赖、支持 9 家 LLM 供应商的 AI 伴侣桌面应用。

**核心特点**:
- 基于 Electron 的跨平台桌面应用（当前面向 Windows）
- 后端使用 Node.js 原生 HTTP 服务器，零外部依赖
- 集成 Claude Code CLI 作为 AI 引擎
- NSIS 安装器分发，预装 Node.js/Git/Claude Code
- 纯前端视觉呈现，无需额外游戏引擎
- 全部代码约 7500 行（HTML + JS + CSS 混合，含 5 个后端模块）

---

## 2. Galgame 视觉界面

### 2.1 主界面布局
- **z-index 分层架构**：背景(0) → 樱花(5) → 角色立绘(8) → 对话框(20) → 思考气泡(25) → 标题画面(100) → 模态框(200+)
- **深木色主题** (`#1A1410`)，和风 UI 设计
- **背景图系统**：6 张场景背景（和室/浴室/餐厅/道场/旅店/神社），切换动画 1.5s
- **对话框**：底部和纸色 (`#F5F0E8`) 对话框，说话者标签（茉子=红色，主人=金色）
- **角色立绘**：茉子和芳乃双角色立绘，支持位置动画和表情切换

### 2.2 背景图
- 6 张 JPG 场景背景图（assets/backgrounds/）
- 每张背景对应特定期 BGM 曲目
- 默认显示/标题画面显示独立壁纸
- 切换时 1.5s CSS transition 淡入淡出

### 2.3 标题画面
- "新游戏" → 开始新对话
- "继续游戏" → 加载最近存档
- "读取存档" → 打开存档列表
- "流程图" → 预留占位按钮
- "系统设置" → 打开设置面板
- "退出游戏" → 关闭窗口
- 标题背景使用独立壁纸层

---

## 3. 角色立绘与表情系统

### 3.1 立绘资源
- **茉子立绘（makoto/）**: 64 张 PNG（基础表情 A00~A09/A10~A21 × 和服/围裙两种服装）
- **芳乃立绘（yoshino/）**: 50 张 PNG（基础表情 A00~A24 × 两种服装）
- 每种表情有含义命名：A00_smile、A01_attention、A02_cold 等

### 3.2 位置状态机
| 状态 | 茉子位置 | 芳乃位置 | 触发 |
|------|----------|----------|------|
| claude（茉子说话） | 居中 50% scale(1.06) | 右侧 46% scale(1) | AI回复时 |
| user（主人说话） | 左侧 4% scale(1) | 居中 50% scale(1.06) | 用户输入时 |
| listening（对方在听） | 左移缩小 scale(0.65) | 右移缩小 scale(0.65) | 输入框聚焦时 |
| thinking（思考中） | 左侧 4% scale(1) | 右侧 46% scale(1) | AI思考时 |
| idle（空闲） | 左侧 4% scale(1) | 右侧 46% scale(1) | 默认 |
- 位置切换 CSS transition: 0.7s cubic-bezier(0.4, 0, 0.2, 1)
- 非说话角色 filter brightness(0.55) + drop-shadow 变暗
- 角色居中时 z-index=10

### 3.3 表情切换
- 每 5-10 秒随机切换一次
- 当前说话者的表情随机变化
- 自动轮播定时器管理
- `setCharState()` / `startExprCycle()` / `stopExprCycle()` 控制

---

## 4. 对话系统

### 4.1 工作方式
- 后端通过 stdin 以 stream-json 格式调用 `claude.exe --print`
- 支持 `--session-id` 会话持久化
- NDJSON 流式输出实时推送到前端
- 支持工具调用（Bash/Read/Write/Glob/Grep 及 Playwright 浏览器操作等）

### 4.2 打字机效果
- 茉子回复逐字显示（8-16ms/字，比旧版快约 2 倍）
- 点击对话框跳过打字动画（跳打）
- 打字完成后自动渲染 Markdown（使用 marked.js）
- 支持 KaTeX 公式渲染（行内 $...$、块级 $$...$$）
- 链接默认新标签页打开
- 完成后显示「✦ 点击继续」提示

### 4.3 历史管理
- 客户端维护历史记录数组
- 每次发送消息带最近 20 条历史
- 服务端分层注入：最近 10 轮保留原文，10 轮以前压缩为摘要（60 字截断+省略号）
- 早期对话标记「【早期对话摘要】」，近期标记「【最近对话】」

### 4.4 模型切换
- 右上角模型切换按钮 Flash↔Pro
- 设置面板中两个模型选择按钮
- 聊天内 `/model flash` / `/model pro` 指令
- 发送中不允许切换，切换后 Toast 提示

### 4.5 权限问题处理
- 自动检测 Claude 的权限问题（工具使用、文件访问等）
- 弹窗显示选项按钮（允许/总是允许/拒绝）
- 通过 stdin 保持打开的通道回写答案
- 支持后端排队的待回答问题队列

---

## 5. 语音系统

### 5.1 语音类型
| 类型 | 来源 | 触发 |
|------|------|------|
| 问候语音 | assets/voice/greet_00~29.wav（30 条预生成） | 新游戏开始随机选一条 |
| 思考语音 | assets/voice/think_*.wav（7 条：嗯.../怎么说呢.../喵.../啊.../原来如此.../等一下.../阿巴巴...） | AI 思考中随机播放（不打断） |
| 回复语音 | 无（打包版不使用实时 TTS 合成） | - |
| 历史重播 | voice-data/ 缓存或 assets/voice/ 预生成 | 点击历史面板茉子消息 |

### 5.2 语音缓存
- 上限 200MB，FIFO 淘汰策略
- voiceId → { blob, url, size, timestamp }
- 重播机制：查内存缓存 → 服务端 GET /api/voice/:voiceId → 404 提示

### 5.3 音量控制
- 语音音量独立于 BGM
- 范围 0-1.0，默认 0.8
- localStorage 持久化

### 5.4 VOICE 标签
- 回复文本中嵌入 `[VOICE: xxx]` 标签
- 显示时隐藏标签，纯文本展示
- 用于实现语音与文本同步

---

## 6. BGM 背景音乐系统

### 6.1 音乐资源
- 30 首 m4a 格式 BGM（来自《千恋＊万花》原声带）
- 标题画面曲：《01 - 恋ひ恋ふ縁 (Title Version).m4a》

### 6.2 映射规则
| 场景 | BGM 曲目 |
|------|----------|
| 和室 | 17 - ひとときの安息.m4a |
| 浴室 | 18 - くつろぎの間.m4a |
| 餐厅 | 23 - 田心屋.m4a |
| 道场 | 21 - 鍛錬.m4a |
| 旅店 | 02 - 今昔の街.m4a |
| 神社 | 03 - 伝統と格式.m4a |
| 标题画面 | 01 - 恋ひ恋ふ縁 (Title Version).m4a |
| 默认 | 19 - 本日は晴天なり.m4a |

### 6.3 功能
- 背景切换时自动切换对应 BGM
- fade-in 1s + fade-out 1s 过渡
- 音量滑块（0-100%）+ 静音按钮
- 音量持久化到 localStorage
- 静音保存/恢复前一音量

---

## 7. 思考气泡与状态指示

### 7.1 思考气泡
- 触发时机：AI 回复等待时
- 每 2.2-4 秒弹出一个气泡
- 内容来源：优先使用 Claude stream 的 thinking/reasoning 块 → 回退随机俏皮话（63 条茉子风格短语）
- 气泡样式：深色半透明背景 + 金色边框 + blur 效果 + 小三角
- 上升淡出动画 5.5 秒
- 左右交替从立绘两侧弹出

### 7.2 状态指示器 (`#status-dot`)
- disconnected（灰色圆点）
- connected（绿色圆点 + "已连接"）
- thinking（黄色圆点 + 随机思考短语轮播，每 3-5 秒）

### 7.3 加载动画
- 三点弹跳圆点动画
- 与思考气泡和状态栏轮播同时运行

---

## 8. 樱花粒子动画

### 8.1 参数
- 35 片花瓣同时飘落
- 随机位置（left 0-100%）
- 随机大小（6-20px）
- 随机动画时长（8-22 秒）
- 随机延迟（0-20 秒）
- 随机飘移（-60~120px）
- 随机旋转（360-1080 度）

### 8.2 视觉效果
- 透明度变化：0 → 0.7 → 0.5 → 0.2 → 0
- pointer-events: none（不阻挡点击）
- CSS 自定义属性控制每片花瓣的行为

---

## 9. 茉子人设编辑器

### 9.1 打开方式
- 系统设置面板 → "修改茉子人设" 按钮（紫色高亮）

### 9.2 编辑界面
- **双标签页**：主设定（CLAUDE.md）/ 世界观（SKILL.md）
- 全屏半透明模糊遮罩层
- Markdown 编辑器（textarea），带滚动条
- 底部提示：「修改将在保存后、下次启动茉子时生效」
- 保存按钮（绿色）+ 取消按钮

### 9.3 读写流程
- 优先通过 Electron IPC（read-persona / write-persona）
- 回退到 HTTP API（GET/POST /api/persona）
- 读取：从 `CLAUDE.md`（角色主设定）和 `.claude/skills/mako-lore/SKILL.md`（世界观背景）加载内容
- 保存：写入上述两个文件

### 9.4 生效机制
- 保存时写入磁盘文件
- 新会话时（history 为空），服务端自动读取两个文件并注入到 Claude 的 prompt 头部
- 已有历史时不重复注入以节省 token
- 修改后需要开始新游戏才能看见效果

---

## 10. 多 LLM 后端支持

### 10.1 支持的 9 家供应商
| 供应商 | 预设 ID |
|--------|---------|
| DeepSeek | deepseek |
| Anthropic | anthropic |
| OpenRouter | openrouter |
| 硅基流动 | siliconflow |
| 阿里百炼 | dashscope |
| 火山方舟 | volcano |
| 腾讯混元 | tencent |
| Kimi（月之暗面） | moonshot |
| 百度千帆 | qianfan |

### 10.2 预设数据
- 每家包含：id, name, baseUrl, defaultModel, heavyModel, balancedModel, lightModel, subagentModel, authLabel, authUrl, note
- 全部来自官方文档核实
- 点击预设卡片 → 一键填充 API 地址 + 模型名（不覆盖已有 API Key）

### 10.3 配置字段（8 个）
| 环境变量 | 用途 | 默认值 |
|----------|------|--------|
| ANTHROPIC_BASE_URL | API 地址 | https://api.deepseek.com/anthropic |
| ANTHROPIC_AUTH_TOKEN | API Key | 空（密码字段） |
| ANTHROPIC_MODEL | 主模型 | deepseek-v4-flash |
| ANTHROPIC_DEFAULT_OPUS_MODEL | 重模型映射 | deepseek-v4-flash |
| ANTHROPIC_DEFAULT_SONNET_MODEL | 均衡模型映射 | deepseek-v4-flash |
| ANTHROPIC_DEFAULT_HAIKU_MODEL | 轻量模型映射 | deepseek-v4-flash |
| CLAUDE_CODE_SUBAGENT_MODEL | 子 Agent 模型 | deepseek-v4-flash |
| CLAUDE_CODE_EFFORT_LEVEL | Effort 级别 | high |

### 10.4 离线回退
- 服务器不可用时使用内置 6 家核心预设
- 设置数据持久化到 mako-settings.json
- API Key 在界面中脱敏显示（前 4 + **** + 后 4）

---

## 11. 系统设置面板

### 11.1 功能列表
- **模型切换**：Flash / Pro 按钮，高亮当前模型
- **环境变量设置**：8 个字段的输入框 + 密码框 + 📋 供应商预设弹窗
- **版本更新区域**：当前版本号 + 检查更新按钮 + 安装更新按钮 + 进度条
- **打开 Skills 文件夹**：一键跳转到 `~/.claude/skills/`
- **打开插件文件夹**：一键跳转到 `~/.claude/plugins/`
- **修改茉子人设**：打开人设编辑器（第 9 节）

### 11.2 弹窗交互
- 供应商预设弹窗：显示 9 家供应商卡片，点击填充配置
- 设置保存后自动关闭面板

---

## 12. 文件上传系统

### 12.1 操作流程
1. 点击输入框旁上传按钮 → 弹出文件选择器
2. 选择文件 → 浏览器 FileReader 读取为 base64
3. POST `/api/upload` → 服务端保存到 `uploads/{sessionId}/`
4. 输入框上方显示文件标签栏
5. 文件标签图标按类型区分：🖼️ 图片 / 📄 文档 / 📝 文本 / 📊 数据 / 💻 代码 / 📎 其他

### 12.2 后端处理
- 存储位置：`{appDir}/uploads/{sessionId}/`
- 文件名安全过滤：替换非法字符为 `_`
- 单次上传大小限制：50MB
- 文件路径随 chat 请求的 `uploadedFiles` 传给 Claude

### 12.3 文件标签交互
- 每个标签有 × 删除按钮
- 可同时上传多个文件
- 发送时一并发送给 Claude

---

## 13. 快捷指令系统

### 13.1 触发方式
- 输入 `/` 触发指令弹窗
- 从服务端 GET `/api/commands` 获取最新指令列表
- 服务器不可用时使用内置默认列表
- 点击指令自动填入输入框

### 13.2 内置指令列表（33 条）
/permission（权限管理）、/btw（旁白）、/clear（清除历史）、/config（配置）、/model（切换模型）、/fast（快速模式）、/help（帮助）、/init（初始化 CLAUDE.md）、/review（代码审查）、/security-review（安全审查）、/simplify（简化代码）、/verify（验证变更）、/run（启动项目）、/loop（循环执行）、/pdf（PDF 处理）、/xlsx（Excel 处理）、/pptx（PPT 处理）、/docx（Word 处理）、/code-review（代码审查 skill）、/scientific-writing（科学写作）、/literature-review（文献综述）、/paper-lookup（论文查找）、/deep-research（深度研究）、/generate-image（图片生成）、/exploratory-data-analysis（探索性数据分析）、/statistical-analysis（统计分析）、/scientific-visualization（科学可视化）、/matplotlib（绘图）、/seaborn（Seaborn 绘图）、/scikit-learn（机器学习）、/pytorch-lightning（PyTorch）、/markdown-mermaid-writing（Mermaid 图表）、/exa-search（深度搜索）

---

## 14. 存档系统

### 14.1 功能
- 自动存档：每次 AI 回复完成后自动保存
- 手动存档：按 ESC → "保存并退出"
- 读取存档：标题画面 → "继续游戏" 或 "读取存档"
- 删除存档：存档列表 → 删除按钮 → 确认删除

### 14.2 数据格式
- 每个存档独立 JSON 文件：`{appDir}/saves/{id}.json`
- 字段：id、sessionId、title、history[]、createdAt、updatedAt
- 标题自动取第一条主人消息前 30 字

### 14.3 自动存档逻辑
- 触发条件：AI 回复完成 + 有历史记录 + 有 currentSaveId
- 频率：每次 AI 回复后
- 保存时显示 Toast「💾 已保存」2 秒

### 14.4 界面
- 标题画面 → "继续游戏" 加载最近存档
- 存档列表：显示标题、时间、消息数
- 空列表显示「还没有存档记录」

---

## 15. 标题画面与游戏流程

### 15.1 游戏生命周期
1. **标题画面**：展示主菜单（新游戏/继续游戏/读取存档/系统设置/退出）
2. **新游戏**：隐藏标题 → 角色入场动画（700ms）→ 茉子问候语音 + 打字问候
3. **对话循环**：用户输入 → 角色状态切换 → AI 思考 → 茉子打字回复
4. **退出**：自动存档 → 停止语音/表情/气泡 → 回到标题画面

### 15.2 动画时序
- 角色入场：400ms 延迟 → 700ms CSS transition
- 问候语音：600ms 延迟后播放
- 打字动画：8-16ms/字
- 角色位置切换：700ms cubic-bezier
- 背景切换：1.5s CSS transition
- BGM 切换：fade-in 1s + fade-out 1s
- 表情切换：每 5-10 秒随机变化
- Toast 消失：成功 2.5 秒 / 错误 5 秒

### 15.3 ESC 快捷键
| 条件 | 行为 |
|------|------|
| 人设编辑器打开 | 关闭编辑器 |
| 设置面板打开 | 关闭设置 |
| 存档列表打开 | 关闭存档 |
| 历史面板打开 | 关闭历史 |
| 游戏中（非打字/发送中） | 存档并返回标题 |

---

## 16. 首次配置向导

### 16.1 触发条件
- 首次安装运行时自动弹出（检测 mako-settings.json 无 SETUP_COMPLETE 标记）
- 服务端 30 秒超时检测（waitForServer）
- 超时后回退到 file:// 模式加载向导

### 16.2 向导步骤
**Step 0 - 工具检测**：自动检测 Node.js / Git / Claude Code 安装状态 → 复选框选择需要安装的工具
**Step 1 - 后台安装**（有条件）：静默安装未安装的工具 → 实时进度显示 → 终端风格日志
**Step 2 - 配置 API**：API 地址 + API Key + 模型名 → 预设弹窗
**Step 3 - 测试连接**：测试 API 连通性 → 成功/失败消息
**Step 4 - 完成设置**：选择保留/删除安装包 → 标记设置完成 → 进入主界面

### 16.3 安装顺序
Node.js → Git → Claude Code（Claude Code 依赖 npm）

### 16.4 紫幕粒子动画
- 30 个紫色圆点浮动上升（8 秒循环）
- 随机大小 1-5px、随机位置、随机延迟

---

## 17. 一键环境配置

### 17.1 预装工具
三个工具打包在安装器中（bundled-tools/ 目录，共约 95MB）：
- **Node.js**：node-v24.16.0-x64.msi（约 32MB）
- **Git**：Git-2.54.0-64-bit.exe（约 63MB）
- **Claude Code**：通过 npm 全局安装 @anthropic-ai/claude-code

### 17.2 安装方式
- Node.js：msiexec /i /qn /norestart（PowerShell 提权）
- Git：/VERYSILENT /NORESTART（PowerShell 提权）
- Claude Code：npm install -g（自动拼接 Node.js 到 PATH）

### 17.3 自动检测与幂等性
- each 工具安装前先通过 `where` 命令检测是否已安装
- 已安装的自动取消勾选
- 用户可自行选择需要安装的工具

### 17.4 提权机制
- 使用 PowerShell Start-Process -Verb RunAs -Wait 提权
- 需用户点击 UAC 确认
- 安装日志实时回显到向导终端框

---

## 18. 安装包与分发

### 18.1 安装器
- **技术**：electron-builder + NSIS
- **安装方式**：用户可选择安装路径
- **图标**：自绘 icon.ico
- **侧边图**：安装器左侧展示茉子插画（164x314 BMP）
- **许可协议**：显示 LICENSE.txt（非商业用途）
- **桌面快捷方式**：创建 MakoCode 快捷方式
- **安装路径**：自动追加 \MakoCode 子目录
- **数据目录**：自动创建 saves/uploads/voice-data/
- **卸载**：弹窗选择保留或删除数据

### 18.2 安装器大小
- 完整安装器约 479MB（含 bundled-tools）
- 解压后约 600MB

### 18.3 构建命令
```bash
npx electron-builder --win           # 完整安装器
npx electron-builder --win --dir     # 仅解压（调试用）
```

---

## 19. 自动更新系统

### 19.1 技术栈
- electron-updater v6.8.9
- electron-builder publish.generic provider
- NSIS 静默安装

### 19.2 工作机制
- 状态机：idle → checking → downloading → downloaded → 用户点击安装
- 启动后 3 秒首次检查
- 之后每 4 小时自动检查
- 手动点击「检查更新」按钮触发
- autoDownload: true（自动下载）
- autoInstallOnAppQuit: false（用户确认后安装）

### 19.3 状态字段
- state：idle/checking/available/downloading/downloaded/error
- version：新版本号
- progress：0-100
- error：错误信息

### 19.4 前端 UI
- 当前版本号显示
- 状态文字 + 颜色指示
- 下载进度条
- 检查更新 / 安装更新按钮

---

## 20. Skills/插件文件夹管理

### 20.1 功能入口
- 系统设置面板 → "打开 Skills 文件夹" 按钮
- 系统设置面板 → "打开插件文件夹" 按钮

### 20.2 实现方式
- Electron 模式：通过 IPC (open-skills-folder / open-plugins-folder) 调用 shell.openPath()
- 浏览器模式：通过 HTTP API 调用 explorer.exe

### 20.3 打开的路径
- Skills 文件夹：`~/.claude/skills/`
- 插件文件夹：`~/.claude/plugins/`

---

## 21. 输入框自动扩展

### 21.1 功能
- 输入框从 `<input>` 改为 `<textarea>`
- 文字超长时自动扩展高度（40px → 160px，最高 4 倍）
- 扩展时对话层自动上移避免重叠
- 发送后自动恢复原始高度

### 21.2 交互
- Enter 发送消息
- Shift+Enter 换行
- 发送按钮在输入框右侧
- 发送中禁用输入

---

## 22. 开发与调试工具

### 22.1 启动脚本
- **go.bat**：一键启动开发环境（node server.js）
- **stop.bat**：停止服务器（taskkill /F /T）

### 22.2 服务日志
- 服务器日志带有 [server] [settings] 前缀
- 支持细粒度日志级别
- 日志输出到 stderr（不干扰 HTTP 响应）

### 22.3 模块结构（lib/）
- `constants.js`：22 个全局常量（端口/MIME/窗口大小等）
- `utils.js`：14 个可复用工具函数
- `settings.js`：设置管理（加载/保存/构建环境变量）
- `installer.js`：后台安装逻辑（Node/Git/Claude Code）
- `llm-presets.js`：9 家 LLM 供应商预设数据

### 22.4 防递归保护
- `MAKO_SERVER_MODE=1`：子进程检测后只运行 server.js，不创建 Electron 窗口
- 防止 spawn(process.execPath) → Electron 再 spawn 的无限循环

### 22.5 端口清理
- 启动前自动检测并杀死占用 8080 端口的所有进程
- 使用 taskkill /F /T 强制杀死进程树
- 解决 Windows 上 SIGTERM 不可靠的问题

### 22.6 辅助脚本
- `generate-greet-voices.ps1`：使用 TTS 批量生成 30 条问候语音

---

## 功能速查表（快速参考）

| 功能分类 | 具体功能 | 入口位置 |
|----------|----------|----------|
| 对话 | AI 聊天 | 输入框 + Enter 发送 |
| 对话 | 历史管理 | 右侧滑出面板 |
| 对话 | 模型切换 | 右上角按钮 / 设置面板 / 聊天 /model 命令 |
| 对话 | 权限问答 | 弹窗按钮 |
| 对话 | Markdown 渲染 | 自动渲染 |
| 对话 | KaTeX 公式 | $...$ / $$...$$ |
| 对话 | 快捷指令 | 输入 / 触发弹窗 |
| 对话 | 打字机效果 | 自动，点击跳过 |
| 角色 | 立绘切换 | 自动（按说话者） |
| 角色 | 表情切换 | 自动（5-10 秒轮播） |
| 角色 | 角色入场 | 新游戏 700ms 动画 |
| 语音 | 问候语音 | 新游戏自动播放 |
| 语音 | 思考语音 | AI 思考时随机播放 |
| 语音 | 语音重播 | 点击历史消息 |
| 语音 | 音量控制 | 设置面板滑块 |
| BGM | 背景音乐 | 自动切换 |
| BGM | 音量/静音 | 设置面板滑块/按钮 |
| 视觉 | 樱花粒子 | 永远飘落 |
| 视觉 | 背景图切换 | 自动（1.5s） |
| 视觉 | 思考气泡 | AI 思考时弹出 |
| 人性化 | 输入框自动扩展 | 文字超时自动变高 |
| 人性化 | 文件上传 | 输入框旁上传按钮 |
| 设置 | 环境变量配置 | 设置面板，8 个字段 |
| 设置 | 供应商预设 | 设置面板 📋 按钮 |
| 设置 | 打开 Skills 文件夹 | 设置面板按钮 |
| 设置 | 打开插件文件夹 | 设置面板按钮 |
| 设置 | 修改人设 | 设置面板 → 人设编辑器 |
| 设置 | 测试连接 | 设置面板/向导 |
| 设置 | 版本更新 | 设置面板检查更新 |
| 存档 | 自动存档 | 每次 AI 回复后 |
| 存档 | 手动存档 | ESC → 保存并退出 |
| 存档 | 读取存档 | 标题画面 / 存档列表 |
| 存档 | 删除存档 | 存档列表 → 删除按钮 |
| 首次运行 | 工具检测 | 向导 Step 0 |
| 首次运行 | 一键安装 | 向导 Step 1（静默安装） |
| 首次运行 | API 配置 | 向导 Step 2 + 预设弹窗 |
| 首次运行 | 连接测试 | 向导 Step 3 |
| 首次运行 | 完成设置 | 向导 Step 4 |
| 特色 | 茉子人设编辑器 | 主设定 + 世界观双标签 |
| 特色 | 一键环境配置 | Node.js + Git + Claude Code |
| 特色 | 9 家 LLM 供应商 | 一键切换和填充 |
| 特色 | Galgame 界面 | 立绘 + 背景 + BGM + 樱花 |
| 特色 | 自动更新 | 静默下载 + 手动安装 |

---

## 附录 A：技术栈总览

| 层面 | 技术 |
|------|------|
| 桌面框架 | Electron 31+ |
| 前端 | 原生 HTML + CSS + JavaScript（零框架） |
| 后端 | Node.js HTTP Server（零外部依赖） |
| AI 引擎 | Claude Code CLI |
| 构建 | electron-builder + NSIS |
| 更新 | electron-updater |
| Markdown 渲染 | marked.js |
| 公式渲染 | KaTeX |
| 语音 | 预生成 WAV / GPT-SoVITS |
| 立绘 | PNG 序列（114 张） |
| BGM | m4a 音频（30 首） |
| 设置持久化 | mako-settings.json + localStorage |
| 存档持久化 | JSON 文件独立存储 |

## 附录 B：文件结构总览

```
E:\mako-package\
├── electron-main.js         # Electron 主进程（窗口/生命周期/IPC/自动更新）
├── server.js                # HTTP 后端（聊天/TTS/设置/存档/安装）
├── preload.js               # Electron 桥接（contextBridge）
├── galchat.html             # 前端界面（对话/设置/存档/角色/樱花/BGM）
├── wizard.html              # 首次配置向导（工具安装/API 配置/供应商预设）
├── package.json             # 项目配置/构建配置/依赖
├── installer.nsh            # NSIS 安装脚本
├── CLAUDE.md                # 茉子人设（主设定）
├── LICENSE.txt              # 许可证
├── mako-settings.json       # 运行时设置
├── icon.ico                 # 应用图标
├── go.bat / stop.bat        # 开发启动/停止脚本
├── bundled-tools/           # 安装包（Node.js MSI + Git EXE）
├── lib/                     # 共享模块
│   ├── constants.js         # 共享常量
│   ├── utils.js             # 工具函数
│   ├── settings.js          # 设置管理
│   ├── installer.js         # 后台安装逻辑
│   └── llm-presets.js       # LLM 供应商预设
├── assets/                  # 资源文件
│   ├── images/              # 头像
│   ├── backgrounds/         # 6 张场景背景
│   ├── bgm/                 # 30 首 BGM
│   ├── sprites/             # 114 张角色立绘
│   └── voice/               # 37 个 WAV 语音
├── saves/                   # 运行时存档
├── uploads/                 # 运行时上传文件
└── dist/                    # 构建输出（安装器）
```
