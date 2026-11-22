# 架构总览：1:1 锐度离线 4D 内核、雕塑库、发行外壳与验证工具链

> **架构设计原则**：所有运行资源（Three.js WebGPU/TSL ESM、四层 WOFF2 字库、非盒体雕塑库、样式令牌、纯 JS 导片编码器、多语言字典与烘焙缩略图）均 **100% 离线随包运行、零外链 CDN**，同一份代码可直接部署为静态网站或打包成桌面软件（Tauri / Electron / WebView2）。

---

## 1. Layer 1 · 单课核心 4D 引擎（[`kit/`](../kit/)）

| 模块 | 职责 | 核心导出 |
|---|---|---|
| [`kit/stage-3d.js`](../kit/stage-3d.js) | 1:1 物理像素（`device-pixel-content-box`）WebGPU/WebGL2 舞台、同向主光投影 + 轮廓背光（`_rimLight`）、径向渐隐程序地网（`setGridStyle('cartesian'\|'polar'\|'plinth'\|'none')`）、柔和接触阴影（`addContactShadow`）、局部点光源（`createAccentLight`）、WebGPU/WebGL 双后端 Stencil 45° 实心剖切帽（`createClippingGroup` / `createCutawayCap`）、景深与缝隙 AO 控制（`setAOStrength` / `enableDepthOfField`）、双舞台相机互锁（`syncCameraWith`）、多视图正交快照条（`captureCardinalSnapshot` / `updateMultiViewStrip`）、`getGeometryAudit()` 与 `setCardinalView` | `IsometricStage`, `STUDIO_THEMES`, `SOLID_LAYER`, `GROUND_LAYER`, `SURFACE_LAYER`, `GLASS_LAYER` |
| [`kit/outline-pass.js`](../kit/outline-pass.js) | TSL/GLSL 1-ring 物理像素锐利工程墨线、零额外 Pass 屏幕空间缝隙环境光遮蔽（`aoStrength` / `setAOStrength`）、`colorPass` 模板缓冲（`stencilBuffer: true`）、四层渲染隔离（`GLASS_LAYER = 3` 仅进色彩通道免描边）、独立无色调映射 `surfacePass` 与按需景深（`enableDepthOfField`） | `OutlinePass`, `OUTLINE_PRESETS`, `SOLID_LAYER`, `GROUND_LAYER`, `SURFACE_LAYER`, `GLASS_LAYER` |
| [`kit/layout-shell.js`](../kit/layout-shell.js) | 6 种声明式布局原型（`fullbleed-hud` / `split-bench` / `ab-compare` / `multi-view` / `scrolly-stage` / `zen`）、6 套主题、杂志式 `ScrollyBridge`（滚轮直驱 4D 时钟）、`WipeCompareController`（卷帘对比）、`mountViewCube` 与 `mountScaleBar` | `LAYOUT_ARCHETYPES`, `THEME_PRESETS`, `ICONS`, `toggleZenMode`, `setShellPresentation`, `ScrollyBridge`, `WipeCompareController`, `mountViewCube`, `mountScaleBar` |
| [`kit/field-viz.js`](../kit/field-viz.js) | 科学物理场与工程动态表达库：6 套感知均匀色带（`viridis`/`plasma`/`magma`/`coolwarm`/`thermal`/`cividis`）+ 标尺图例、脉冲流带（`createFlowConduit`）、零 GC 3D 矢量场（`createVectorField`）、可逆 4D 确定性粒子群（`createDeterministicSwarm`）、轨迹丝带 + 频闪幽灵（`createMotionTrail`）、3D 尺寸/力矢/夹角标注（自动明暗反差精灵标牌）与带独立哑光裙边的等值线标量高度场（`createContourField`） | `COLORMAPS`, `sampleColormap`, `colormapCssGradient`, `renderColorbar`, `createFlowConduit`, `createVectorField`, `createDeterministicSwarm`, `createMotionTrail`, `createDimensionMeasure`, `createForceArrow`, `createAngleArc`, `createContourField` |
| [`kit/html-surface.js`](../kit/html-surface.js) | 现代原生 `<canvas content="drawable">` 3D 活 HTML 表面（`border-box` × `>= 2×` HiDPI / 投影缩放分配 + WGSL 预乘线性 mipmap + 16× 各向异性 + `flushPaint()`）+ 非 HIC 浏览器无污染纯 Canvas2D 3D `CanvasTexture` 回退 | `HtmlSurfaceManager`, `supportsHtmlInCanvas`, `computeCanvasMatrix4`, `computeCanvasTransform` |
| [`kit/geo-sculpt.js`](../kit/geo-sculpt.js) | 跨学科非盒体 3D 雕塑库（5 大构造族 + 10 套主题自适应受光 PBR 材质 + 缓存式程序微纹理贴图 `createProceduralSurfaceMaps` + Fresnel X-Ray 透视材质 `createXRayMaterial` + `createGlassVessel` 默认挂 `GLASS_LAYER`） | `SCULPT_GEO_KINDS`, `SCULPT_MATERIAL_PRESETS`, `createProceduralSurfaceMaps`, `createXRayMaterial`, `createSculptMaterial`, `createLathedSolid`, `createGlassVessel`, `createSculptedProbe`, `createBeaconLighthouse`, `createBevelledProfile`, `createGearWheel`, `createHorseshoeYoke`, `createArchSpan`, `createAirfoilVane`, `createHeightfieldSurface`, `createFracturedChasm`, `createParametricSurface`, `createDeformableStrip`, `createHelicalCoil`, `createTaperedConduit`, `createPleatedBellows` |
| [`kit/fonts.js`](../kit/fonts.js) + [`kit/fonts/fonts.css`](../kit/fonts/fonts.css) | 离线四层 WOFF2 字库（Display / Sans / KaTeX Math / JetBrains Mono + CJK）与 DOM/SVG/Canvas 统一桥接、`>= 512px` 锐利 3D 贴图工厂 | `FONT_STACKS`, `getFontStack`, `canvasFont`, `waitForFonts`, `onFontsReady`, `areFontsReady`, `createCrispCanvasTexture` |
| [`kit/spacetime.js`](../kit/spacetime.js) | 单一主控 4D 可逆时钟（单通道 `seek()` 防双触）+ O(1) 连续正反向采样轨迹带与不可变反事实幽灵快照 | `SpacetimeClock`, `SimulationTape`, `defaultInterpolateState` |
| [`kit/choreography.js`](../kit/choreography.js) | 纯函数时间编排：3D/HUD/`surface` 入退场（含 `explode`/`draw`/`blueprint`）、爆炸分解组（`explodeGroup`）、剖切扫掠（`clipSweep`）、去饱和哑光/线框焦点（`focus` `mode: 'matte'\|'wireframe'\|'opacity'`）与尊重用户相机锁的 `cameraBeat` | `ActorChoreographer` |
| [`kit/timeline-director.js`](../kit/timeline-director.js) | `T1–T4` 时空导演、`mountTimelineBar`（含 `setLang` / `setStageLabels`）、`applyUrlState`、`exposeTestHooks`（合成 `window.__simulify` v2 契约含 `getGeometryAudit` / `getFontAudit` 与严格 1× `seek`） | `TrackTimeline`, `TimelineDirector`, `PhaseScrubber`, `mountTimelineBar`, `parseUrlState`, `applyUrlState`, `exposeTestHooks` |
| [`kit/manipulator.js`](../kit/manipulator.js) | 3D 手柄拖拽与网格涂画（冒泡光标同步不与 `stage-3d` 冲突、`clock`/`bindClock` 切幕自动退出） | `StageManipulator`, `GridBrush` |
| [`kit/chart-card.js`](../kit/chart-card.js) | 持久 SVG 节点复用与 6 种图表模式：XY 曲线（`movingAverageWindow` / `ghost` / `onScrub`）、通用相图滞回（`updateHysteresis`）、分布与积分阴影（`updateDistribution`）、矩阵热力图（`updateHeatmap`）、时序逻辑分析仪（`updateTiming`）与迷你 KPI 走势卡（`updateSparkKpi`），内置 Okabe-Ito 色盲安全色系（`cat1..cat8`） | `ChartCard` |
| [`kit/live-maths.js`](../kit/live-maths.js) | KaTeX 真数学排版活公式：变量/上下标/分式/巨算子 + v2.2 根式（`mathSqrt`）、矩阵（`mathMatrix`）、分段函数（`mathCases`）、头标（`mathAccent`）、自适应定界符（`mathFence`）与多行等号对齐（`mathAlign`） | `LiveMathsPanel`, `mathVar`, `mathSub`, `mathSup`, `mathSubSup`, `mathFrac`, `mathOp`, `mathNum`, `mathText`, `mathGroup`, `mathSqrt`, `mathMatrix`, `mathCases`, `mathAccent`, `mathFence`, `mathAlign`, `normalizeUnicodeScripts` |
| [`kit/stage-2d.js`](../kit/stage-2d.js) / [`link-bus.js`](../kit/link-bus.js) / [`callout-layer.js`](../kit/callout-layer.js) | 主题感知 + 边框精确裁切箭头 + 确定性 4D 调度（`setPacketSchedule` / `evaluate`）的轨道 B 舞台；`LinkBus` 总线；支持 `editorial` 无框排版、`quietMode`、`LinkBus` 联动与整数 ClearType 定位的 3D→2D 引线层 | `SvgFlowStage`, `LinkBus`, `CalloutLayer`, `resolveCalloutRects` |
| [`kit/stage-exporter.js`](../kit/stage-exporter.js) + [`kit/export/compositor.js`](../kit/export/compositor.js) | 浏览器离线零 CDN 一键导出 MP4/WebM/GIF/APNG/PNG（含运行时 `setLang()`、`flushPaint()` 同步与双路径无重复合成） | `StageExporter`, `mountExportButton`, `supportsHtmlInCanvasCompositor` |
| [`kit/spring.js`](../kit/spring.js) / [`popups.js`](../kit/popups.js) / [`sound.js`](../kit/sound.js) / [`toolbar-a11y.js`](../kit/toolbar-a11y.js) / [`agency-loop.js`](../kit/agency-loop.js) | 阻尼弹簧（负 `dt` 防护）、空间飘字、Web Audio 触感音效、工具栏无障碍与主动演示闭环 | `Spring`, `FloatingPopups`, `TactileSound`, `initToolbars`, `AliveLoop`, `IntroDemo` |

