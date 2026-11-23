# Simulify v3.1 引擎契约与验收门禁

类型与调用参数查 [kit/index.d.ts](../kit/index.d.ts)。模块索引和静态交付方式见 [stage-architecture.md](stage-architecture.md)。

## 渲染、双审美档与清晰度

- **默认管线**使用 WebGL2/WebGPU 舞台与 DOM/CSS HUD、引线和公式。通过 `IsometricStage.create(canvas, opts)` 初始化。尺寸观察优先使用 `device-pixel-content-box`，物理背板通过 `setPixelRatio(1)` 和 `setSize(physicalWidth, physicalHeight, false)` 设置，DPR 上限 3×。静止场景通过 `requestRender()` 按需重绘。[kit/stage-3d.js](../kit/stage-3d.js)
- 现代脚手架将 `three` 映射到 `three.webgpu.js`，支持 `backend: 'auto' | 'webgpu' | 'webgl2'`。使用 `legacy-webgl` 时，须将 `three` 映射到独立的 `three.module.js`，并保留 Kit 所需的 `three/webgpu` 与 `three/tsl` 映射。脚手架的 `--with-vendor` 随包提供现代管线。[kit/stage-3d.js](../kit/stage-3d.js) · [scripts/new_bench.py](../scripts/new_bench.py)
- **双审美档与 r187 安全选择性 IBL**（`StudioLightformerEnvironment` + `PRIMER_THEMES`）：
  - **Primer 触感图解档**（`paper-ink`、`monochrome-print`）：默认 `THREE.NoToneMapping`（`exposure: 1.0`）、`StudioLightformerEnvironment` PMREM `sigma: 0.030`、**选择性 IBL**（`scene.environment = null`，通过 `stage.applyEnvironment(root)` 仅给 `userData.reflective = true` 的金属/烤漆/玻璃显式绑定 `material.envMap = stage.envMap`，彻底规避 Three.js r187 中 `scene.environment` 静默忽略 `material.envMapIntensity` 的陷阱）、暖棕墨线 `#1f160f`（`paper-ink`）、更强主光/低补光对比（`keyIntensity: 1.42 / fillIntensity: 0.16 / rimIntensity: 0.24`）。
  - **Studio 精密 PBR 档**（`dark-studio`、`obsidian-gallery`、`bio-cutaway`、`blueprint`）：默认 `THREE.NeutralToneMapping`（`exposure: 1.02`）、程序化 `StudioLightformerEnvironment`（`PMREMGenerator.fromScene(studio, 0.008)` 柔光箱 + 吸光负补光挡板）、配合 `outline: 'none'` 保留原生 4× MSAA。显式 `options.toneMapping` / `options.selectiveIBL` 始终优先；`setTheme()` 跨档时重烘焙 PMREM、更新受管材质与阴影，并在未指定 `outline` 时切换默认墨线。
