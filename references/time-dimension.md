# 时间维度（T1–T4）、渐进揭示法则（True 4D）与全节拍自动化门禁规范

> **核心第一定律（True 4D Progressive-Reveal Law）**：时间不是「换皮 PPT」的分页按钮，而是与三维空间等价的第四维因果坐标。**严禁在 `t = 0` 一口气把全部 3D 物件、对照轨、图表、代码框与公式面板全数倾倒上台（spatial-first dumping）**；必须从干净稀疏的 1–2 个核心载体起手，沿 **25–60 s 可连续双向拖动的全局时间轴**，仅在上一拍制造出真实因果冲突或认知问题时，才让新雕塑物件、子系统、幽灵对照与上下文面板顺势入场。

---

## 1. 严禁的反模式 vs True 4D 渐进编排

| **维度** | v1 伪 4D 反模式（门禁直接驳回） | Simulify v2.2 真 4D 标准 |
|---|---|---|
| **开场 `t = 0`** | 首帧铺满 3 套台面 + 4 角 HUD 塞满屏幕，或加载即调用 `director.showEnd()` 定格终态 | **稀疏起手（`<= 2` 个活跃角色，极简顶/底栏）**；从 `t = 0` 起步自然演化，或由学习者搓时间轴 / `ScrollyBridge` 滚动连续展开 |
| **物件与 HUD 登场** | 全部网格在构造函数中 `visible = true`，HUD 面板全静态常驻 | 用 [`ActorChoreographer`](../kit/choreography.js) 的 `enter`（含 `explode`/`draw`/`blueprint`）/ `explodeGroup` / `clipSweep` / `focus`（推荐 `'matte'` 或 `'wireframe'` 去饱和聚焦，杜绝半透明深度穿帮）/ `hudReveal` 按因果触发点逐个揭示 |
| **时间推进与回调** | `0.01s` 离散瞬移 + 脱钩 `performance.now()` + 双 `rAF` + 单次 `seek` 重复触发 `onSeek`+`onTick` | 单一主时钟 [`SpacetimeClock`](../kit/spacetime.js)（单通道 `seek()` 防 2× 重入）+ [`SimulationTape`](../kit/spacetime.js) 连续可逆采样 `sampleAt(t)` |
| **反事实对照** | 调参后旧轨迹瞬间消失，全靠记忆回想差异 | `tape.captureGhost()` 在舞台与 [`ChartCard`](../kit/chart-card.js) 上叠加半透明**反事实幽灵轨**（旧参数 vs 现参数同框对比） |
| **镜头与用户主导权** | 切幕靠 wall-clock 抢镜头，用户拖转视角后立刻被脚本强行弹回 | `choreographer.cameraBeat(t0, dur, pose)` 调用 `stage.setCameraFromScript(pose)`：未锁定时作为 `t` 的纯函数平滑插值；一旦用户拖拽/缩放，立即尊重 `isUserCameraLocked()` 绝不反抢 |

---

## 2. 必填《分拍角色与揭示台账》（Cast & Reveal Ledger）

开工写场景代码前，必须列出按全局时间 `t` 推进的角色登场台账（覆盖 3D 雕塑物件、3D HTML 表面与上下文 HUD 面板）：

| 拍次 / 时间窗 | 因果问题 / 触发冲突 | 新登场角色（`enter` / `hudReveal`） | 聚焦与暗化（`focus`） | 退出 / 变形（`exit` / morph） |
|---|---|---|---|---|
| **Beat 0 (`t = 0s`)** | 建立最简起点与核心对象 | `<= 2` 个核心角色（如底座 + 单探针 / 单双金属带） | 全景干净留白 | — |
| **Beat 1 (`t = 4–12s`)** | 暴露第一层动力学或失灵反例 | 随现象自然浮现 1 个局部测量层（如高度场起伏 / 噪声与抖动） | 聚光新因果链路，背景暗化至 `0.2` | — |
| **Beat 2 (`t = 12–28s`)** | 为解决上拍瓶颈引入核心机制 | 新子系统（如断裂悬崖 / 永磁轭 / 瓶颈路由）+ 对应 `hudReveal` KaTeX 活公式或曲线 | 机位推近关键交互点 | 过渡性辅助标注淡出 |
| **Beat 3 (`t = 28–50s`)** | 反事实分叉与极限边界检验 | 克隆对照幽灵轨（`captureGhost`）+ 开放舞台直接操纵（[`kit/manipulator.js`](../kit/manipulator.js)，绑定 `clock` 切幕自动退出） | 双轨对比全景 | — |

---

## 3. T1–T4 时间演化范式与 `kit/` 核心引擎

依托 [`kit/spacetime.js`](../kit/spacetime.js)、[`kit/choreography.js`](../kit/choreography.js) 与 [`kit/timeline-director.js`](../kit/timeline-director.js) 按时间尺度装配：

