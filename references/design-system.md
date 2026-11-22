# 视觉皮肤、离线四层字体、1:1 锐度与无障碍交互规范

> Core CSS tokens, offline `@font-face` declarations, ClearType rules, and layout primitives live cleanly in [`kit/primer-tokens.css`](../kit/primer-tokens.css), [`kit/theme-studio.css`](../kit/theme-studio.css), [`kit/fonts/fonts.css`](../kit/fonts/fonts.css), and [`kit/fonts.js`](../kit/fonts.js).

---

## 1. 三套内置皮肤语义（按题材选用 `<html data-theme="...">`）

| 皮肤 | 适用题材 | 核心令牌色 |
|---|---|---|
| **`paper-ink`（默认暖纸墨线）** | 电路、单片机、算法状态机、教学沙盘、通用工程图解 | `--bg: #f6eddd`、`--navy: #18213d`、1-ring `#141a2c` 锐利工程描边、`#7a5532` 暖棕地面投射影 |
| **`dark-studio`（暗棚科学仪器）** | 高频示波、连续函数优化空间、现代机械暗棚、发光剖面 | `--bg: #12161f` 深石板、`--teal: #2dd4bf`、`--amber: #f59e0b`，突出高光与发光曲线 |
| **`bio-cutaway`（实验室冷白剖面）** | 生物器官、细胞膜层、化学反应器、医疗仪器 | `--bg: #eef2f0` 冷白绿、`--teal: #0f8b8d`、`--amber: #d45d48` |

### 3D 受光 PBR 材质与轮廓预设（铁律 1 & 铁律 3）
- **严禁无光 `MeshBasicMaterial` 充当 3D 实体**：所有 3D 机械/器物/地形统一经 [`kit/geo-sculpt.js`](../kit/geo-sculpt.js) 的 `createSculptMaterial(preset, overrides)` 构建受光 PBR 材质（`MeshStandardMaterial` / `MeshPhysicalMaterial`），内置 10 套自动适配 `paper-ink` / `dark-studio` / `bio-cutaway` 光照的物料预设：
  - **结构与器物**：`ceramic`（釉面陶瓷）、`travertine`（哑光石灰岩/石膏底座）、`anodized`（阳极氧化深蓝铝壳）、`obsidian`（黑曜岩/暗断层）；
  - **精密金属**：`brass`（车削黄铜）、`copper`（紫铜线圈/双金属下层）、`steel`（精钢轴/双金属上层）；
  - **光学与发光**：`glass`（物理清漆高透光学玻璃）、`frostedGlass`（磨砂半透玻璃）、`ember`（温控发热丝/熔岩缝）。
- **锐利轮廓预设**：通过 `stage.setOutlinePreset('crisp' | 'subtle' | 'none')` 选择 1-ring 物理像素级工程墨线（默认 `NeutralToneMapping`, `exposure = 1.0`，彻底无外环灰雾晕）；3D HTML 面板默认挂载在独立无色调映射的 `SURFACE_LAYER = 2`。

---

## 2. 离线四层字体与真数学排版（铁律 2）

[`kit/primer-tokens.css`](../kit/primer-tokens.css) 首行以 `@import "./fonts/fonts.css";` 零 CDN 加载 18 个随包 `.woff2` 字体，建立四层语义字阶：

| 字阶 | CSS 变量 | 离线随包字族（零 CDN） | 使用场景 |
|---|---|---|---|
| **Display 标题层** | `--font-display` | `Newsreader` (Variable) + `Simulify Display SC` (Noto Serif SC wght=650) | 舞台标题、分幕标题、导学标题、字幕头 |
| **Sans 正文层** | `--font-sans` | `Inter` (Variable + Greek) + `Simulify Sans SC` (Noto Sans SC 400–700) | 导学短句、控件标签、表头、提示条 |
| **Math 数学层** | `--font-math` / `--font-math-italic` | `KaTeX_Main`, `KaTeX_Math`, `KaTeX_Size1`, `KaTeX_Size2` | [`LiveMathsPanel`](../kit/live-maths.js) 公式变量、分式、巨算子与上下标 |
| **Mono 代码数值层** | `--font-mono` | `JetBrains Mono` (400–700 + Greek) + `Simulify Sans SC` 自动 CJK 回退 | 代码追踪、坐标读数、时间轴与 `tabular-nums` 数值 |

### Canvas 2D / 3D 贴图与公式排版硬规则
1. **统一使用 [`kit/fonts.js`](../kit/fonts.js)**：
   - 2D/3D 铭牌、标尺与画布文字一律调用 `canvasFont(role, px, weight, style)`（自动为 `'mono'`/`'sans'` 追加离线 CJK 回退，根治 `+10 终点` 混排断层）；
   - 3D 表面铭牌一律用 `createCrispCanvasTexture(THREE, { width: 512, height: 512, draw, anisotropy: 16 })`（尺寸 `>= 512px`，配 `stage.configureSharpTexture(tex)`，`document.fonts.ready` 后自动重绘 1 次）；
   - 启动/导出前可用 `await waitForFonts()` 确保离线字面就绪。
