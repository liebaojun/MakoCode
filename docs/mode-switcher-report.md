# MakoCode 模式切换功能 — 完整可实施调研报告

> 📅 2026-06-21 · 调研版本 v1.0
> 🎯 目标：在聊天界面右侧添加四种 Claude Code 工作模式的竖排切换器

---

## 一、背景与问题

### 1.1 用户反馈

v1.6.3 发布后，B站大量用户反馈**茉子请求权限的弹窗出现过于频繁**。根因分析：

- MakoCode 仅实现了 **默认模式（default）**，即每次工具调用、文件写入、Shell 执行都需要用户点确认
- Claude Code 原生支持 4 种工作模式，用户可根据场景切换以平衡效率与安全
- MakoCode 缺失模式切换入口 → 所有用户被迫使用最保守的交互方式 → 弹窗疲劳

### 1.2 原版 Claude Code 的四种模式

| 模式 | CLI Flag | 行为 |
|------|----------|------|
| **默认模式** (Default) | *(无 flag)* | 读操作自动允许；写/Shell/编辑弹出确认。最安全，适合新手 |
| **接受编辑** (Accept Edits) | `--accept-edits` | 文件编辑/写入自动批准；Shell 命令仍弹出确认。日常编码首选 |
| **计划模式** (Plan Mode) | `--plan` | 纯只读——可分析、描述方案，但**不能执行任何写操作或 Shell 命令**。代码审查/架构设计 |
| **自动模式** (Bypass) | `--dangerously-skip-permissions` | 跳过所有权限提示。仅适合 CI/CD、Docker 沙箱环境 |

---

## 二、UI 设计方案

### 2.1 设计语言对齐

MakoCode 现有设计系统（从 `galchat.html` CSS 变量提取）：

| Token | 值 | 用途 |
|-------|-----|------|
| `--sumi` | `#1A1410` | 最深底色（墨色） |
| `--wood-dark` | `#2A1A0E` | 面板背景 |
| `--wood` | `#3C2415` | 中等面板 |
| `--gold` | `#D4A853` | 主强调色（金色） |
| `--vermilion` | `#C53B3B` | 行动色（朱红） |
| `--washi` | `#F5F0E8` | 主文字色（和纸白） |
| `--washi-dim` | `#D8CFC0` | 次要文字 |
| `--sakura` | `#F4C6C6` | 樱花粉（温柔强调） |
| 字体 | Noto Sans SC | Google Fonts 加载 |
| 花体 | Dancing Script | 特殊装饰 |

**设计风格归类**：DARK-PREMIUM（深色底 + 金色发光强调 + 和风质感）

### 2.2 模式选择器视觉规格

#### 整体形态

```
┌────────────────────────────┐
│  #game-container           │
│                            │
│    ┌──┐                    │
│    │  │ ← 竖长圆角容器      │
│    │自│    (椭圆形/胶囊形)   │
│    │动│                    │
│    │  │                    │
│    │计│ ← 胶囊按钮（被点亮） │
│    │划│                    │
│    │  │                    │
│    │编│                    │
│    │辑│                    │
│    │  │                    │
│    │默│                    │
│    │认│                    │
│    └──┘                    │
│                 ┌────────┐ │
│                 │ 对话区  │ │
│                 └────────┘ │
└────────────────────────────┘
```

**容器规格**：
- 位置：`position: absolute; right: 8px; top: 50%; transform: translateY(-50%);`
- 外观：竖长椭圆形（胶囊形），`border-radius: 28px`（宽高比约 1:6）
- 宽度：`44px`（内容区 36px + padding）
- 高度：`240px`（4 个模式 × 60px 每个）
- 背景：`rgba(42, 26, 14, 0.78)` + `backdrop-filter: blur(12px)`
- 边框：`1px solid rgba(212, 168, 83, 0.18)`
- 阴影：
  - 外阴影：`0 4px 24px rgba(0, 0, 0, 0.5)`
  - 金色微光：`0 0 20px rgba(212, 168, 83, 0.06)`
  - 内部顶光：`inset 0 1px 0 rgba(212, 168, 83, 0.08)`

**四个模式标签（从上到下排列）**：

