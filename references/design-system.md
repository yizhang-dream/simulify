# Simulify v3.1 皮肤、双审美渲染档、布局与离线字体

全局用 `<html data-theme="…">` 选择皮肤。[kit/primer-tokens.css](../kit/primer-tokens.css) · [kit/theme-studio.css](../kit/theme-studio.css)

## 双审美渲染档与六套 CSS 皮肤

六套皮肤统一收束为两套目标明确的 3D 渲染档，杜绝“既要墨线又要全局灰 IBL”造成的发灰塑料感：

| 渲染档 | 所属皮肤 | 核心渲染与光棚策略 |
|---|---|---|
| **Primer 触感图解档** | `paper-ink`、`monochrome-print` | **`NoToneMapping`**（保持暖纸色与高饱和强调色不发灰）、**选择性 IBL**（哑光介质 `envMap = null`，仅金属/釉面/玻璃接入柔光棚）、**新一代对象 ID + 8 向圆核抗锯齿墨线**（支持 `userData.ink` / `inkThin` / `inkNormals` / `inkFlat` 与暖棕墨 `#1f160f`）、解析 `fwidth()` 制图网格、暖棕软 PCF 阴影（半径 4.2）+ 高斯接触影。 |
| **Studio 精密 PBR 档** | `dark-studio`、`obsidian-gallery`、`bio-cutaway`、`blueprint`（及 `mechanical-3d` 写实模式） | **程序化 `StudioLightformerEnvironment`**（`sigma: 0.008`，清晰柔光箱高光带替代模糊 `RoomEnvironment`）、**`NeutralToneMapping`**、**原生 4× MSAA + `outline: 'none'`**（用 ≥2 px 倒角/切角捕捉高光与紧贴 `Box3` 阴影表达轮廓，不破坏硬件 MSAA）。 |

| 皮肤 | 渲染档 | 适用题材与视觉气质 | 核心令牌与光棚 |
|---|---|---|---|
| **`paper-ink`（默认暖纸墨线）** | Primer 触感图解 | 教学沙盘、通用工程图解、电路与算法状态机 | `--bg: #f6eddd`、`#1f160f` 暖棕墨线（对象 ID 圆核 AA）、强主光/低环境比、暖棕软影 |
| **`monochrome-print`（Tufte 出版版画）** | Primer 触感图解 | 长段正文、高对比极简学术图版、数学推导 | `--bg: #fbfaf7` 洁净无噪纸面、纯黑细墨线、`#c23616` 朱砂强调色 |
| **`dark-studio`（暗棚科学仪器）** | Studio 精密 PBR | 高频示波、连续函数优化、发光剖面与现代机械暗棚 | `--bg: #12161f` 深石板、`--teal: #2dd4bf`、`--amber: #f59e0b`，Lightformer 柔光箱 + 青色轮廓光 |
| **`obsidian-gallery`（暗绒博物馆器物）** | Studio 精密 PBR | 精密钟表、光学仪器、车削黄铜与玻璃展品 | `--bg: #141312` 暖黑绒棚、香槟金 `#d9b061` + 铜绿 `#38b2ac` 聚光 |
| **`bio-cutaway`（实验室冷白剖面）** | Studio 精密 PBR | 生物器官、细胞膜层、化学反应器、医疗仪器 | `--bg: #eef2f0` 冷白绿、`--teal: #0f8b8d`、`--amber: #d45d48` |
| **`blueprint`（瑞士工程蓝图）** | Studio 精密 PBR | 机械三视图、航空/结构拆解、精密制图 | `--bg: #0c2340` 普鲁士蓝、解析 `fwidth()` 制图网格、`#38e8ff` 青白高亮 |

- **Okabe-Ito 8 色盲安全分类令牌**：全皮肤统一暴露 `--cat-1` ~ `--cat-8`，多曲线/多变量对照时按序取色，杜绝 4+ 曲线撞色。

## Primer Tactile Roundness Craft (圆润手办造型规范)

- **慷慨倒圆（10%–18%）**。Primer 下的实体块、底座、壳体和剖切封边都应按局部厚度的 10%–18% 倒圆，使用 `bevelSegments: 3–4`、`curveSegments: 24–32`。钟形壳与胎肩用样条或圆角车削轮廓，轴端用 `CapsuleGeometry` 或圆顶车削造型，剖切面保留可见的圆润倒边。
- **缎面与镜面各归其档**。`paper-ink` 和 `monochrome-print` 使用 PMREM `sigma: 0.030`、缎面金属 `roughness: 0.30–0.36`、`metalness: 0.78–0.85`，以及暖棕软 PCF 阴影（半径 `4.2`、接影面不透明度 `0.25`）。`primer` 墨线用圆头笔触（`thickness: 1.3`、`normalThreshold: 0.42`、内褶权重 `0.45`、1.5× 外环权重 `0.42`）。多齿或曲面零件的内褶过密时，设 `inkNormals: 'none'`，保留轮廓与对象 ID 接缝。Studio 精密 PBR 保留清晰的柔光箱（`sigma: 0.008`）、抛光金属（`roughness: 0.18–0.24`）和紧致 PCF 阴影（半径 `1.65`）。

## 材质角色分离与反塑料守则

各皮肤共用字体与 HUD 结构；3D 受光材质使用 [kit/geo-sculpt.js](../kit/geo-sculpt.js) 角色分离的物理预设（基于 `MeshPhysicalMaterial`，已移除旧版自动注入并削弱粗糙度的模糊 `128²` `DataTexture`），透明外壳用 Fresnel X-Ray 配合玻璃层保留内部轮廓。[engine-contract.md](engine-contract.md)

