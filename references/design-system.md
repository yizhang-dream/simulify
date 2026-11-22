# 视觉皮肤、6 套版式原型、离线四层字体、1:1 锐度与无障碍规范（v2.2）

> Core CSS tokens, 6 layout archetypes, container-queried panels, offline `@font-face` declarations, ClearType rules, and 6 visual skins live in [`kit/primer-tokens.css`](../kit/primer-tokens.css), [`kit/theme-studio.css`](../kit/theme-studio.css), [`kit/layout-shell.js`](../kit/layout-shell.js), [`kit/fonts/fonts.css`](../kit/fonts/fonts.css), and [`kit/fonts.js`](../kit/fonts.js).

---

## 1. 六套内置视觉皮肤（`<html data-theme="...">`）与色盲安全色板

| 皮肤 | 适用题材与视觉气质 | 核心令牌与光棚 |
|---|---|---|
| **`paper-ink`（默认暖纸墨线）** | 教学沙盘、通用工程图解、电路与算法状态机 | `--bg: #f6eddd`、1-ring `#141a2c` 工程墨线、同向暖棕影 + 轮廓光 |
| **`dark-studio`（暗棚科学仪器）** | 高频示波、连续函数优化、发光剖面与现代机械暗棚 | `--bg: #12161f` 深石板、`--teal: #2dd4bf`、`--amber: #f59e0b`，青色轮廓光 |
| **`bio-cutaway`（实验室冷白剖面）** | 生物器官、细胞膜层、化学反应器、医疗仪器 | `--bg: #eef2f0` 冷白绿、`--teal: #0f8b8d`、`--amber: #d45d48` |
| **`blueprint`（瑞士工程蓝图）** | 机械三视图、航空/结构拆解、精密制图 | `--bg: #0c2340` 普鲁士蓝、制图网格、`#38e8ff` 青白高亮墨线 |
| **`monochrome-print`（Tufte 出版版画）** | 长文 Scrollytelling、高对比极简学术图版、数学推导 | `--bg: #fbfaf7` 洁净无噪纸面、纯黑细线、`#c23616` 朱砂强调色 |
| **`obsidian-gallery`（暗绒博物馆器物）** | 精密钟表、光学仪器、车削黄铜与玻璃展品 | `--bg: #141312` 暖黑绒棚、香槟金 `#d9b061` + 铜绿 `#38b2ac` 聚光 |

- **Okabe-Ito 8 色盲安全分类令牌**：全皮肤统一暴露 `--cat-1` ~ `--cat-8`，多曲线/多变量对照时按序取色，杜绝 4+ 曲线撞色。
- **3D 受光 PBR 材质与微纹理**：[`kit/geo-sculpt.js`](../kit/geo-sculpt.js) 内置 10 套受光 PBR 预设并自动挂载缓存程序化微纹理（`brushed` 拉丝金属 / `grain` 石膏哑光颗粒 / `anodized` 喷砂微粒，可通过 `microTexture: false` 关闭），并新增 [`createXRayMaterial`](../kit/geo-sculpt.js)（物理 Fresnel 边缘透视，推荐配合 `GLASS_LAYER = 3` 保留内部实体 1px 轮廓线）。
- **四层渲染隔离 + 零额外 Pass 缝隙 AO**：
  - `SOLID_LAYER = 0`（受光实体 + 1-ring 墨线 + 零额外 Pass 屏幕空间缝隙环境光遮蔽 `aoStrength`）
  - `GROUND_LAYER = 1`（径向渐隐网格 `cartesian|polar|plinth`、软接触影 `addContactShadow`、Stencil 剖面封口、粒子与矢量场）
  - `SURFACE_LAYER = 2`（独立无色调映射 2× HiDPI 3D HTML 面板）
  - `GLASS_LAYER = 3`（光学玻璃与 Fresnel X-Ray 外壳，绝不遮挡内部实体的法线/深度描边）

---

## 2. 六种正交版式原型（告别单一四角小卡片）

在 `.artboard-shell` 上通过 `data-layout="..."` 声明版式（容器查询 `container-type: inline-size` 让 `.kpi-grid` / `.option-grid` 等组件随所在栏宽自适应，而非死绑视口宽度）：

| 版式原型 | 属性声明 | 适用场景与核心结构 |
|---|---|---|
| **① 全屏画布悬浮 HUD** | `data-layout="fullbleed-hud"`（默认） | 稀疏渐进叙事、空间占比优先的 4D 舞台；内置 `.top-ribbon`、`.beat-caption-pill`、`.right-dock`、`.bottom-left-dock`、`.bottom-transport` |
| **② 结构化分屏工作台** | `data-layout="split-bench"`（可选 `data-split="left\|right\|bottom"`） | 物理 × 数学双联、代码 ↔ 硬件追踪、多图表示波器；CSS Grid 将 3D 舞台（`.stage-pane`）与可滚工作栏（`.split-aside`）彻底隔离，零 HUD 遮挡 |
| **③ A/B 同步双舞台 / 对比滑帘** | `data-layout="ab-compare"`（`data-compare="side\|wipe"`） | 反事实对照、实体 vs 剖面/X-Ray、双算法同屏；配合 `stageA.syncCameraWith(stageB)` 与 [`WipeCompareController`](../kit/layout-shell.js) |
| **④ 工程三视图联动布局** | `data-layout="multi-view"` | 机械/光学/解剖结构拆解；主 3D 视角 + 右侧 `.multiview-strip` 实时同步 Front / Side / Top 正交视图（`stage.updateMultiViewStrip()`） |
| **⑤ 叙事滚动长文 + Sticky 3D 舞台** | `data-layout="scrolly-stage"`（`.scrolly-shell`） | 深度长文原理阐释（Bartosz Ciechanowski 风格）；左列 `15.5px / 58ch` 舒适阅读流（`.scrolly-prose`）+ 右侧 `position: sticky` 3D 舞台，配合 [`ScrollyBridge`](../kit/layout-shell.js) 双向驱动 `SpacetimeClock` + CSS Scroll-Driven 顶栏进度条 |
| **⑥ 沉浸剧场态** | 任意版式叠加 `data-zen="true"` | 通过 [`toggleZenMode`](../kit/layout-shell.js) 一键收起侧栏与非必要面板，仅留全屏舞台与极简控制条 |