---

## 2. Layer 2 · 可选站点与软件发行外壳（[`shell/`](../shell/)）

当从单个样板课扩展成**多语言整章学习站**或**离线桌面软件**时按需引入，不强绑单课：
- [`shell/i18n.js`](../shell/i18n.js)：多国语言字典管理（支持按需异步加载 JSON、参数插值、`[data-i18n]` 声明式刷新与 `ar`/`he` RTL 方向自动切换）；
- [`shell/command-palette.js`](../shell/command-palette.js)：`Ctrl+K` / `Cmd+K` 原生 `<dialog>` 命令面板（秒搜课程、分幕与核心术语跳转）；
- [`shell/storage-adapter.js`](../shell/storage-adapter.js)：可插拔 `StorageAdapter`（支持沙箱内存、网页 `localStorage` 与桌面软件自定义文件 IPC 桥）+ `MasteryStore` 学习完成度追踪；
- [`shell/app-shell.js`](../shell/app-shell.js)：一键挂载进度条 `[role="progressbar"]` 与语言切换胶囊。

---

## 3. CLI 工具链（[`scripts/`](../scripts/)）

- `python scripts/setup_vendor.py <lesson_dir>`：提取离线纯净 `three` WebGPU + TSL + `RoomEnvironment` + `RoundedBoxGeometry` + `BufferGeometryUtils` 到本地 `vendor/three/` 并同步 `kit/fonts/`（支持 `--no-fonts`、`--fonts-only` 与 `--subset-cjk <project_dir>` 汉字子集瘦身）。
- `uv run scripts/verify_stage.py --root <dir> --entry <index.html> [--no-hic] [--dpr 2] [--strict-4d] [--probe "?stage=..."]`：自动启临时服务，在 `1280×800`、`1440×900`、`390×844` 上执行**全节拍多幕巡检**、HUD/3D `HtmlSurface` 遮挡检测（`> 15%` 判败）、`typography-crispness`（字体/物理画布/碎字/3D 贴图密度）、`geometry-diversity`（反长方体）、`three-views`（正/侧/俯/等轴四视图自动抓拍与非扁平体量比例校验）、`camera-ownership`（实测鼠标拖拽 + 400ms 不弹回）及全部 4D 确定性校验，产出 JSON 验机回执与截图。
- `uv run scripts/bake_thumbs.py --root <dir> --manifest <thumbs.json>`：利用 `?thumb=1` 与确定性 `t` 从真实渲染画面自动烘焙高清 2× 缩略图。
- `uv run scripts/export_video.py --root <dir> --entry <index.html> --out <file> --preset 1080p60`：Tier 2 命令行影棚级多进程导片（支持 `caption`/`stage`/`hud` 模式与 `--shutter 180` 线性光运动模糊）。

