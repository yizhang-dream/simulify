# 题材 7 类谱系、媒介选轨、雕塑配型与信息密度准则

> 门禁 0 定好原生真源后，按本表在门禁 1 锁定媒介轨道、[`kit/geo-sculpt.js`](../kit/geo-sculpt.js) 雕塑选型、T1–T4 时间策略与 7 类开场主动性，并分清“装饰废话”与“高价值精确信息”。

---

## 1. 与兄弟 Skill 的分工边界

| 目标形态 | 推荐 Skill | 核心差异 |
|---|---|---|
| 纯文字解释、多维表格与轻流程图页 | `answer-me-with-html` | Markdown 起稿 CLI 直出轻量一页 HTML |
| 系统架构、时序、数据流、ERD 等二维关系图 | `archify` | 专精可探索 2D 关系图与声明式布局校验 |
| 长篇可检索双语图解在线教材 | `atlas-textbook` | 问题链文本阅读器，适合长文档成书 |
| **3D 雕塑空间交互 + 4D 渐进时间演进 + 反事实实验台** | **`simulify`** | 1:1 锐度可调参、可快进回溯、可舞台直操、可反例证伪的 3D/4D 原理与仿真实验台 |
| 纯娱乐小游戏、氛围玩具、自由生物运动学 | `interactive-3d-lab` | 侧重手感 Juice 与玩具可玩性，不以严格讲透教材定理为约束 |

---

## 2. 完整 7 类原型、主动性与雕塑配型表

| 类别 | 认知障碍 | 为什么选这类呈现 | 开场主动性 & 接管方式 | 推荐雕塑构件与时间搭配 |
|---|---|---|---|---|
| **① 结构解剖与内部透视** | 黑盒内部层级与遮挡看不清 | 透明玻璃外壳 / 剖切平面 / X-Ray 透视 + 热点推近 | **弱→中主动**：稀疏起手后渐进剥离外壳，点击零件 `flyTo`（自动尊重用户相机锁） | `createLathedSolid` / `createGlassVessel` / `createParametricSurface` + `createCutawayPlane` · 轨道 A · T3/T4 |
| **② 规则器件与状态机** | 静止时看不懂转移条件与状态差分 | **严禁干摆！先自动跑完核心因果** | **强主动开场 → 单步冻结接管**：`SpacetimeClock` / `IntroDemo` 自动跑首轮，用户可随时暂停直操 | `createBevelledProfile` / `createGearWheel` / `createSculptedProbe` · 轨道 A/B/C · T1/T3/T4 |
| **③ 连续物理与数学定律** | 不知连续调参时系统与曲线如何跨临界 | 零 GC 变形舞台 + `ChartCard` (`updateXY` + `movingAverageWindow` + `ghost`) + KaTeX `LiveMathsPanel` | **活基准 + 连续直操**：用 [`kit/manipulator.js`](../kit/manipulator.js) 拖柄/涂画（绑定 `clock` 切幕自动退出）实时改写相图与活公式 | `createHeightfieldSurface` / `createDeformableStrip` / `createHelicalCoil` / `createHorseshoeYoke` · 轨道 A/B/C · T1/T2 |
| **④ 工序流程与协议时序** | 严格先后依赖与单步载荷字段易混乱 | 连续 4D 时间轴 + 总览 ↔ 单步字段/递推展开双视图 | **强主动导演演播**：分幕书签直达、暂停、倍速、无漂移向后回拖 | `createTaperedConduit`（流体/报文流带）+ `createArchSpan` · 轨道 B/C · T3/T4 |
| **⑤ 代码/伪代码 ↔ 执行双联** | 看不懂语句怎样改写硬件或数据结构 | 高亮语句挂上 3D `HtmlSurface`（`SURFACE_LAYER`, `>= 2×` HiDPI）并与舞台/表格双向 [`LinkBus`](../kit/link-bus.js) 互锁 | **闭环运行 + 反例分支触发**：高亮正执行行并同步刷新读数，严禁假高亮 | 3D 雕塑部件 + `HtmlSurfaceManager`（非 HIC 自动纯 Canvas2D 3D 回退）· 轨道 B/C · T2/T3 |
| **⑥ 编码规则与仪表操作** | 映射规则与真值对照表读不透 | 双向实时译码 + 查找表当前行高亮 + 512px+ 锐利铭牌 | **有效基准起手 + 双向换算**：修改任意位立即跳亮命中行与 3D 指针 | `createAirfoilVane` / `createBeaconLighthouse` + `createCrispCanvasTexture` · 轨道 A/B · T1 |
| **⑦ 标本辨识与组合探索** | 需多对象比对特征并检验判别规则 | 精密 PBR 陈列台 + 放入测试位即时返回判定 | **弱主动探索台**：悬停发光提示放入测试区，拖拽对象直接测量 | `createLathedSolid` / `createGlassVessel` / `createPleatedBellows` · 轨道 A · T1 |

