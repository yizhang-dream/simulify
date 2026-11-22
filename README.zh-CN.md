<h1 align="center">Simulify v2.1</h1>

<p align="center">
  <b>True 4D 交互原理拆解与仿真实验台技能 &nbsp;|&nbsp; 1:1 物理锐度 WebGPU + HTML-in-Canvas &nbsp;|&nbsp; 离线四层字库、非盒体雕塑与视频导出</b>
</p>

<p align="center">
  一套开源 Agent Skill 与零构建离线 ESM 工具套件：针对纯文本、静态架构图和可读教材讲不透的三维空间构造、连续四维时间演进与反事实因果，提供 1:1 物理与数学真源、非盒体 PBR 3D 雕塑库、离线四层字体与 KaTeX 真数学排版、可倒带搓动的渐进揭幕时间轴、3D 舞台直接操控，以及一键导出 MP4 / WebM / GIF / APNG 能力。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="https://simulify.xn--ltr42g543b.cn/">在线展台</a> · <a href="SKILL.md">Agent Skill 规范</a> · <a href="INSTALL.md">安装指南</a> · <a href="examples/index.html">本地示范展台</a> · <a href="#快速开始与命令行工具">快速开始</a>
</p>

---

## 为什么做 Simulify？（与兄弟插件的水平对位）

| 表达方式 | 原生媒介 | 擅长解决的问题 | `simulify` 接棒切入的地方 |
| :--- | :--- | :--- | :--- |
| 纯文字回复 | 段落列表 | 快速结论 | 遇到空间遮挡、时间差、正负反馈与多因子耦合时难以直观展开 |
| `answer-me-with-html` | 2D 图文 + 表格 | 极低 token 把多段道理做成一页纸 | 页面偏静态，学习者无法拧动参数亲手打破平衡观察动态后果 |
| `archify` | 校验级 2D SVG 图谱 | 系统架构、时序流、ERD、状态生命周期图 | 专精二维结构连接 |
| `atlas-textbook` | 在线问题链交互书 | `carries`/`hook`/`relates` 章节编织与干净直觉句 | 继承其问题链承上启下与直白文风，落到可实时证伪的 4D 实验台 |
| **`simulify` v2.1** | **True 4D 时空 + 三视图立体 3D 雕塑 + KaTeX 双联** | **概念稿 + 正/侧/俯三视图锁比例、1:1 物理锐度、离线四层字体与离线视频导出** | 杜绝单视角 2D 盲猜，稀疏开场渐进揭幕、反长方体 PBR 建模、WebGPU + 2× HTML-in-Canvas 与全节拍 + 四视图门禁 |

---

## Simulify v2.1 核心能力升级

1. **1:1 物理锐度、锐利墨线与用户相机所有权（[`kit/stage-3d.js`](kit/stage-3d.js)、[`kit/outline-pass.js`](kit/outline-pass.js)、[`kit/html-surface.js`](kit/html-surface.js)）**：
   - [`IsometricStage`](kit/stage-3d.js) 基于 `device-pixel-content-box` 1:1 对齐物理像素（封顶 3× DPR，彻底杜绝分数 DPI 差 1px 双线性糊化），支持按需脏标记渲染 `requestRender()`（静止 0fps 零空刷 GPU）、`configureSharpTexture()`（16× 各向异性 + 三线性 mipmap）、`setOutlinePreset('crisp' | 'subtle' | 'none')`、`getGeometryAudit()` 与用户相机锁（`setCameraFromScript` 绝不抢回用户拖拽的镜头）。
   - [`OutlinePass`](kit/outline-pass.js) 切换为精确 1-ring 物理像素工程墨线（彻底消除外环灰雾晕）与 `NeutralToneMapping`，并将 3D HTML 面板隔离在独立无色调映射的 `SURFACE_LAYER = 2`。
   - [`HtmlSurfaceManager`](kit/html-surface.js) 按 `border-box` × `>= 2×` HiDPI/投影缩放分配纹理，配合预乘线性 WGSL mipmap 链、16× 各向异性与 `flushPaint()`，彻底根治 0.5× 糊字；在 Firefox / Safari 无 `CanvasDrawElement` 环境下自动走零污染纯 Canvas2D 高分 3D `CanvasTexture` 回退，兼顾 3D 深度遮挡与导出一致性。
