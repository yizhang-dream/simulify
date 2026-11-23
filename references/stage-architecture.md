# Simulify v3.1 静态目录与运行架构

交付目录包含 HTML、ESM、CSS 和本地 Three.js、WOFF2、KaTeX。用本地 HTTP 服务或静态站点打开。浏览器加载模块需要 HTTP。`kit/index.d.ts` 是公开 API 入口，按核心交互选用模块。视频制片交给 `onetake`，纯二维流程图交给 `archify`。[kit/index.d.ts](../kit/index.d.ts)

## 数据与渲染路径

1. 生成 `index.html`、`model.js`、`main.js` 和 `styles.css`。仓外目标需要 `--with-vendor`，随包复制 Kit、`primitives/`、现代 Three.js、字体和 KaTeX。`--no-katex` 省去 KaTeX 样式链接和随包资源。仓内目标可共享 Kit 与 vendor，`--serve` 会按所用模式选择预览根目录。[scripts/new_bench.py](../scripts/new_bench.py)
2. 在 `model.js` 定义参数、`solve(params, t)` 与结构化 `falsifyCases`，由 `createSimModel()` 对外分发同一份快照。按需用 `rk4Step`、`integrateRK4` 积分和 `bisectRoot` 定位临界值。[kit/model-core.js](../kit/model-core.js)
3. **静态 Look-Dev 门禁**：完成几何装配后先调用 `stage.fitShadowFrustum(...)` 并捕获静态整图 + 2× 中心特写裁片（`*-closeup.png`），确认剪影、材质角色分离、柔光箱/选择性 IBL 与阴影紧贴后再接入时间轴与交互。
4. 时间轴与交互输入更新模型，场景、图表、代码和公式订阅同一状态。基准轨迹可由 `SimulationTape.captureGhost()` 保留，用于与变参后的同一时刻对照。[kit/spacetime.js](../kit/spacetime.js)
5. WebGL2/WebGPU 按皮肤所属审美档（Primer 触感图解档 vs Studio 精密 PBR 档）绘制 3D，DOM/CSS 绘制 HUD、引线与公式。只在确有空间贴附需求时启用 3D HTML-in-Canvas。[engine-contract.md](engine-contract.md)

## 模块索引

| 模块 | 职责 |
|---|---|
| [stage-3d.js](../kit/stage-3d.js) / [outline-pass.js](../kit/outline-pass.js) | `IsometricStage`、双审美档（`StudioLightformerEnvironment` / 选择性 IBL）、紧贴 `fitShadowFrustum()`、高斯接触影、解析 `fwidth()` 地面网格、对象 ID 8 向圆核 AA 墨线、AO、视角互锁、剖切与 Look-Dev 遥测 |
| [geo-sculpt.js](../kit/geo-sculpt.js) / [primitives/](../primitives/) | 车削、型材、曲面、线圈、管壁与角色分离 `MeshPhysicalMaterial` 预设（哑光介质 / 清漆烤漆 / 真金属），领域部件在章节间复用 |
| [field-viz.js](../kit/field-viz.js) | 色带与色标、无自发光泛白的受光标量曲面 + 解析 `fwidth()` 等值线、矢量场、流带、确定性粒子和运动轨迹，以及尺寸／力／角度标注 |
| [spacetime.js](../kit/spacetime.js) / [choreography.js](../kit/choreography.js) | `SpacetimeClock`、`SimulationTape` 和纯时间函数编排。均匀轨迹 O(1) 定位，非均匀时间戳二分查找 O(log N) |
| [timeline-director.js](../kit/timeline-director.js) | `TimelineDirector`、`PhaseScrubber`、时间栏、URL 深链及 v3 验收钩子 |
| [manipulator.js](../kit/manipulator.js) | 可绑定时钟的 `StageManipulator` 和 `GridBrush`，切幕释放交互状态 |
| [layout-shell.js](../kit/layout-shell.js) / [theme-studio.css](../kit/theme-studio.css) | 三种布局、六套 CSS 皮肤、`toggleZenMode`、A/B 滑帘、视角与比例尺控件 |
| [chart-card.js](../kit/chart-card.js) | 持久图表，支持 XY（移动平均、幽灵轨迹、拖时）、滞回、分布及积分阴影、热力图、逻辑时序和 KPI |
| [live-maths.js](../kit/live-maths.js) / [callout-layer.js](../kit/callout-layer.js) / [link-bus.js](../kit/link-bus.js) | KaTeX 活公式、整数定位 DOM 引线与公式／部件／代码互锁 |
| [fonts.js](../kit/fonts.js) / [html-surface.js](../kit/html-surface.js) | 离线字体桥接与 3D 铭牌纹理，按需挂载的 3D HTML 表面 |
| [spring.js](../kit/spring.js) / [popups.js](../kit/popups.js) / [sound.js](../kit/sound.js) / [toolbar-a11y.js](../kit/toolbar-a11y.js) / [agency-loop.js](../kit/agency-loop.js) | 阻尼弹簧、空间提示、触感音效、键盘工具栏与主动演示 |

## 命令行

- `python scripts/setup_vendor.py <target_dir>` 默认从仓内 `examples/shared/vendor/three/` 复制 Three.js 和 addons，同时同步 `kit/fonts/` 与 `kit/katex/`，完整克隆下零联网。显式 `--from-npm` 或仓内 Three.js 目录缺失时会走 npm 路径。`--fonts-only --subset-cjk <project_dir>` 可选按用字缩减字体，需 fonttools 与 brotli。[scripts/setup_vendor.py](../scripts/setup_vendor.py)
- `uv run scripts/verify_stage.py --root <dir> --entry index.html --dpr 2` 输出多视口截图、2× 局部特写裁片（`*-closeup.png`）、汇总审稿单（`*-contact-sheet.png`）、Look-Dev 像素/场景遥测（含 `magentaRatio` 紫帧硬检）与验收回执。具体门禁见 [engine-contract.md](engine-contract.md)。
- `uv run scripts/bake_thumbs.py --root <dir> --manifest <thumbs.json>` 从实际舞台烘焙 2× 缩略图，清单可指定 `t` 与 `exportMode`（支持 `--dpr` 与 Windows/macOS 原生 WebGPU）。[scripts/bake_thumbs.py](../scripts/bake_thumbs.py)