2. **数学公式必用 [`kit/live-maths.js`](../kit/live-maths.js) AST 构造器**：
   - 使用 `mathVar`、`mathSub`、`mathSup`、`mathSubSup`、`mathFrac`、`mathOp`、`mathNum`、`mathText`、`mathGroup`；
   - **严禁**手写破损 Unicode 微型上下标（`ₜ`/`ₙ`/`ᵏ`/`⁴`）或用纯拉丁等宽字强画中文（`normalizeUnicodeScripts` 仅作老模板兜底）。
3. **字号清晰底线（`verify_stage.py` `typography-crispness` 强制校验）**：
   - 任何可见 HUD / 按钮 / 标注 / SVG 坐标轴刻度文字均不得低于 **`11.5px`**（门禁底线 `< 10.5px` 直接判败，数学公式合法上下标 `.lm-sub`/`.lm-sup`/`.lm-op-lower` 除外）；
   - 正文与导语 `>= 13.5px`，公式 `.eq-line` 默认 `14.5px`，数值读数默认 `font-variant-numeric: tabular-nums`。
4. **独立发布项目 CJK 字体瘦身工作流**：
   ```bash
   # 默认随包同步完整 2.07 MB 四层字体（3,816 常用汉字）
   python scripts/setup_vendor.py <target_dir>
   # 针对单个独立发布实验台按实际用字子集化（可压至 ~0.6 MB）
   uv run --with fonttools --with brotli python scripts/setup_vendor.py <target_dir> --fonts-only --subset-cjk <project_dir>
   ```

---

## 3. ClearType 锐度与全屏无框画板骨架（铁律 1）

### ClearType 零糊字纪律
- **禁 `backdrop-filter`**：所有内容卡与 HUD 浮层一律用高透实色底 `var(--card-solid)`，彻底杜绝 WebGL/WebGPU 叠层毛玻璃发虚与闪烁。
- **禁稳态 `translate3d` 与静态 `will-change: transform`**：`.hud-reveal` 稳态必须清空 `transform: none`（仅隐藏/过渡态使用 `Math.round()` 整数像素偏移），`.callout-tag` 禁止常驻 `will-change: transform`，保证 Windows ClearType 次像素字迹如刀刻般锐利。
- **1:1 物理像素对齐**：画布容器锁定精确 CSS 尺寸，由 [`IsometricStage`](../kit/stage-3d.js) 按 `device-pixel-content-box` 1:1 对齐物理像素，杜绝 125%/150%/200% DPI 下差 1px 双线性糊化。

### 响应式画板骨架
- **桌面端（`>= 901px`）**：
  - `.artboard-shell` 锁定 `100vw × 100dvh`，`.stage-fullbleed` 全屏铺满 WebGPU/WebGL2 画布、双层描边 SVG 引线与 WAAPI 飘字层，盒子 HUD 总占比 `<= 25%`；
  - **顶栏 `.top-ribbon` / `.hud-top-left`**：品牌标识、拍次徽章、精简参数胶囊与语言切换器；
  - **叙事字幕胶囊 `.beat-caption-pill`**：轻盈浮于左上留白区（受全节拍碰撞门禁守护，与顶栏、左下/右侧停靠栏零重叠）；
  - **右侧导学/公式停靠栏 `.right-dock` / `.hud-guide`**：宽 `clamp(276px, 23vw, 318px)`，全节拍零内部滚动溢出（`scrollHeight <= clientHeight + 2`）；
  - **左下 `.bottom-left-dock` / `.hud-bottom-left`**：[`ChartCard`](../kit/chart-card.js)（持久 SVG、`>= 11.5px` 刻度、支持 `movingAverageWindow` 移动平均趋势线）及按需检查器；
  - **底中 `.bottom-transport` / `.hud-bottom-center`**：4D 时间轴控件、视角复位与导出按钮；
  - **3D `HtmlSurface` 安全区**：所有 3D 活 HTML 面板在每个活跃节拍的屏幕投影框被 HUD 停靠栏遮挡面积必须 `<= 15%`。
- **移动端/窄屏（`<= 900px`）**：
  - 纵向流依次排布：紧凑顶栏 → 主舞台（`min(46dvh, 360px)`）→ **紧贴舞台正下方的 `.thumb-dock` 快捷按键条**（保证在 `390×844` 首屏内边点边看）→ 导学卡 → `.timeline-dock` → 图表与活公式抽屉 → 可横滑 `viewbar`。

---

## 4. 工具栏、运动偏好与无障碍基线

- **工具栏**：`role="toolbar"` 配合 [`kit/toolbar-a11y.js`](../kit/toolbar-a11y.js) 实现方向键 / `Home` / `End` 游标焦点，分隔线用 CSS `border-inline-start` 保证高对比模式不丢失；所有按钮至少 `36px × 36px`（粗指针放大到 `44px`）；开关按钮严格绑定 `[aria-pressed]`。
- **减少动效（`prefers-reduced-motion: reduce`）**：禁止用全站 `animation-duration: 0.01ms` 一刀切；相机 `flyTo` 与物理位移侦测系统减少动效时直接干净落位到终态。
- **纯净导片与缩略图模式**：`?thumb=1` 置 `html[data-thumb="1"]`，`?export=stage|caption|hud` 置 `html[data-export]`，零闪屏切换纯净画布，供 [`scripts/bake_thumbs.py`](../scripts/bake_thumbs.py) 与 [`scripts/export_video.py`](../scripts/export_video.py) 捕获。