| 位置 | 模式 | 中文标签 | 图标 | 说明 |
|------|------|---------|------|------|
| 1 (顶) | Auto (自动) | 自动 | ⚡ | 自主执行 |
| 2 | Plan (计划) | 计划 | 📋 | 只读分析 |
| 3 | Accept Edits | 编辑 | ✏️ | 信任编辑 |
| 4 (底) | Default (默认) | 默认 | 🛡️ | 每步确认 |

> **注**：排列顺序从"最自动"到"最保守"，用户直觉上「向上滑动 = 更自由」。

#### 胶囊指示器（被点亮的当前模式）

- 外观：圆角矩形，`border-radius: 18px`
- 尺寸：`width: 36px; height: 48px`（填满单个模式格）
- 背景：`linear-gradient(180deg, rgba(212, 168, 83, 0.25) 0%, rgba(197, 59, 59, 0.18) 100%)`
- 边框：`1px solid rgba(212, 168, 83, 0.45)`
- 发光：`box-shadow: 0 0 16px rgba(212, 168, 83, 0.25), inset 0 0 8px rgba(212, 168, 83, 0.08)`
- 文字：当前模式标签白色高亮（`color: var(--gold-light)`），其余暗色（`color: rgba(216, 207, 192, 0.4)`）

#### 缓动动画（核心）

```css
/* 胶囊指示器平滑移动 */
.mode-indicator {
  position: absolute;
  transition: top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* cubic-bezier(0.34, 1.56, 0.64, 1) = spring-like overshoot */
}
```

- **缓动函数**：`cubic-bezier(0.34, 1.56, 0.64, 1)` — 带轻微弹性过冲（约 5-8px），类似 iOS Spring 动画
- **持续时间**：`450ms`（不快不慢，能感知到"滑动"但不等太久）
- **备选（更稳重）**：`cubic-bezier(0.25, 0.1, 0.25, 1)` — 标准 ease，适合 MINIMAL/CORPORATE 风格
- **推荐**：使用前者（弹性），与视觉小说风格的「灵动」调性一致

#### 交互行为

1. **点击切换**：点击任意模式所在区域 → 胶囊指示器平滑滑动到该位置 → 模式立即生效
2. **拖拽切换**：mousedown 在胶囊上 → mousemove 跟踪 Y 轴位置 → 计算最近模式格 → mouseup 时吸附到最近格
3. **滚轮切换**（可选）：鼠标在容器上方滚轮 → 上下切换模式
4. **键盘快捷键**：`Ctrl+Shift+M` 或 `Alt+M` 循环切换（对应 Claude Code 原版的 `Shift+Tab`）

#### 悬浮提示（Tooltip）

当鼠标悬浮在某个模式标签上 ≥ 300ms 时，在容器**左侧**弹出信息卡片：

```
┌──────────────────────┐
│ ⚡ 自动模式           │
│                      │
│ 完全自主执行，跳过    │
│ 所有权限确认。适合    │
│ 沙箱环境或完全信任    │
│ 的自动化任务。       │
│                      │
│ ⚠️ 注意：会执行所有   │
│ 操作包括删除文件      │
└──────────────────────┘
         ↓
    ┌──────────┐
    │ 自动 ⚡   │ ← 悬浮触发
    └──────────┘
```

**Tooltip 样式**：
- 外观：`background: rgba(26, 20, 16, 0.94)` + 金色边框
- 尺寸：`max-width: 200px; padding: 10px 14px`
- 字体：`font-size: 11px; line-height: 1.5`
- 圆角：`border-radius: 8px`
- 动画：`opacity 0.25s ease` + `transform: translateX(-6px)` 微移
- 三角箭头指向右侧（用 `::after` 伪元素实现）
- 延迟显示：`transition-delay: 0.3s`（hover 300ms 后才出现，避免误触）

#### 四种模式的 Tooltip 内容