- **四层遮挡与新一代对象 ID 墨线**：`SOLID_LAYER`（0，PBR 实体、物理像素墨线及同通道缝隙 AO）、`GROUND_LAYER`（1，解析 `fwidth()` 网格、接触影、剖面帽与场）、`SURFACE_LAYER`（2，独立无色调映射表面）、`GLASS_LAYER`（3，玻璃和 Fresnel X-Ray）。[kit/outline-pass.js](../kit/outline-pass.js) 在 HalfFloat RGBA 中打包 `viewNormal.xy`、逐网格元数据（`mesh.userData.ink` `0..1`、`inkThin` 细杆 0.55×、`inkNormals: 'none' | false`、`inkFlat` 平面法线、`inkGroupId`）与对象 ID（`1..2040`），并用 **8 向圆核 + 近侧轮廓归属 + 1.5× 羽化抗锯齿外环**消除 1-bit 锯齿与背景外溢。Primer 皮肤默认 `primer`（厚度 `1.3`、法线阈值 `0.42`、内褶权重 `0.45`、外环权重 `0.42`）。`crisp`、`subtle` 沿用既有参数，外环权重为 `0.35`。`outline: 'none'` 零开销旁路保留原生 4× MSAA。
- **紧贴阴影、接触影、剖面与解析地面网格**：
  - `stage.fitShadowFrustum(target = stage.scene, padding = 1.12)` 将所有可见投影网格的 `Box3` 角点投影到光视图空间并做 texel snapping 与尺度自适应 `normalBias`（首次渲染前默认自动调用，可用 `autoFitShadowFrustum: false` 关闭），返回 `{ left, right, top, bottom, near, far, sceneSpan, frustumSpan, utilization }`。
  - `StageOptions` 支持 `shadowType: 'pcf' | 'vsm'`（默认 `PCFShadowMap`，Primer 半径 `4.2`、暖棕接影不透明度 `0.25`，Studio 半径 `1.65`。显式选用 VSM 时，Primer 默认 `radius: 10, blurSamples: 18`，Studio 默认 `radius: 8, blurSamples: 16`）、`shadowRadius`、`shadowBlurSamples`、`shadowBias`、`shadowNormalBias`、`autoUpdateShadows`（静态场景可置 `false` 后按需调 `stage.markShadowsDirty()`）。
  - `stage.addContactBlobShadow(radiusOrOpts = 2.4, opacity = 0.28, opts = {})` 提供 Backcountry-101 高斯接地影 `exp(-t*t*4.5)*(1-t)`。
  - 地面 `cartesian`、`polar`、`plinth` 全部改用 WebGPU TSL / WebGL2 **解析 `fwidth()` 抗锯齿着色器**（1px 锐利线宽 + 平滑径向淡出），替代旧版模糊 `1024²` `CanvasTexture`。`createCutawayCap()` 生成 45° 实心剖面。
- **角色分离 PBR 材质与无泛白数学场**：
  - [kit/geo-sculpt.js](../kit/geo-sculpt.js) 提供 `satinSteel`（粗糙度 `0.33`，金属度 `0.83`）和 `satinBrass`（`0.34`，`0.82`）。缎面预设默认用 `satin-brushed` 贴图将粗糙度轻微调制在标称值的 `97%–100%`，默认无凹凸和各向异性高光。原有车削金属预设继续使用既有拉丝参数。
  - `filletProfile(points, setback, segments = 4)` 返回与相邻线段相切的圆角采样点。用重复首点声明闭环，偏移限制在相邻边长的 45% 以内。用 `createLathedSolid(profile, { profileFillet, profileFilletSegments })` 直接车削圆角轮廓，或复用采样点生成可动壳体与匹配的剖切封边。`createGearWheel({ toothFillet, bevelSize, bevelSegments, curveSegments })` 支持控制齿顶、齿根与轴向倒边。
  - [kit/field-viz.js](../kit/field-viz.js) 暴露 `createPhysicalFieldMaterial(opts)`（零 `emissive` 泛白 + 可选解析 `fwidth()` `analyticalGrid` / `analyticalContours`），`createContourField` 默认 `textureSize = 512` 与 `MeshPhysicalMaterial`（`clearcoat: 0.24`, `emissiveIntensity: 0`）。
- **空间纹理与 3D HTML-in-Canvas**：铭牌与仪表用 `stage.configureSharpTexture(tex)` + `createCrispCanvasTexture()`（建议 ≥ 512px）。3D HTML-in-Canvas ([kit/html-surface.js](../kit/html-surface.js)) 保持严格可选扩展，使用该扩展时加跑 `--no-hic` 并目视回退结果。[kit/fonts.js](../kit/fonts.js)
- **运行时 Look-Dev 遥测**：`stage.getTelemetry()` 与实时只读属性 `window.__SIMULIFY_TELEMETRY__`（`stage.dispose()` 自动清理）返回 `{ version: "3.1", theme, aestheticTier, backend, dpr, physicalWidth, physicalHeight, toneMapping, toneMappingExposure, outline, ibl, shadow, materials }`，其中 `ibl.pmremSigma` 和 `shadow.radius` 报告实际使用的参数。供 `verify_stage.py` 自动诊断阴影视锥利用率、塑料粗糙度聚集与中间金属度。

## 模型与测试钩子