2. **离线四层 WOFF2 字库与 KaTeX 真数学排版（[`kit/fonts/`](kit/fonts/fonts.css)、[`kit/fonts.js`](kit/fonts.js)、[`kit/live-maths.js`](kit/live-maths.js)）**：
   - 随包内置 18 个零 CDN `.woff2` 字体（`Newsreader` + `Simulify Display SC`、`Inter` + `Simulify Sans SC`、`KaTeX_Main/Math/Size1/Size2`、`JetBrains Mono` + CJK 自动回退），配套 ClearType 锐利样式（稳态 `transform: none`、零 `backdrop-filter`、`>= 11.5px` 清晰字号底线）、`canvasFont()` 与 `>= 512px` `createCrispCanvasTexture()`（字体就绪自动重绘）。
   - [`LiveMathsPanel`](kit/live-maths.js) 提供 `mathVar`、`mathSub`、`mathSup`、`mathSubSup`、`mathFrac`、`mathOp`、`mathNum`、`mathText`、`mathGroup` 结构化数学构造器与 `normalizeUnicodeScripts()` 遗留上下标自动抢救，以及双向 `LinkBus` 高亮。
   - [`scripts/setup_vendor.py`](scripts/setup_vendor.py) 一键同步 Three.js（含 `BufferGeometryUtils.js`）与 `kit/fonts/`，并支持 `--subset-cjk <project_dir>` 按单课实际汉字生成超轻子集（可由 2.07 MB 压至 ~0.6 MB）。
3. **跨学科非盒体 3D 雕塑与受光 PBR 库（[`kit/geo-sculpt.js`](kit/geo-sculpt.js)）**：
   - 终结 `BoxGeometry` / `RoundedBoxGeometry` / `PlaneGeometry` + 无光 `MeshBasicMaterial` 乐高积木场景，提供 5 大跨学科构造族 + 10 套主题自适应受光 PBR 材质（`createSculptMaterial`）：车削精密器物（`createLathedSolid`、`createGlassVessel`、`createSculptedProbe`、`createBeaconLighthouse`）、异形倒角型材（`createBevelledProfile`、`createGearWheel`、`createHorseshoeYoke`、`createArchSpan`、`createAirfoilVane`）、零 GC 实时变形地形/悬崖/曲面/弹性带（`createHeightfieldSurface`、`createFracturedChasm`、`createParametricSurface`、`createDeformableStrip`）、真 3D 螺旋/变径管路/波纹管（`createHelicalCoil`、`createTaperedConduit`、`createPleatedBellows`）。
4. **True 4D 渐进揭幕、3D 直操与持久 SVG 图表（[`kit/spacetime.js`](kit/spacetime.js)、[`kit/choreography.js`](kit/choreography.js)、[`kit/manipulator.js`](kit/manipulator.js)、[`kit/chart-card.js`](kit/chart-card.js)）**：
   - [`SpacetimeClock`](kit/spacetime.js)（单次 `seek()` 严格单通道回调）+ [`SimulationTape`](kit/spacetime.js)（O(1) 正反向插值 + 不可变反事实 `captureGhost()`）+ [`ActorChoreographer`](kit/choreography.js)（稀疏 `t = 0` 开场与纯函数编排）。
   - [`StageManipulator`](kit/manipulator.js) / [`GridBrush`](kit/manipulator.js) 新增光标礼让与 `bindClock()` 切幕自动退出；[`ChartCard`](kit/chart-card.js) 采用持久 SVG 节点复用（连续拖搓零中断）+ `movingAverageWindow` O(N) 移动平均趋势线。
5. **全节拍真实交互质量裁判与双层导片（[`scripts/verify_stage.py`](scripts/verify_stage.py)、[`kit/stage-exporter.js`](kit/stage-exporter.js)、[`scripts/export_video.py`](scripts/export_video.py)）**：
   - [`scripts/verify_stage.py`](scripts/verify_stage.py) 彻底消灭「仅测 `t ≈ 0.35s` 假绿」：自动按 `getTimelineInfo()` 采样首幕、中间各幕与末幕中点复测 HUD 与 `.beat-caption-pill` / 3D `HtmlSurface`（遮挡 `> 15%` 即判败）、`guideOverflow`、`horizontalTruncations` 与图表清晰度，并新增 `typography-crispness`、`geometry-diversity`（`cuboidRatio <= 0.70` 且 `sculptedMeshes > 0`）、桌面实测鼠标拖拽 `camera-ownership`（+ 400ms 不弹回）及 `--no-hic` 回退测试。
   - Tier 1 浏览器离线零 CDN 导片（`MP4`/`WebM`/`GIF`/`APNG`/`PNG`，支持运行时 `setLang()`）与 Tier 2 命令行影棚渲染（`scripts/export_video.py`，`--shutter 180`）。