| 模式 | 标题 | 描述 | 警告 |
|------|------|------|------|
| 自动 | ⚡ 自动模式 | 完全自主执行所有操作，无需确认。适合 CI/CD、Docker 沙箱或完全信任的自动化任务。 | ⚠️ 会执行删除等高危操作，请谨慎使用 |
| 计划 | 📋 计划模式 | 纯只读模式，可分析代码、设计方案，但不能做任何修改。适合代码审查和架构规划。 | 安全无副作用 |
| 编辑 | ✏️ 接受编辑 | 文件读写自动通过，Shell 命令仍需确认。日常编码的最佳平衡点。 | Shell 命令仍需手动确认 |
| 默认 | 🛡️ 默认模式 | 每次工具调用都需确认。最安全的模式，适合学习或不熟悉的项目。 | 弹窗较多 |

---

## 三、技术实现方案

### 3.1 架构概览

```
┌──────────────────────────────────────────────────┐
│  galchat.html (Renderer)                          │
│                                                    │
│  ┌─────────────┐    ┌──────────────────────────┐  │
│  │ Mode Switcher│    │   Chat UI (unchanged)    │  │
│  │  UI Component │    │                          │  │
│  │              │    │                          │  │
│  │ - 4 labels   │    │                          │  │
│  │ - capsule    │    │                          │  │
│  │ - tooltips   │    │                          │  │
│  │ - drag logic │    │                          │  │
│  └──────┬───────┘    └──────────────────────────┘  │
│         │ currentMode variable                      │
│         │ (stored in localStorage)                  │
│         ▼                                           │
│  chatWithClaude() includes permissionMode in POST   │
└──────────────────────────────────────────────────┘
                    │ HTTP POST /api/chat
                    ▼
┌──────────────────────────────────────────────────┐
│  server.js (Backend)                               │
│                                                    │
│  streamChat() reads permissionMode from request    │
│  if (permissionMode !== "default")                 │
│    args.push("--permission-mode", permissionMode)  │
│                                                    │
│  spawns: claude.exe --permission-mode bypass ...   │
└──────────────────────────────────────────────────┘
```

### 3.2 前端改动（galchat.html）

#### 3.2.1 新增 CSS（约 120 行）

需要新增的样式块：

```css
/* ===== 模式切换器 ===== */
#mode-switcher-container {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 45;
  /* 容器：竖长胶囊 */
  width: 44px;
  height: 240px;  /* 4 modes × 60px */
  background: rgba(42, 26, 14, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(212, 168, 83, 0.18);
  border-radius: 28px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.5),
    0 0 20px rgba(212, 168, 83, 0.06),
    inset 0 1px 0 rgba(212, 168, 83, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 0;
  /* 初始隐藏，游戏开始后显示 */
  opacity: 0;
  transform: translateY(-50%) translateX(60px);
  transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  pointer-events: none;
}

#mode-switcher-container.visible {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  pointer-events: auto;
}

/* 单个模式标签 */
.mode-item {
  position: relative;
  width: 36px;
  height: 54px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  transition: color 0.35s ease;
}

.mode-item .mode-icon {
  font-size: 15px;
  line-height: 1;
  margin-bottom: 2px;
  transition: transform 0.35s ease, opacity 0.35s ease;
}

.mode-item .mode-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 1px;
  writing-mode: horizontal-tb;
  transition: color 0.35s ease, font-weight 0.35s ease;
}

/* 非活跃模式：暗色 */
.mode-item.inactive .mode-icon {
  opacity: 0.35;
  transform: scale(0.85);
}
.mode-item.inactive .mode-label {
  color: rgba(216, 207, 192, 0.35);
  font-weight: 400;
}

/* 活跃模式：亮色 */
.mode-item.active .mode-icon {
  opacity: 1;
  transform: scale(1.05);
}
.mode-item.active .mode-label {
  color: var(--gold-light, #E8C97A);
  font-weight: 700;
}

/* 胶囊指示器（浮动在当前模式上） */
#mode-indicator {
  position: absolute;
  left: 4px;
  width: 36px;
  height: 48px;
  border-radius: 18px;
  background: linear-gradient(180deg,
    rgba(212, 168, 83, 0.22) 0%,
    rgba(197, 59, 59, 0.15) 100%);
  border: 1px solid rgba(212, 168, 83, 0.4);
  box-shadow:
    0 0 14px rgba(212, 168, 83, 0.2),
    inset 0 0 6px rgba(212, 168, 83, 0.06);
  z-index: 1;
  pointer-events: none;
  /* 核心缓动 */
  transition: top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Tooltip */
.mode-tooltip {
  position: absolute;
  right: 54px;  /* 在容器左侧 */
  top: 50%;
  transform: translateY(-50%) translateX(6px);
  width: 190px;
  background: rgba(26, 20, 16, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(212, 168, 83, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--washi, #F5F0E8);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease, transform 0.25s ease;
  transition-delay: 0s;
  z-index: 50;
}

.mode-item:hover .mode-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  transition-delay: 0.3s;  /* 300ms hover 后才显示 */
}

.mode-tooltip .tooltip-title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--gold-light, #E8C97A);
}

.mode-tooltip .tooltip-desc {
  color: rgba(245, 240, 232, 0.75);
  margin-bottom: 4px;
}

.mode-tooltip .tooltip-warn {
  color: var(--vermilion, #C53B3B);
  font-size: 10px;
  font-style: italic;
}

/* Tooltip 右侧三角箭头 */
.mode-tooltip::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-left: 6px solid rgba(26, 20, 16, 0.95);
  border-right: 0;
}

/* 响应式：小屏幕隐藏模式切换器 */
@media (max-width: 900px) {
  #mode-switcher-container {
    display: none;
  }
}
```