`createSimModel({ params, solve, falsifyCases, clock })` 接收确定性的 `solve(params, t)`，向各视图分发同一份冻结的普通数据快照。`setParams(patch)` 浅合并参数，`evaluate(t, overrideParams)` 做独立比较。`rk4Step(state, t, dt, derivFn)` 和 `integrateRK4(y0, t0, t1, steps, derivFn)` 支持标量或数值向量，`bisectRoot(fn, a, b, tol?, maxIter?)` 在括区内定位根。[kit/model-core.js](../kit/model-core.js)

结构化 `falsifyCases`（故障工况 / 失效边界校验）推荐为 `{ name, t, mutateParams, check }`（可选 `label`、`description`、`params`），`t` 可是时间数组。每案在同一时刻重新计算基准和变异快照，至少有一组不同快照，并通过明确的数值或失效断言。也可提供 `{ name, run(evaluate) }` 自定义采样，仍须在同一时刻对照。`check` 可返回布尔值或包含 `passed`、`detail` 和可选指标的对象。报告为 `{ version: 3, passed, total, passedCount, assertions }`，每项含名称、比较次数、结果及可选指标。**独立不变量校验纪律**：严禁在 `check` 中复制、重写或换元套用 `solve()` 的内部实现来自证（避免“公式写错仍自洽通过”）；必须检验独立于实现细节的物理或数学不变量——如守恒律、对称性/零输入静止、临界阈值发散、单调性边界或相对于基准快照的实测落差。[kit/model-core.js](../kit/model-core.js)

```js
exposeTestHooks({ version: 3, profile, clock, director, stage, choreographer, model, falsify });
```

- 对象式调用优先用 `clock` 作时间控制器，其次选 `director`，也支持 `scrubber`。省略 `falsify` 时自动委托 `model.falsify()`，显式覆盖时仍应返回真实比较结果。注册后设置 `window.__simulify` 和 `window.__ready = true`。[kit/timeline-director.js](../kit/timeline-director.js)
- `seek(t, { forceCamera = true } = {})` 将时间限制在时间轴范围内，向模型、同步回调和编排传递实际落点。钟绑定模型经订阅更新，其他模型由钩子同步。配置 `syncAll` 时只调用一次，编排在尚未评估时补一次。需要保留用户视角时用 `forceCamera: false`，日常脚本镜头使用 `stage.setCameraFromScript(pose)`。[kit/timeline-director.js](../kit/timeline-director.js)
- `getTimelineInfo()`、`getActiveActorCount(t)`、`getGeometryAudit()`、`setCardinalView()`、`getFontAudit()` 提供验证所用的时间、角色、几何、镜位和字体信息。`enterExportMode()` / `exitExportMode()` 仍可隔离验收采样时的播放状态。深链解析与时间应用由 `parseUrlState()` /`applyUrlState()` 负责。[kit/timeline-director.js](../kit/timeline-director.js)

## 验证器与 Profile 门禁

```bash
node tests/run-tests.mjs
uv run scripts/verify_stage.py --root <dir> --entry index.html --probe "?stage=..."
```

`--profile auto` 优先读取有效的运行时 Profile，版本 ≥ 2 且未声明有效 Profile 时回落到 `mechanical-3d`。显式 `--profile` 优先。脚本检查 1280×800、1440×900、390×844 以及指定深链，产出截图与 JSON 回执。指定 `--backend webgpu` 或 `--backend webgl2` 时，入口及深链都携带该参数，运行时后端必须匹配。缩略图脚本同样校验指定后端及主动渲染结果。[scripts/verify_stage.py](../scripts/verify_stage.py) · [scripts/bake_thumbs.py](../scripts/bake_thumbs.py)

| Profile | `geometry_diversity` | `three_views` | `initial_sparsity` | `temporal_scrub` | `camera_ownership` | `mandatory_falsify` |
|---|---|---|---|---|---|---|
| `mechanical-3d` | 硬门禁 | 硬门禁 | 硬门禁 | 硬门禁 | 硬门禁 | 硬门禁 |
| `field-math` | 遥测 | 遥测 | 遥测 | 硬门禁 | 硬门禁 | 硬门禁 |
| `sandbox-direct` | 遥测 | 遥测 | 遥测 | 硬门禁 | 硬门禁 | 硬门禁 |