---

## 真 4D 新基线（概念稿 → 工程三视图锁比例 → 立体真 4D）

所有依赖旧单视角 2D 概念图推导出的示范实验台已清空，画廊以全新基线重新出发：

1. **架构概念稿（Step 1a）**：用清晰结构化文本与表格敲定原生真源（`①–④`）、三维立体结构与剖切层次、`T1–T4` 分拍揭示台账、直操交互与反例断言，不再出误导纵深的单视角 2D 概念图。
2. **正/侧/俯工程三视图（Step 1b）**：动代码前先出对齐的**正视图（Front）/ 侧视图（Side）/ 俯视图（Top）**三视图，并锁死 `DIMENSIONS` 三轴世界尺寸常量表（`L × W × H`、壁厚间隙与 4D 运动包络）。
3. **真 4D 构建与四视图回校（Steps 2–3）**：基于 `kit/` 离线引擎按尺寸表构建全视角自洽的立体真 4D 装置，并用 `verify_stage.py` 自动跑通全节拍交互与 **正视 / 侧视 / 俯视 / 等轴** 四视图比例验机。

---

## 快速开始与命令行工具

依赖 Python 3.10+（推荐配合 `uv`）与 Node.js 20+，无需打包器与联网 CDN：

```bash
# 1. 提取离线 Three.js WebGPU + TSL + 兼容 ESM 运行时与四层离线字体
python3 scripts/setup_vendor.py examples/shared
# 可选：为独立发布项目按实际汉字做超轻子集化瘦身
uv run --with fonttools --with brotli python3 scripts/setup_vendor.py dist/my-bench --fonts-only --subset-cjk dist/my-bench

# 2. 运行全部语法检查、清单同步、链接完整性校验与 v2.1 单元测试
npm test

# 3. 执行三视口 + 全节拍 + 正/侧/俯/等轴四视图 + 字体/雕塑/相机所有权质量裁判
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html
# 同时检验 Firefox/Safari 无 HTML-in-Canvas 环境的回退清晰度
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html --no-hic

# 4. 离线烘焙 2× 高清缩略图（支持 manifest 中指定 t 与 exportMode）
uv run scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json

# 5. 通过 Tier 2 命令行导出高清 4D 视频与 GIF
uv run scripts/export_video.py --root . --entry examples/<your-bench>/index.html \
  --out dist/demo.mp4 --preset 1080p60 --hud caption --formats mp4,gif
```

---

## 目录结构

```text
simulify/
├── SKILL.md                  # Agent Skill 工作流（概念稿 + 三视图锁版）、四条铁律与全节拍门禁
├── plugin.json               # 插件清单（v2.1.0，与 .claude-plugin/marketplace.json 同步）
├── LICENSE                   # MIT 开源协议
├── kit/                      # Layer 1：1:1 物理锐度 WebGPU/TSL 舞台（含超时降级 WebGL2 与三视图机位）、
│   │                         #          锐利 OutlinePass、2× HtmlSurface、非盒体 geo-sculpt 雕塑库、
│   │                         #          4D 时钟与编排、操控器、持久 ChartCard、KaTeX LiveMathsPanel 与样式令牌
│   ├── fonts/                # 离线四层 WOFF2 字库（Newsreader、Inter、KaTeX、JetBrains Mono + CJK）
│   └── export/               # 按需懒加载纯 JS MP4/WebM/GIF/APNG 封装器与双路径合成器
├── primitives/               # 按三视图 DIMENSIONS 尺寸表封装的领域 3D 图元工厂
├── shell/                    # Layer 2：可选多语言 i18n、Ctrl+K 命令面板、存储适配器与进度条
├── scripts/                  # setup_vendor.py (--subset-cjk)、verify_stage.py (--no-hic + three-views)、bake_thumbs.py、export_video.py
├── references/               # 原生真源与雕塑法则、T1–T4 时间维度、题材适配、视觉与字体规范、架构手册
├── examples/                 # 清空待入驻的真 4D 画廊与共享离线 Three.js 运行时
└── tests/                    # 全量 Node ESM 单元测试、雕塑/字体/封装器校验、语法与链接完整性套件
```