#### 3.2.2 新增 HTML（约 40 行）

在 `<div id="game-container">` 内部、`#dialogue-layer` 之前添加：

```html
<!-- 模式切换器 -->
<div id="mode-switcher-container">
  <div id="mode-indicator"></div>

  <div class="mode-item" data-mode="bypass" data-index="0">
    <span class="mode-icon">⚡</span>
    <span class="mode-label">自动</span>
    <div class="mode-tooltip">
      <div class="tooltip-title">⚡ 自动模式</div>
      <div class="tooltip-desc">完全自主执行所有操作，无需确认。</div>
      <div class="tooltip-warn">⚠ 会执行删除等高危操作</div>
    </div>
  </div>

  <div class="mode-item" data-mode="plan" data-index="1">
    <span class="mode-icon">📋</span>
    <span class="mode-label">计划</span>
    <div class="mode-tooltip">
      <div class="tooltip-title">📋 计划模式</div>
      <div class="tooltip-desc">纯只读，可分析代码但不能修改。适合代码审查和架构规划。</div>
    </div>
  </div>

  <div class="mode-item" data-mode="acceptEdits" data-index="2">
    <span class="mode-icon">✏️</span>
    <span class="mode-label">编辑</span>
    <div class="mode-tooltip">
      <div class="tooltip-title">✏️ 接受编辑</div>
      <div class="tooltip-desc">文件读写自动通过，Shell 命令仍需确认。日常编码最佳平衡。</div>
    </div>
  </div>

  <div class="mode-item active" data-mode="default" data-index="3">
    <span class="mode-icon">🛡️</span>
    <span class="mode-label">默认</span>
    <div class="mode-tooltip">
      <div class="tooltip-title">🛡️ 默认模式</div>
      <div class="tooltip-desc">每次工具调用都需确认。最安全的模式。</div>
    </div>
  </div>
</div>
```

#### 3.2.3 新增 JavaScript（约 150 行）