---

## 4. 关键工程坑点避雷

1. **四层渲染隔离（Layer 0 / 1 / 2 / 3）**：
   - `SOLID_LAYER = 0`：受光不透明 3D 实体，参与法线/深度边缘检测、零额外 Pass 缝隙 AO 与 `NeutralToneMapping`；
   - `GROUND_LAYER = 1`：径向渐隐地面网格、接触阴影、3D 矢量场/标注与 Stencil 剖切帽，免描边；
   - `SURFACE_LAYER = 2`：3D HTML-in-Canvas 面板，独立无色调映射通道并按 `solidPass` 深度精确遮挡，杜绝二次压灰与发糊；
   - `GLASS_LAYER = 3`：光学玻璃罩、液面与 Fresnel X-Ray 透视外壳，进入 `colorPass` 参与真实折射/透明叠加但退出 `solidPass`，绝不遮断内部机械轮廓线。
2. **WebGPURenderer r187 剖切与模板规范**：`WebGPURenderer` 通过 `THREE.ClippingGroup` 作用域驱动剖切（忽略旧 `material.clippingPlanes`），`stage.createCutawayCap()` 自动用 `THREE.ClippingGroup` 包装被切目标与模板正反面，同时兼容传统 `WebGLRenderer`，并在 `OutlinePass` 的 `colorPass` 上开启 `stencilBuffer: true` 渲染实心 45° 工程剖面线。
2. **1:1 物理像素与 `TEXTURE_BINDING_2D` 状态卫生**：`IsometricStage` 强制 `setPixelRatio(1) + setSize(physicalWidth, physicalHeight, false)` 规避分数 DPI 下 `Math.floor` 丢 1px 糊化；WebGL2 下自定义纹理上传后必须恢复原 `TEXTURE_BINDING_2D` 与 `UNPACK_FLIP_Y_WEBGL` 防止污染后处理管线。
3. **MSAA 与深度纹理隔离**：`OutlinePass` 的 `solidPass` / `normalTarget` 保持 `samples: 0` + `NearestFilter`，仅在 `colorTarget` 开启 4× MSAA。
4. **单次 `seek` 严格 1× 同步与相机所有权**：`SpacetimeClock.seek()` 仅触发单一回调通道，`exposeTestHooks.seek()` 保证每次 `seek` 仅执行 `1× syncAll + 1× choreographer.evaluate + 1× renderNow`；镜头编排走 `stage.setCameraFromScript(pose)`，绝不强抢用户已拖拽的相机。
5. **单一真相源 `solve()`**：舞台状态、3D 雕塑变形、曲线、代码高亮与 KaTeX 活公式同帧由同一个 `solve()` 驱动，严禁任何硬编码假轨迹或假读数。
