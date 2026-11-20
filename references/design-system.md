# 视觉皮肤、全屏无框画板与无障碍交互规范

> Core CSS tokens and layout primitives live cleanly in [`kit/primer-tokens.css`](../kit/primer-tokens.css) and [`kit/theme-studio.css`](../kit/theme-studio.css).

---

## 1. 三套内置皮肤语义（按题材选用 `<html data-theme="...">`）

| 皮肤 | 适用题材 | 核心令牌色 |
|---|---|---|
| **`paper-ink`（默认暖纸墨线）** | 电路、单片机、算法状态机、教学沙盘、通用工程图解 | `--bg: #f6eddd`、`--navy: #18213d`、GLSL `#141a2c` 工程描边、`#7a5532` 暖棕地面投射影 |
| **`dark-studio`（暗棚科学仪器）** | 高频示波、连续函数优化空间、现代机械暗棚、发光剖面 | `--bg: #12161f` 深石板、`--teal: #2dd4bf`、`--amber: #f59e0b`，突出高光与发光曲线 |
| **`bio-cutaway`（实验室冷白剖面）** | 生物器官、细胞膜层、化学反应器、医疗仪器 | `--bg: #eef2f0` 冷白绿、`--teal: #0f8b8d`、`--amber: #d45d48` |

### 3D 物料色彩建议
- **实验台与机构底盘**：浅暖灰石膏/哑光铝壳（`#dad5c7` / `#c5bfb0`）、深海军蓝槽框（`#28344f`）、克制高光（`roughness: 0.42–0.55`, `metalness: 0.12–0.3`）。
- **可区分功能组件**：低饱和工程釉色（赤陶 `#d96b43`、鼠尾草绿 `#488a6d`、钴蓝 `#3a6fa3`、琥珀黄 `#c7922e`）+ 高 DPI `CanvasTexture` 表面铭牌（大号等宽字母 + 简洁规格标注）。

---

## 2. 全屏无框画板与响应式骨架

- **桌面端（`>= 901px`）**：
  - `.artboard-shell` 锁定 `100vw × 100dvh`，`.stage-fullbleed` 全屏铺满 WebGL 画布、双层描边 SVG 引线与 WAAPI 飘字层。浮卡使用纯高透实色底 `var(--card-solid)`，**不使用模糊 `backdrop-filter`**（规避 WebGL 层叠合成闪烁）。
  - **左上 `.hud-top-left`**：品牌标识、课节胶囊、状态徽章及可选语言切换器（`.lang-switch`）。
  - **右上 `.hud-guide`**：仅保留 **1 张精简浮层导学卡**（宽 `clamp(276px, 23vw, 318px)`），零内部滚动条，可内嵌简洁的 `carries` / `hook` 问题链胶囊。
  - **左下 `.hud-bottom-left`**：[`ChartCard`](../kit/chart-card.js)、按真源装配的 [`LiveMathsPanel`](../kit/live-maths.js)（空间紧张时默认折叠 `collapsed: true`，一键展开读完整代入）及按需检查器 `.inspector-float`。
  - **底中 `.hud-bottom-center`**：多幕 [`TimelineDirector`](../kit/timeline-director.js) 控件区 `.timeline-dock`、胶片步进胶囊与无障碍 `viewbar`。
- **移动端/窄屏（`<= 900px`）**：
  - 纵向流依次排布：紧凑顶栏 → 主舞台（`min(46dvh, 360px)`）→ **紧贴舞台正下方的 `.thumb-dock` 快捷按键条**（保证在 `390×844` 首屏内边点边看）→ 导学卡 → `.timeline-dock` → 图表与活公式抽屉 → 可横滑 `viewbar`。

---

## 3. 工具栏、运动偏好与无障碍基线

- **工具栏**：`role="toolbar"` 配合 [`kit/toolbar-a11y.js`](../kit/toolbar-a11y.js) 实现方向键 / `Home` / `End` 游标焦点，分隔线用 CSS `border-inline-start` 保证高对比模式不丢失；所有按钮至少 `36px × 36px`（粗指针放大到 `44px`）；开关按钮严格绑定 `[aria-pressed]`。
- **减少动效（`prefers-reduced-motion: reduce`）**：禁止用全站 `animation-duration: 0.01ms` 一刀切；相机 `flyTo` 与物理位移侦测系统减少动效时直接干净落位到终态。
- **缩略图烘焙纯净模式**：`?thumb=1` 自动置 `html[data-thumb="1"]`，零闪屏隐藏浮层 HUD 与标签，供 [`scripts/bake_thumbs.py`](../scripts/bake_thumbs.py) 拍出 100% 干净缩略图。