```javascript
// ===== 模式切换器逻辑 =====

let currentMode = localStorage.getItem('mako-mode') || 'default';
const modeOrder = ['bypass', 'plan', 'acceptEdits', 'default'];
const modeItems = document.querySelectorAll('.mode-item');
const modeIndicator = document.getElementById('mode-indicator');
const modeContainer = document.getElementById('mode-switcher-container');

// 初始化胶囊位置
function updateModeIndicator(animate = true) {
  const targetItem = document.querySelector(`.mode-item[data-mode="${currentMode}"]`);
  if (!targetItem) return;

  const containerRect = modeContainer.getBoundingClientRect();
  const itemRect = targetItem.getBoundingClientRect();
  const newTop = itemRect.top - containerRect.top + (itemRect.height - 48) / 2;

  if (!animate) {
    modeIndicator.style.transition = 'none';
  }
  modeIndicator.style.top = newTop + 'px';

  if (!animate) {
    // 强制回流后恢复 transition
    modeIndicator.offsetHeight;
    modeIndicator.style.transition = 'top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
  }

  // 更新活跃状态
  modeItems.forEach(item => {
    if (item.dataset.mode === currentMode) {
      item.classList.add('active');
      item.classList.remove('inactive');
    } else {
      item.classList.remove('active');
      item.classList.add('inactive');
    }
  });
}

// 切换模式
function switchMode(newMode) {
  if (newMode === currentMode) return;
  if (!modeOrder.includes(newMode)) return;

  currentMode = newMode;
  localStorage.setItem('mako-mode', currentMode);
  updateModeIndicator(true);

  // 如果当前正在对话中，提示模式已切换（下次对话生效）
  console.log(`[MakoMode] 已切换到: ${currentMode}`);
}

// 点击切换
modeItems.forEach(item => {
  item.addEventListener('click', () => {
    switchMode(item.dataset.mode);
  });
});

// 拖拽切换
let isDragging = false;
let dragStartY = 0;

modeIndicator.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragStartY = e.clientY;
  modeIndicator.style.transition = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const containerRect = modeContainer.getBoundingClientRect();
  const relativeY = e.clientY - containerRect.top;
  const clampedY = Math.max(6, Math.min(relativeY - 24, containerRect.height - 54));
  modeIndicator.style.top = clampedY + 'px';

  // 实时高亮最近模式（snap preview）
  const itemCenters = Array.from(modeItems).map(item => {
    const rect = item.getBoundingClientRect();
    return rect.top - containerRect.top + rect.height / 2;
  });
  const closestIdx = itemCenters.reduce((best, center, i) =>
    Math.abs(relativeY - center) < Math.abs(relativeY - itemCenters[best]) ? i : best, 0);
  modeItems.forEach((item, i) => {
    item.style.color = i === closestIdx ? 'var(--gold-light)' : '';
  });
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;
  isDragging = false;

  const containerRect = modeContainer.getBoundingClientRect();
  const relativeY = e.clientY - containerRect.top;
  const itemCenters = Array.from(modeItems).map(item => {
    const rect = item.getBoundingClientRect();
    return { mode: item.dataset.mode, center: rect.top - containerRect.top + rect.height / 2 };
  });
  const closest = itemCenters.reduce((best, cur) =>
    Math.abs(relativeY - cur.center) < Math.abs(relativeY - best.center) ? cur : best);

  // 恢复 transition 并吸附
  modeIndicator.style.transition = 'top 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
  switchMode(closest.mode);

  // 清除临时高亮
  modeItems.forEach(item => { item.style.color = ''; });
});

// 键盘快捷键: Ctrl+Shift+M 循环切换
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    const currentIdx = modeOrder.indexOf(currentMode);
    const nextIdx = (currentIdx + 1) % modeOrder.length;
    switchMode(modeOrder[nextIdx]);
  }
});

// 窗口大小变化时更新胶囊位置
window.addEventListener('resize', () => {
  updateModeIndicator(false);
});

// 游戏开始后显示模式切换器
function showModeSwitcher() {
  modeContainer.classList.add('visible');
  updateModeIndicator(false);
}
// 在 newGame() 或等价入口中调用 showModeSwitcher()
```

#### 3.2.4 修改现有代码（3 处）

**位置 1**：`chatWithClaude()` — 将硬编码的 `permissionMode: 'default'` 改为读取 `currentMode`

```javascript
// 修改前（galchat.html 第 2881 行）:
permissionMode: 'default',

// 修改后:
permissionMode: currentMode,
```

**位置 2**：`newGame()` — 末尾添加 `showModeSwitcher()` 调用

```javascript
// 在 newGame() 函数末尾（title-screen 隐藏后）添加：
showModeSwitcher();
```

**位置 3**：`showQuestion()` — 在自动模式下跳过非关键弹窗