---

## 3. 六大布局原型与视觉皮肤选型矩阵（[`kit/layout-shell.js`](../kit/layout-shell.js)）

不再把所有题材硬塞进全屏画布 + 四角浮窗：先按内容形态与信息密度在以下 6 套声明式布局与 6 套主题中拍板：

| 布局原型（`data-layout`） | 最适合的题材与认知场景 | 配套控制器 / 视觉特征 |
|---|---|---|
| **`fullbleed-hud`** | 强空间沉浸机械、宏观物理场景、单焦点演示 | 全屏画布 + `<= 25%` 极简 HUD 浮栏 + `ViewCube` / `ScaleBar` |
| **`split-bench`** | 物理 × 数学双联、代码 ↔ 硬件联动、参数较多的实验台 | 左侧完整 3D 舞台，右侧独立可滚动工作区（公式/图表/代码/控件零遮挡，支持 `@container` 自适应） |
| **`ab-compare`** | 反事实对比、算法双策略、实体外壳 vs X-Ray 剖面同框 | 双舞台 `stageA.syncCameraWith(stageB)` 视角互锁，支持并排或 `WipeCompareController` 中线滑帘对比 |
| **`multi-view`** | 机械装配、光学路径、空间几何与工程三视图教学 | 主等轴舞台 + 右侧实时联动正视 / 侧视 / 俯视三视图快照条（`stage.updateMultiViewStrip()`） |
| **`scrolly-stage`** | 深度原理长文、多阶段因果叙事、杂志式图解教程 | 左侧 `15.5px / 58ch` 出版级阅读列 + 右侧 Sticky 3D 舞台，`ScrollyBridge` 滚轮直驱 4D 时钟与剖切/爆炸 |
| **`zen`**（`data-zen="true"`） | 课堂投屏、演讲演示与极简观察模式 | `toggleZenMode()` 一键隐去全部周边栏位，仅保留纯净 3D 舞台与按需返回键 |

**6 套策展皮肤（`data-theme`）**：`paper-ink`（暖纸工程图）/ `dark-studio`（暗棚发光体与协议流）/ `bio-cutaway`（生物解剖柔光）/ `blueprint`（深蓝工程图纸）/ `monochrome-print`（学术期刊黑白印刷 + 单朱红重点）/ `obsidian-gallery`（黑曜石展厅高对比热场与光学）；多系列数据统一使用色盲安全 Okabe-Ito `--cat-1..8`。

---

## 4. 反废话泛滥 × 因地制宜保精度准则

我们裁剪的是**同义重复的引导废话、多层卡片嵌套与廉价积木块**，坚决保留完成解释所必需的高精度载体：
- **① 物理课**：保留精确三维雕塑剖面、X-Ray 通路与错接后果，不强塞充数公式卡；
- **② 代码/协议课**：保留真实字段、3D/2D 活代码行高亮与真值/转移表，确保 3D `HtmlSurface` 不被 HUD 遮挡 `> 15%`；
- **③④ 数学与双联课**：保留 KaTeX 真排版的 `LiveMathsPanel` 活代入式、数值表、`movingAverageWindow` 趋势线与 `ghost` 理论基准线；
- **通用导学卡与清晰字号**：全节拍零内部滚动溢出（`scrollHeight <= clientHeight + 2`），所有可见 HUD 与 SVG 刻度字号 `>= 11.5px`（门禁 `< 10.5px` 直接拦截），深度内容按因果分拍渐进揭示（`hudReveal`）并收入分幕问题链。
