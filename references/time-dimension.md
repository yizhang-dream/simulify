# 时间维度（T1–T4）、渐进揭示法则（True 4D）与整章知识承载规范

> **核心第一定律（True 4D Progressive-Reveal Law）**：时间不是「换皮 PPT」的分页按钮，而是与三维空间等价的第四维因果坐标。**严禁在 `t = 0` 一口气把全部 3D 物件、对照轨、图表、代码框与公式面板全数倾倒上台（spatial-first dumping）**；必须从干净稀疏的 1–2 个核心载体起手，沿 **25–60 s 可连续双向拖动的全局时间轴**，仅在上一拍制造出真实因果冲突或认知问题时，才让新物件、子系统、幽灵对照与上下文面板顺势入场。

---

## 1. 严禁的反模式 vs True 4D 渐进编排

| 维度 | v1 伪 4D 反模式（门禁直接驳回） | Simulify v2 真 4D 标准 |
|---|---|---|
| **开场 `t = 0`** | 首帧铺满 3 套台面 + 4 角 HUD 塞满屏幕，或加载即调用 `director.showEnd()` 定格终态 | **稀疏起手（`<= 2` 个活跃角色，极简顶/底栏）**；从 `t = 0` 起步自然演化或由学习者轻拖展开 |
| **物件与 HUD 登场** | 全部网格在构造函数中 `visible = true`，HUD 面板全静态常驻 | 用 [`ActorChoreographer`](../kit/choreography.js) 的 `enter` / `exit` / `focus` / `hudReveal` 按因果触发点逐个揭示与聚焦暗化 |
| **时间推进机制** | `0.01s` 离散瞬移 + 空 `() => {}` 回调，叠加脱钩的 `performance.now()` 与双 `rAF` | 单一主时钟 [`SpacetimeClock`](../kit/spacetime.js) + [`SimulationTape`](../kit/spacetime.js) 连续可逆采样 `sampleAt(t)`，任意小数秒可无缝暂停/回拖 |
| **反事实对照** | 调参后旧轨迹瞬间消失，全靠记忆回想差异 | `tape.captureGhost()` 在舞台与曲线上叠加半透明**反事实幽灵轨**（旧参数 vs 现参数同框对比） |
| **镜头与运镜** | 切幕时靠 wall-clock `flyTo` 跳切，倒拖时间轴镜头不同步 | `choreographer.cameraBeat(t0, dur, pose)` 作为 `t` 的纯函数插值，倒搓与逐帧导片 100% 确定性复现 |

---

## 2. 必填《分拍角色与揭示台账》（Cast & Reveal Ledger）

开工写场景代码前，必须列出按全局时间 `t` 推进的角色登场台账（覆盖 3D 物件、3D HTML 表面与上下文 HUD 面板）：

| 拍次 / 时间窗 | 因果问题 / 触发冲突 | 新登场角色（`enter` / `hudReveal`） | 聚焦与暗化（`focus`） | 退出 / 变形（`exit` / morph） |
|---|---|---|---|---|
| **Beat 0 (`t = 0s`)** | 建立最简起点与核心对象 | `<= 2` 个核心角色（如空网格 + 单智能体 / 单双金属片） | 全景干净留白 | — |
| **Beat 1 (`t = 4–12s`)** | 暴露第一层动力学或失灵反例 | 随现象自然浮现 1 个局部测量层（如单步备份波 / 噪声与抖动） | 聚光新因果链路，背景暗化至 `0.2` | — |
| **Beat 2 (`t = 12–28s`)** | 为解决上拍瓶颈引入核心机制 | 新子系统（如 4-Q 剖面 / 永磁体 / 瓶颈路由）+ 对应 `hudReveal` 活公式或曲线 | 机位推近关键交互点 | 过渡性辅助标注淡出 |
| **Beat 3 (`t = 28–50s`)** | 反事实分叉与极限边界检验 | 克隆对照幽灵轨（`captureGhost`）+ 开放舞台直接操纵（`kit/manipulator.js`） | 双轨对比全景 | — |

---

## 3. T1–T4 时间演化范式与 `kit/` 核心引擎

依托 [`kit/spacetime.js`](../kit/spacetime.js)、[`kit/choreography.js`](../kit/choreography.js) 与 [`kit/timeline-director.js`](../kit/timeline-director.js) 按时间尺度装配：