```javascript
// 在 showQuestion() 开头添加：
function showQuestion(text, options, fromText) {
  // 自动模式：跳过所有权限弹窗，自动选 yes
  if (currentMode === 'bypass') {
    answerQuestion(0, fromText); // 自动选第一个选项
    return;
  }
  // 接受编辑模式：跳过文件编辑弹窗，Shell 命令仍确认
  if (currentMode === 'acceptEdits' && !fromText) {
    // 非文本类问题（即系统权限弹窗）自动通过
    answerQuestion(0, false);
    return;
  }
  // ... 原有逻辑
}
```

### 3.3 后端改动（server.js）

**仅 1 处需要确认**：`streamChat()` 函数第 878-879 行已经支持 `permissionMode`：

```javascript
if (permissionMode && permissionMode !== "default") {
  args.push("--permission-mode", permissionMode);
}
```

✅ **无需改动**。当前逻辑已正确处理所有四种模式值。

### 3.4 模式持久化

- 存储位置：`localStorage`（key: `mako-mode`）
- 初始化：从 localStorage 读取，默认 `'default'`
- 切换时写入 localStorage
- 优势：刷新/重启后保持用户偏好，无需存储在后端

---

## 四、默认模式弹窗优化（同步实施）

### 4.1 问题分析

当前 `detectQuestion()` 在 `server.js:1089-1113` 对以下情况**无条件**弹出确认：

1. Claude 系统消息中的 `options`（Claude 自身的权限提示）
2. 所有 `tool_use` 类型消息（不管工具是否安全）

### 4.2 优化策略

在**默认模式**下，区分「安全操作」和「需要确认的操作」：

| 工具类别 | 操作 | 默认模式行为 |
|---------|------|------------|
| **读操作** (Read, Glob, Grep) | 读取文件、搜索内容 | ✅ 静默允许（已通过 `allowedTools` 预授权） |
| **浏览器操作** (browser_navigate, browser_snapshot, browser_take_screenshot) | 打开网页、截图 | ✅ 静默允许 |
| **写操作** (Write) | 写入新文件或覆盖 | ⚠️ 首次弹出确认，"总是允许"后静默 |
| **编辑操作** (Edit) | 修改现有文件 | ⚠️ 首次弹出确认，"总是允许"后静默 |
| **Shell 命令** (Bash) | 执行任意命令 | 🛑 始终弹出确认（安全底线） |
| **浏览器交互** (browser_click, browser_type, browser_press_key) | 点击、输入 | ⚠️ 弹出确认 |

### 4.3 实现方式

在 `server.js` 的 `detectQuestion()` 中添加工具安全等级判断：

```javascript
// 安全工具列表 — 不需要弹窗确认
const SAFE_TOOLS = [
  'Read', 'Glob', 'Grep',
  'mcp__playwright__browser_navigate',
  'mcp__playwright__browser_snapshot',
  'mcp__playwright__browser_take_screenshot',
  'mcp__playwright__browser_wait_for',
  'mcp__playwright__browser_console_messages',
  'mcp__playwright__browser_network_requests',
];

// 高风险工具 — 始终弹窗
const DANGEROUS_TOOLS = [
  'Bash',
  'mcp__playwright__browser_run_code_unsafe',
];

function detectQuestion(msg, permissionMode) {
  // 默认模式下的安全工具：静默允许
  if (permissionMode === 'default' || !permissionMode) {
    if (msg.type === 'assistant' && msg.message?.type === 'tool_use') {
      if (SAFE_TOOLS.includes(msg.message.name)) {
        // 不弹窗，自动回答 yes
        return { autoAllow: true, answer: 'yes' };
      }
    }
  }
  // ... 原有逻辑
}
```

> ⚠️ 注意：这个优化需要 Claude Code CLI 自身的权限 allowlist 配置（`.claude/settings.json`）配合。读操作等已在 allowlist 中预授权的工具不会被 Claude 作为 `system` 消息发出，自然不会有弹窗。真正的优化点在于「写/编辑操作」的提示频率。

### 4.4 前端辅助优化

在默认模式下，前端 `showQuestion()` 中对**非 Shell 的工具调用**，可使用更温和的提示方式（如底部 toast 而非全屏遮罩弹窗），减少打断感：

