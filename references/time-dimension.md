# Simulify v3.1 时间维度与交互节奏

连续演化使用一个 `SpacetimeClock`。将演进、变形、图表和公式绑定到同一时刻的 `solve(params, t)`，避免另起播放循环和依赖墙钟。即时直操题材可从完整的核心仪器或坐标系开场。多拍机制从关键对象起手，在观察到上一拍的问题时引入下一拍的结构、测量或故障工况。[kit/spacetime.js](../kit/spacetime.js)

## T1–T4 时间范式

| 范式 | 现象 | 控制与表达 |
|---|---|---|
| T1 · 瞬态与高频周期 | 毫秒到秒的翻转、冲击、振荡 | `SpacetimeClock` 或 `PhaseScrubber`，用慢放、`stepFrame` 和图表 `onScrub` 暴露临界事件。 |
| T2 · 单段连续演变 | ODE、连续物理形变、采样收敛 | `SimulationTape.bake()` 与 `sampleAt(t)`，可逆时间条和变参前的 `captureGhost()`，原位更新高度场或曲率。 |
| T3 · 多阶段形变 | 结构切换和因果流程 | `ActorChoreographer` 按全局 `t` 计算入退场、聚焦和镜头，时间栏支持跳拍、拖动与倍速。 |
| T4 · 多节耦合机制 | 整章渐进装配 | 每拍继承前一拍的对象和问题，由新冲突触发下一次揭示。拍数和时长跟随机制。 |

`SimulationTape.sampleAt(t)` 在均匀时间网格用 O(1) 直接定位，非均匀时间戳用 O(log N) 二分查找，再对相邻状态插值。通过 `captureGhost()` 留下不可变基准，让 3D 舞台与图表在同一时刻做基准对照。[kit/spacetime.js](../kit/spacetime.js) · [kit/chart-card.js](../kit/chart-card.js)

## 多拍叙事的揭示台账

仅多拍叙事在设计阶段写简短的 Beat & Reveal Ledger。记录时间窗、可观察问题、新入场物件、聚焦对象和离场条件。短瞬态与即时直操按需保留播放控件。

| 时间窗（示例） | 因果问题 | 入场／聚焦／退出 |
|---|---|---|
| 起始 | 哪个对象会变？ | 先留底座和一个核心对象。 |
| 观测 | 什么条件下开始失灵？ | 用一项读数或剖切显示故障位置。 |
| 解释 | 新部件怎样改变结果？ | 近看关键运动副，按需揭示相图或公式，收起临时引线。 |
| 试验 | 怎样复现或突破边界？ | 开放直操，叠加基准轨让读者自己复现。 |

入退场用 `enter`、`exit`、`hudReveal`，拆解或剖切用 `explodeGroup`、`clipSweep`，聚焦优先尝试 `focus` 的 `matte` 或 `wireframe`，避免透明层交叠影响读图。镜头轨通过 `stage.setCameraFromScript(pose)` 尊重用户相机锁。切幕时用 `bindClock` 释放拖拽。实现与门禁见 [引擎契约](engine-contract.md)。[kit/choreography.js](../kit/choreography.js) · [kit/manipulator.js](../kit/manipulator.js)

## 界面文案

先写能看到的动作，再给术语。例如「左槽刚命中滑回前端，右槽冷块正沿出槽退回」。用短句和主动语态，保持数字、代码高亮和曲线可用同一模型复算。