表格对应 `PROFILE_GATES`。实际回执可将不适用项标为 `skipped`，只有有效状态为 `hard` 的项目能阻断通过。[scripts/verify_stage.py](../scripts/verify_stage.py)

| 门禁 | 适用条件与判定 |
|---|---|
| 几何多样性 | 桌面、无固定时间或阶段查询的常规入口采样。选网格数最多的采样点，要求网格非空、`cuboidRatio <= 0.70` 且 `sculptedMeshes > 0`。 |
| 三视图 | 仅主桌面视口且有画布时运行。抓正、侧、俯和等轴图，检查正对侧、正对俯的图像差异，以及三轴尺寸为正、`flatnessRatio >= 0.08`。 |
| 初始稀疏度 | 仅主桌面视口，取首次寻址前的快照。开场不能处于完成态，有起始与峰值演员计数时要求前者较小。严格模式要求演员计数钩子。当前机械档验收没有按拍数跳过此项。 |
| 时间回拖 | 仅主桌面视口。两个直操档在 `T <= 0.2s` 时跳过，机械档仍要求有效 `seek` 和 `T > 0.2s`。按 10% → 50% → 90% → 50% 取图，要求进展差异 ≥ 0.35、回拖差异 ≤ 1.8。 |
| 相机所有权 | 仅主桌面视口且有画布时运行。实际拖拽要求角度变化 ≥ 0.08 rad，等待约 450ms 后漂移 ≤ 0.05 rad，并检查运行时报告的用户锁。 |
| 失效边界校验 | v2 起要求 `passed === true` 及非空具名成功断言，断言须验证独立不变量。v3 验证直接调用 `model.falsify()`，要求报告版本为 3、整数计数一致且每案比较次数为正整数。提供数值指标时，两值须有限且不同。 |

`mechanical-3d` 要求运行时舞台报告有效的 `webgpu`、`webgl2` 或旧式 `webgl` 后端。其他档缺少 3D 舞台时跳过几何多样性、三视图和相机所有权检查。[scripts/verify_stage.py](../scripts/verify_stage.py)

通用硬门禁覆盖 console/page/request/GPU 错误、有效舞台、非空画布、紫帧、图表和文案。画布检查取 RGB 各通道空间标准差的最大值，要求大于 1.5，缺少 Pillow 或 NumPy 时画布检查失败。紫帧要求 `magentaRatio <= 0.015`，以 `R>210 & G<45 & B>210` 计数。可见图表至少 200×85。桌面和 390px 视口都检查导学溢出、水平裁切及 HUD 重叠。`split-bench` 工作栏允许纵向滚动。桌面舞台高度至少占视口 45%，宽度通常至少 45%，A/B 至少 40%。v2 起的字体检查需要至少两张已加载字面、零失败、物理背板对齐，且无命中的过小文字（CSS 小于 10.45px 或有效渲染小于 9.5px）。3D HTML-in-Canvas 遮挡与贴图像素密度记录为遥测。[scripts/verify_stage.py](../scripts/verify_stage.py)

**Look-Dev 遥测、2× 特写裁片与汇总审稿单（v3.1）**：`verify_stage.py` 对主画布输出量化像素遥测（`colorEntropyBits < 3.0`、`dominantColorShare > 0.65`、`edgeDensity < 0.025`、`luminanceContrast < 55` 时发出顾问警告，`magentaRatio > 0.015` 触发硬失败）并读取 `stage.getTelemetry()` / `window.__SIMULIFY_TELEMETRY__`（阴影视锥利用率 `< 0.35`、非地面网格粗糙度聚团在 `[0.20, 0.45]` 或出现中间金属度 `0.2–0.7` 时发出警告，老工作台缺省时平滑降级）；同时在主桌面视口旁生成 2× 中心特写裁片 `*-closeup.png`，并将主图、特写、三视图/探针与 390px 窄屏帧拼成单张带标签审稿单 `*-contact-sheet.png` 写入回执 `contactSheet`。验收时务必打开审稿单、整图与 `*-closeup.png`，核对倒角锐度、材质角色分离、结构尺寸、方程、分拍节奏与故障工况。[scripts/verify_stage.py](../scripts/verify_stage.py)