```javascript
function showQuestion(text, options, fromText) {
  // 自动模式：自动通过
  if (currentMode === 'bypass') { answerQuestion(0, fromText); return; }

  // 默认模式：对文件操作使用 toast 提示而非全屏弹窗
  if (currentMode === 'default' && !fromText &&
      text.includes('Write') || text.includes('Edit')) {
    // 轻量 toast 提示 + 3 秒自动通过
    showToast(`茉子正在${text.includes('Write') ? '写入' : '编辑'}文件...`, 'info');
    setTimeout(() => answerQuestion(0, false), 1500);
    return;
  }

  // ... 原有弹窗逻辑
}
```

---

## 五、实施清单

### Phase 1: 核心 UI（预计 2-3 小时）

- [ ] **galchat.html CSS**：添加 `#mode-switcher-container`、`.mode-item`、`#mode-indicator`、`.mode-tooltip` 全部样式（约 120 行）
- [ ] **galchat.html HTML**：在 `#game-container` 内添加模式切换器 DOM 结构（约 40 行）
- [ ] **galchat.html JS**：添加 `switchMode()`、`updateModeIndicator()`、拖拽逻辑、键盘快捷键（约 150 行）
- [ ] **galchat.html 修改**：`permissionMode: currentMode` 替换硬编码
- [ ] **galchat.html 修改**：`newGame()` 末尾调用 `showModeSwitcher()`

### Phase 2: 功能对接（预计 1 小时）

- [ ] **验证 server.js**：确认 `--permission-mode` 传参对四种模式均正确
- [ ] **端到端测试**：切换四种模式 → 发送消息 → 观察 Claude CLI 行为差异
- [ ] **localStorage 持久化测试**：刷新页面 → 模式保持

### Phase 3: 默认模式优化（预计 1-2 小时）

- [ ] **server.js**：`detectQuestion()` 增加安全工具白名单，安全操作自动通过
- [ ] **galchat.html**：默认模式下文件操作使用 toast 提示代替全屏弹窗
- [ ] **`.claude/settings.json`**：检查并优化 allowlist 配置

### Phase 4: 收尾（预计 30 分钟）

- [ ] **响应式适配**：小屏幕 (<900px) 隐藏模式切换器
- [ ] **无障碍**：`prefers-reduced-motion` 关闭动画
- [ ] **更新 CHANGELOG**：记录新增功能
- [ ] **B站动态/公告**：通知用户新功能

---

## 六、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **自动模式误操作** | 中 | 高 — 用户可能意外删除文件 | 自动模式入口加二次确认对话框；Tooltip 明确警告；不允许作为默认模式 |
| **Plan 模式 → Accept Edits 切换卡死** | 低 | 中 — Claude Code SDK 已知 bug（Issue #4251） | 监听 `exit_plan_mode` 事件；切换时自动重置会话 |
| **拖拽在触摸屏上冲突** | 低 | 低 — 大部分用户在桌面端使用 | 触摸事件单独处理或不启用拖拽 |
| **localStorage 数据丢失** | 极低 | 极低 — 仅影响模式偏好 | 默认回退到 `default`，无功能影响 |
| **CSS 动画性能** | 低 | 低 — 仅一个浮动元素在动画 | 使用 `will-change: top` 优化；`prefers-reduced-motion` 关闭动画 |

---

## 七、参考资源

- Claude Code 权限模式文档：[Permission Modes (DeepWiki)](https://deepwiki.com/zebbern/claude-code-guide/8.1-permission-modes)
- Claude Code CLI Flags：[CLI Flags & Env Vars (DeepWiki)](https://deepwiki.com/FlorianBruniaux/claude-code-ultimate-guide/15-cli-flags-and-environment-variables)
- 社区中文教程：[Claude Code 的四种工作模式 (CSDN)](https://blog.csdn.net/wufaqidong1/article/details/161432426)
- Claude Code WebUI 同类需求 Issue：[sugyan/claude-code-webui#130](https://github.com/sugyan/claude-code-webui/issues/130)

---

> 📝 本报告由 MakoCode 调研生成，设计参考 huashu-design / css-hover-effects / css-micro-fx 三个技能。
> ⚠️ 当前仅调研，未修改任何代码。