| 时间范式 | 物理与演进特征 | 核心引擎与机制 | 必备控件与镜头策略 |
|---|---|---|---|
| **T1 · 瞬态与高频周期** | ms–1s 闪烁、翻转、冲击、振荡 | `SpacetimeClock`（`0.1× / 0.25× / 1×` 时间膨胀 + `stepFrame` 单帧步进）或 `PhaseScrubber` + `SimulationTape` | 倍率切换、单帧步进、图表点击搓时（[`ChartCard`](../kit/chart-card.js) `onScrub`） |
| **T2 · 单段连续演变** | 数秒–数分，连续 ODE / 队列 / 采样收敛 | `SimulationTape.bake()` + `sampleAt(t)` 连续可逆采样 + `captureGhost()` 幽灵对照 | 全局可拖时间轴、反事实调参留痕、3D 相空间-时间螺旋 |
| **T3 · 长流程多阶段形变** | 25–60 s 多拍因果演进与结构变形 | `SpacetimeClock` + `ActorChoreographer`（或 `TimelineDirector.seekGlobal(t)`）纯函数驱动入场/聚焦/运镜 | 统一底栏 `.timeline-dock`（含分拍书签刻度、全局连续拖动、倍速） |
| **T4 · 整章复杂演进与渐进装配** | 跨越整章的多节耦合机制 | 4–6 拍递进揭示（基于 `SpacetimeClock` + `ActorChoreographer` + `carries`/`hook`/`relates` 问题链） | 每拍承接上拍底座、按因果增减对象与上下文面板，绝不 `t = 0` 全摊开 |

---

## 4. `window.__simulify` v2 确定性契约与 4D 自动化门禁

所有 v2 实验台通过 `exposeTestHooks(clockOrDirector, { stage, callouts, choreographer, syncAll, falsify, ... })` 自动合成统一契约，打通浏览器端离线导出（`kit/stage-exporter.js`）、命令行影棚导片（`scripts/export_video.py`）与 [`scripts/verify_stage.py`](../scripts/verify_stage.py) 自动化验收：

- **统一寻址与导出**：
  - `getTimelineInfo()` 返回全局时长与分幕/分拍起止区间；
  - `enterExportMode({ hud, width, height, dpr, muteAudio })` / `exitExportMode()` 暂停内部 `rAF`、切换 `html[data-export]` 并锁定渲染尺寸；
  - `seek(globalTimeSec)` 幂等、可逆地同步时钟、`ActorChoreographer.evaluate(t)`、相机 `stage.setCameraImmediate(pose)`、`syncAll()`、`CalloutLayer.update()` 与 `stage.renderNow()`；
  - `getCaptureTargets()`、`getCaptionState()`、`getActiveActorCount(t)` 分别服务于 HTML-in-Canvas / Canvas2D 帧合成、字幕条与初始稀疏度校验。
- **URL 深链**：`applyUrlState()` 统一响应 `?stage=&step=&t=&paused&end&thumb=1&export=stage|caption|hud&backend=webgpu|webgl2&lang=` 并置 `window.__ready = true`。
- **v2 4D 门禁（`verify_stage.py`）**：
  1. `initial-sparsity`：校验加载时停在起点附近（禁止默认 `showEnd()`），且 `getActiveActorCount(0) < getActiveActorCount(T)`；
  2. `temporal-scrub-determinism`：实测 `seek(0.1T) → seek(0.5T) → seek(0.9T) → seek(0.5T)` 存在真实画面演进且倒拖精确复现；
  3. `mandatory-falsify`：强制暴露可执行反例断言 `falsify()` 且 `passed === true`；
  4. `visual-integrity`：校验画布非空白、代码/导学卡零横向截断（`scrollWidth <= clientWidth + 2`）、零控制台与 GPU 错误。

---

## 5. 界面直觉文案去 AI 味规范

- **先具体动作与可见画面，后出现术语**：如「左槽刚命中滑回前端，右槽冷块正沿出槽退回」，不写定义腔废话；
- **短句主动语态**：中文单句尽量 `<= 35–45` 字，禁用「进行了……」「值得注意的是」「本质上」「综上所述」「赋能」等 AI 腔；
- **边界诚实、数字可复算**：界面上的每一个长度条、曲线坐标与代入数字必须 1:1 来自真实引擎计算，严禁硬编码假进度条或假数值。