- **按粗糙度/金属度分离角色，不只靠色相**：
  - **哑光介质**（`ceramic`、`travertine`、`obsidian`、`rubber`、`clay`）：`metalness = 0`、`roughness = 0.78–0.92`、`specularIntensity = 0.15–0.25`、选择性 IBL 下不接全局环境贴图（避免灰蒙蒙的塑料反光）。
  - **烤漆 / 釉面**（`enamel`、`painted`）：介质基底 `metalness = 0`、`roughness = 0.34–0.44` + `clearcoat = 0.85`、`clearcoatRoughness = 0.12`，接入柔光箱反射。
  - **真车削金属**（`steel`、`brass`、`copper`、`anodized`、`castIron`）：`metalness = 0.72–0.94`、`roughness = 0.20–0.52`（配合 `anisotropy` 拉丝方向），严禁落入 `0.2–0.7` 浑浊中间金属度。
  - **数学场与高度曲面**（[kit/field-viz.js](../kit/field-viz.js)）：默认受光 `MeshPhysicalMaterial`（`roughness ~0.44`、`clearcoat ~0.24`、`emissiveIntensity = 0`）加解析 `fwidth()` 等值线；禁止用 `emissive > 0` 抬亮漫反射底色把起伏冲平。
- **反 Slop 硬检项**：
  - 严禁在 Three.js r187 中依赖 `scene.environment` + `material.envMapIntensity` 调暗哑光件（r187 在 `material.envMap === null` 时会静默忽略 `material.envMapIntensity`）。
  - 严禁在 r187 TSL 中写 `bumpMap(proceduralPositionLocalNode)`（仅偏移 `uv()`，导数为 0）。
  - 严禁用模糊 `RoomEnvironment`、泛光或浓雾掩盖缺失的几何造型；先立准剪影与 ≥2 px 倒角，再调材质、布光与动画。

## 三种布局

| `.artboard-shell` 的 `data-layout` | 结构 |
|---|---|
| `fullbleed-hud` | 全幅画布配轻量 HUD。按需要使用标题、节拍说明、侧栏和底栏，保留画布主体。 |
| `split-bench` | `.stage-pane` 与 `.split-aside` 分区，侧栏默认在右，也可通过 `data-split` 放到左边或底部。桌面将 `.bench-transport` 放进独立的 `transport` 网格区域，窄屏按纵向文档流排列。容器查询按栏宽调整图表和控件。 |
| `ab-compare` | `.ab-stage-grid` 支持并排，滑帘用 `WipeCompareController`，两台舞台可用 `syncCameraWith()` 对齐视角。 |

`toggleZenMode(shellEl, force?)` 在当前布局上切换 `data-zen`，收起周边面板。视角控件 `mountViewCube()` 可切换等轴、正、侧、俯视图。`mountScaleBar()` 按实际投影视域换算物理刻度，透视模式使用当前相机的 FOV，包括竖屏补偿。`worldUnitsPerMeter` 表示每米对应的世界单位数。每世界单位默认显示 `1 / worldUnitsPerMeter` 米，显式 `unitScale` 可覆盖倍率，`unitLabel` 可指定单位符号。科学色带附 `renderColorbar()` 图例。[kit/layout-shell.js](../kit/layout-shell.js) · [kit/field-viz.js](../kit/field-viz.js)

## 四层离线字体与 KaTeX

| 用途 | 字体和排版 |
|---|---|
| 标题、导语与阅读正文 | `--font-display`、`--font-prose` 使用 Newsreader 和 Noto Serif SC（`Simulify Serif SC`）。标题可用 `text-wrap: balance`，长段正文用约 16px、60ch。 |
| 控件、表头、轴与按钮 | `--font-sans` 使用 Inter 和 Noto Sans SC（`Simulify Sans SC`）。 |
| 数学 | `--font-math`、`--font-math-italic` 使用随包 KaTeX 字库。变量用数学斜体，单位用正体。 |
| 代码、读数与坐标 | `--font-mono` 使用 JetBrains Mono，中文走 Simulify Sans SC 回退。实时对齐用 `tabular-nums`。 |

`primer-tokens.css` 引入本地 WOFF2 字体声明。使用 KaTeX 公式的页面须显式链接 `kit/katex/katex.min.css`，链接路径相对页面填写。生成无公式工作台时，`--no-katex` 省去该链接，独立包同时省去 `kit/katex/`。用 `renderTex()` 或 `LiveMathsPanel` 渲染真公式，`substituteTexVars()` 支持 `{{name}}` 和 `\var{name}` 活代入。公式可用受控标记与 `LinkBus` 互锁。`renderMathInElement()` 支持行内与展示公式，跳过代码块和 `[data-no-math]`，处理转义和金额。AST 支持分式、根式、矩阵、分段、重音、定界符与对齐。标注可渲染行内公式。[kit/fonts/fonts.css](../kit/fonts/fonts.css) · [kit/live-maths.js](../kit/live-maths.js) · [kit/callout-layer.js](../kit/callout-layer.js)

## 清晰度与可达性

- HUD、引线和公式走 DOM/CSS。避免 `backdrop-filter`、稳态 `translate3d()` 和常驻 `will-change: transform`，标注用整数 `left/top`。工程标注可用 `editorial` 引线样式，`quietMode` 降低干扰。
- HUD、按钮、标注和刻度至少 11.5px，卡片正文至少 13.5px，公式至少 14.5px。公式上下标交给 KaTeX。允许按用字缩减 CJK 字库，方法见 [stage-architecture.md](stage-architecture.md)。
- 用 `role="toolbar"` 与 `initToolbars()` 支持键盘，滑帘可用左右键与 Home/End。`prefers-reduced-motion` 下缩减入场动画和脚本运镜，让位置及状态仍可辨读。[kit/toolbar-a11y.js](../kit/toolbar-a11y.js)