### 编辑级排版与舞台轻控件原语
- **大字号阶梯**：`.hero-act-banner`（`--fs-hero: clamp(28px, 3.2vw, 42px)` + `.act-index` 等宽章节号）、`.kpi-readout`（`--fs-kpi` 主读数 + 单位 + 差值）、`.editorial-block` + `.hairline-rule` 无框细线排印，打破全屏圆角描边小盒子堆叠。
- **无框工程标注**：[`CalloutLayer`](../kit/callout-layer.js) 支持 `style: 'editorial'`（无方框纯细下划线 + 干净引线）、`LinkBus` 悬停点击互锁与 `quietMode` 静默降噪，且严格以整数 `left/top` + `transform: ''` 定位保护 ClearType 锐度。
- **空间方位与物理标尺**：[`mountViewCube`](../kit/layout-shell.js)（等轴/正/侧/俯一键切换 + 实时方位角 + 手动视角锁定恢复胶囊）、[`mountScaleBar`](../kit/layout-shell.js)（随缩放动态换算世界物理标尺）与 [`renderColorbar`](../kit/field-viz.js)（科学色标图例）。

---

## 3. 离线四层字体与扩展 KaTeX 数学排版（铁律 2）

[`kit/primer-tokens.css`](../kit/primer-tokens.css) 零 CDN 加载 18 个随包 `.woff2` 字体：
- `--font-display`：`Newsreader` + `Simulify Display SC`（标题、分幕 Banner、阅读列头）
- `--font-sans`：`Inter` + `Simulify Sans SC`（正文、导语、UI 标签）
- `--font-math` / `--font-math-italic`：`KaTeX_Main`, `KaTeX_Math`, `KaTeX_Size1`, `KaTeX_Size2`
- `--font-mono`：`JetBrains Mono` + `Simulify Sans SC` 自动 CJK 回退（代码、`tabular-nums` 数值）

### 扩展数学 AST 构造器（[`kit/live-maths.js`](../kit/live-maths.js)）
除基础 `mathVar`、`mathSub`、`mathSup`、`mathSubSup`、`mathFrac`、`mathOp`、`mathNum`、`mathText`、`mathGroup` 外，v2.2 补齐完整科学排版原语（自适应非缩放描边 SVG 符号，任意高度零锯齿）：
- `mathSqrt(radicand, { index })`（根号 / $n$ 次方根）
- `mathMatrix(rows, { fence: 'brackets'|'parens'|'bars'|'braces'|'none' })`（矩阵 / 列向量）
- `mathCases(branches)`（分段函数大花括号）
- `mathAccent(base, 'vec'|'hat'|'bar'|'dot'|'ddot'|'tilde')`（矢量箭头、帽子、均值横线、一/二阶时间导数点）
- `mathFence(inner, { left, right })`（自适应伸缩括号）
- `mathAlign(rows)`（多行等号/不等号对齐推导）

### 清晰度与 ClearType 铁律
- **禁 `backdrop-filter`**，**禁稳态 `translate3d` 与静态 `will-change: transform`**；所有可见 HUD / 按钮 / 标注 / SVG 刻度字号 `>= 11.5px`（门禁底线 `< 10.5px` 直接判败），正文 `>= 13.5px`，Scrollytelling 长文 `15.5px`。
- 独立交付项目可用 `uv run --with fonttools --with brotli python scripts/setup_vendor.py <target_dir> --fonts-only --subset-cjk <project_dir>` 瘦身汉字子集。

---

## 4. 工具栏、运动偏好与无障碍基线

- **工具栏与滑帘**：`role="toolbar"` 配合 [`kit/toolbar-a11y.js`](../kit/toolbar-a11y.js)；A/B 对比滑帘支持 `role="slider"` + 左右方向键 / `Home` / `End`。
- **减少动效（`prefers-reduced-motion: reduce`）**：禁止全局 `0.01ms` 一刀切；CSS Scroll-Driven 进度条与 Scrollytelling 显隐均带强制 reduced-motion 复原规则，相机 `flyTo` 直接干净落位。
- **纯净导片与缩略图**：`?thumb=1` 与 `?export=stage|caption|hud` 自动隐藏全部版式 chrome（含 `.split-aside`、`.view-cube-dock`、`.scrolly-prose`），零闪屏输出纯净画布。