| 时间范式 | 物理与演进特征 | 核心引擎与机制 | 必备控件与镜头策略 |
|---|---|---|---|
| **T1 · 瞬态与高频周期** | ms–1s 闪烁、翻转、冲击、振荡 | `SpacetimeClock`（`0.1× / 0.25× / 1×` 时间膨胀 + `stepFrame` 单帧步进）或 `PhaseScrubber` + `SimulationTape` | 倍率切换、单帧步进、持久 SVG 图表搓时（[`ChartCard`](../kit/chart-card.js) `onScrub`） |
| **T2 · 单段连续演变** | 数秒–数分，连续 ODE / 队列 / 采样收敛 | `SimulationTape.bake()` + `sampleAt(t)` 连续可逆采样 + `captureGhost()` 幽灵对照 | 全局可拖时间轴、反事实调参留痕、零 GC 连续变形（`updateHeights`/`setCurvature`） |
| **T3 · 长流程多阶段形变** | 25–60 s 多拍因果演进与结构变形 | `SpacetimeClock` + `ActorChoreographer`（或 `TimelineDirector.seekGlobal(t)`）纯函数驱动入场/聚焦/运镜 | 统一底栏 `.timeline-dock`（含分拍书签刻度、全局连续拖动、倍速与实时 `setLang()`） |
| **T4 · 整章复杂演进与渐进装配** | 跨越整章的多节耦合机制 | 4–6 拍递进揭示（基于 `SpacetimeClock` + `ActorChoreographer` + `carries`/`hook`/`relates` 问题链） | 每拍承接上拍底座、按因果增减对象与上下文面板，绝不 `t = 0` 全摊开 |

---

## 4. `window.__simulify` v2.1 确定性契约与全节拍自动化门禁（铁律 4）

所有 v2 实验台通过 `exposeTestHooks(clockOrDirector, { stage, callouts, choreographer, syncAll, falsify, ... })` 自动合成统一契约，打通浏览器端离线导出（[`kit/stage-exporter.js`](../kit/stage-exporter.js)）、命令行影棚导片（[`scripts/export_video.py`](../scripts/export_video.py)）与 [`scripts/verify_stage.py`](../scripts/verify_stage.py) 自动化验收：

- **统一寻址、审计与导出**：
  - `getTimelineInfo()` 返回全局时长与分幕/分拍起止区间；
  - `enterExportMode({ hud, width, height, dpr, muteAudio })` / `exitExportMode()` 暂停内部 `rAF`、解锁相机、切换 `html[data-export]` 并锁定渲染尺寸；
  - `seek(globalTimeSec)` 严格触发 **1× `syncAll` + 1× `choreographer.evaluate` + 1× `stage.renderNow`**，幂等可逆、零双触开销；
  - `getCaptureTargets()`、`getCaptionState()`、`getActiveActorCount(t)`、`getGeometryAudit()`（含三轴世界包围盒与扁平度比例 `bounds`）、`setCardinalView('front' | 'side' | 'top' | 'iso')`、`getFontAudit()` 分别服务于帧合成、字幕条、初始稀疏度、反长方体与三视图比例验收、离线字体审计。
- **URL 深链**：`applyUrlState()` 统一响应 `?stage=&step=&t=&paused&end&thumb=1&export=stage|caption|hud&backend=webgpu|webgl2&lang=` 并置 `window.__ready = true`。
- **v2.1 全节拍真实交互门禁（[`scripts/verify_stage.py`](../scripts/verify_stage.py)）**：
  1. **全节拍采样（消灭 `t ≈ 0.35s` 假绿）**：自动从 `getTimelineInfo()` 采样首幕、中间各幕与末幕中点，在每一拍复测 `hud-overlap`（含 `.beat-caption-pill` 与 3D `HtmlSurface` 投影框 vs HUD 停靠栏遮挡 `> 15%` 即判败）、`guideOverflow`、`horizontalTruncations`、`chart-legibility` 与 `prose-lint`；
  2. **`typography-crispness`** *(v2)*：校验 `getFontAudit()`（`loadedCount >= 2, failedCount === 0`）、物理画布对齐（`canvas.width >= rect.width * dpr - 2`）、全节拍可见 HUD/SVG 文本无 `< 10.5px` 碎字，且活跃 3D `HtmlSurface` 纹理物理像素密度达到 HiDPI 底线（堵死 0.5× 糊字回归）；
  3. **`geometry-diversity` & `three-views`** *(v2 3D)*：校验满载节拍的 `getGeometryAudit()`（`cuboidRatio <= 0.70`、`sculptedMeshes > 0`、`bounds.flatnessRatio >= 0.08`），并自动驱动 `setCardinalView()` 捕获 **正视 / 侧视 / 俯视 / 等轴** 四视图对照 Step 1 工程三视图核验真三维体量与比例；
  4. **`camera-ownership`** *(桌面端 3D)*：真实 Playwright 鼠标拖拽 canvas 旋转镜头，验证相机真实偏转且在播放状态下等待 `>= 400ms` 后未被脚本强行弹回；
  5. **`initial-sparsity` / `temporal-scrub-determinism` / `mandatory-falsify` / `visual-integrity`**：保持全部 4D 核心硬门禁，并支持 `--no-hic` 参数专门核验无 `CanvasDrawElement`（Firefox/Safari）回退清晰度与零报错。

---

## 5. 界面直觉文案去 AI 味规范

- **先具体动作与可见画面，后出现术语**：如「左槽刚命中滑回前端，右槽冷块正沿出槽退回」，不写定义腔废话；
- **短句主动语态**：中文单句尽量 `<= 35–45` 字，禁用「进行了……」「值得注意的是」「本质上」「综上所述」「赋能」等 AI 腔；
- **边界诚实、数字可复算**：界面上的每一个长度条、曲线坐标、代码高亮与代入数字必须 1:1 来自真实 `solve()` 引擎计算，严禁硬编码假轨迹、假进度条或假数值。
