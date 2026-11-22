# 理论忠实度、1:1 同构、反长方体雕塑法则与按需装配准则

> **核心原则：「1 条不变底线（原生真源 1:1 讲清楚）+ 4 类原生真源因地制宜装配 + 反长方体工业级雕塑造型（绝不堆乐高方块）」。**  
> 交互不是为了“简化成大白话哄人开心”，而是把真实世界中不可见、易混淆、随时间动态耦合的结构与规律，以精准的物理形体、真实数学排版和单一 `solve()` 引擎放进可操纵的演进模型里。

---

## 1. 「让人感觉看懂」vs「真正讲清楚」

| 维度 | 降维科普 / 粗糙乐高（严禁） | 1:1 理论同构与精密仪器（目标） |
|---|---|---|
| **概念处理** | 用童话/玩具隐喻替代机制（如用发光滚筒代替优化拟合、用盲目高低方块代替多维价值展开） | 理论有几层对象与约束，舞台就如实构建几层精确载体 |
| **3D 造型标准** | 整场全靠 `BoxGeometry` / `RoundedBoxGeometry` / `PlaneGeometry` + 无光 `MeshBasicMaterial` 拼乐高积木 | 用 [`kit/geo-sculpt.js`](../kit/geo-sculpt.js) 5 大构造族 + 受光 PBR 材质打造真实物理/数学器物，`getGeometryAudit()` 满足 `cuboidRatio <= 0.70` 且 `sculptedMeshes > 0` |
| **载体选择** | 一刀切强套 3D 小模型，或强给纯实物硬挂满屏方程 | **因地制宜**：实物按实物模拟（车削/倒角剖面/X-Ray/弹性形变），数学按形式化界面 + 连续曲面/势能场双联 |
| **数学排版** | 手写破损 Unicode 下标（`Gₜ:ₜ₊₄`, `γᵏ`）或纯等宽代码字塞公式与中文 | 用 [`kit/live-maths.js`](../kit/live-maths.js) 的 KaTeX AST（`mathVar`/`mathSub`/`mathSup`/`mathFrac`/`mathOp`/`mathSqrt`/`mathMatrix`/`mathCases`/`mathAccent`/`mathFence`/`mathAlign`）真实排版，变量自动真斜体、单位与多字母算符保持正体 |
| **反例检验** | 只播正面成功动画，回避故障、短路与发散状态 | 预设并可触发**理论反例**（错接短路、临界无回差抖动、贴崖跌落与目标发散），并由 `window.__simulify.falsify()` 自动证伪 |
| **单一真相源** | 舞台动画、假进度条与文字数值各算各的 | **单一 `solve()` 引擎**原子刷新 3D 变形、曲线、代码高亮与活公式，严禁硬编码假轨迹与假高亮 |

---

## 2. 反长方体雕塑与三视图比例法则（铁律 3 · [`kit/geo-sculpt.js`](../kit/geo-sculpt.js)）

**严禁凭单张 2D 透视/等轴概念图盲猜纵深与厚薄，更严禁把整座 3D 实验台退化成薄板托盘或 `RoundedBoxGeometry` / `BoxGeometry` / `PlaneGeometry` 堆出来的积木块！**  
- **建模前必先锁三视图与 `DIMENSIONS` 常量表**：所有 3D 场景必须先基于**正视图（Front）/ 侧视图（Side）/ 俯视图（Top）标准工程三视图**确定各主构件的长宽高 `L × W × H`、垂向标高、壁厚间隙与 4D 运动包络，再把尺寸统一写进常量表驱动代码建模，保证在正/侧/俯/自由环绕任意视角下均体量自洽（`stage.getGeometryAudit().bounds.flatnessRatio >= 0.08`）。
- [`kit/geo-sculpt.js`](../kit/geo-sculpt.js) 零外部依赖，兼容 WebGPU 与 WebGL2，所有实体自动开启投影/接影、使用受光 PBR 材质，并自动写入 `userData.simulifyGeoKind` 供 `stage.getGeometryAudit()` 与 `verify_stage.py` `geometry-diversity` / `three-views` 门禁验收：

### 五大跨学科泛用构造族
1. **车削精密器物族（`'lathe'`）**：`createLathedSolid`、`createGlassVessel`（`ampoule` 安瓿 / `flask` 烧瓶 / `dome` 光学钟罩 / `lens` 透镜 + 黄铜领圈与 `setFillLevel()`）、`createSculptedProbe`（车削黄铜底座 + 陶瓷机身 + 发光光学冠 + 翼片方向指针）、`createBeaconLighthouse`（阶梯底座 + 菲涅尔棱镜环 + 光学灯室）。
2. **异形倒角型材族（`'extrude'`）**：`createBevelledProfile`（任意 2D 轮廓与镂空孔位倒角拉伸）、`createGearWheel`（渐开线倾角齿轮 + 减重孔 + 车削轮毂）、`createHorseshoeYoke`（U 型倒角马蹄磁轭 + N/S 极靴）、`createArchSpan`（抛物/圆弧/尖拱桥架与拱腹镂空）、`createAirfoilVane`（NACA 4-digit 空气动力翼型）。
3. **零 GC 连续地形、断裂悬崖、参数曲面与弯曲弹性带（`'heightfield' | 'chasm' | 'parametric' | 'strip'`）**：
   - `createHeightfieldSurface`：带独立法线实体裙边的连续曲面，原位 `updateHeights(heightFn, colorFn)` + `sampleHeight(x, z)`；
   - `createFracturedChasm`：确定性岩层阶梯 + 锯齿断崖缘 + 分级岩层色 + 可选熔岩缝 + 零 GC `setCarveProgress(u)`；
   - `createParametricSurface`：任意 $(u, v) \mapsto (x, y, z)$ 参数化曲面与原位 `updateSurface()`；
   - `createDeformableStrip`：实心等弧长弹性梁 / 铜钢双金属层压带，零 GC `setCurvature(k)` 返回精确 `{ tipPos, tipAngle, tipNormal }`。
4. **真 3D 螺旋线圈、变径管路与波纹管（`'helix' | 'conduit' | 'bellows'`）**：`createHelicalCoil`（真螺旋丝/弹簧/电感，支持 `setGlow` / `setCompression`）、`createTaperedConduit`（无扭转平行输运标架变径管/光束/策略流带 + 端盖 + 顶点色渐变）、`createPleatedBellows`（原位 `setExtension(factor)` 保持法兰厚度）。
5. **微纹理 PBR 与 Fresnel X-Ray 材质工厂**：`createSculptMaterial(preset, overrides)`（10 套材质自动挂接缓存式程序拉丝/磨砂/阳极氧化微法线与粗糙度贴图 `createProceduralSurfaceMaps`，兼容 6 套主题光棚）+ `createXRayMaterial()`（菲涅尔边缘发亮半透明外壳，自动建议挂 `GLASS_LAYER = 3` 免阻断内部墨线）；闭合剖切统一使用 `stage.createCutawayCap(target, plane)` 渲染 45° 实心工程剖面线（告别空心纸壳）。
6. **科学动态场与工程标注原语（[`kit/field-viz.js`](../kit/field-viz.js)）**：感知均匀色带（`viridis`/`plasma`/`magma`/`coolwarm`/`thermal`/`cividis`）+ `renderColorbar()`、定向脉冲流带 `createFlowConduit`、零 GC 3D 矢量场 `createVectorField`、可逆 4D 粒子群 `createDeterministicSwarm`、频闪轨迹丝带 `createMotionTrail`、3D 尺寸/力矢/夹角标注（自动明暗反差精灵标牌）与带独立哑光裙边的等值线标量高度场 `createContourField`。

### 跨学科造型映射配方表

| 学科领域 | 典型机制与对象 | 推荐 `kit/geo-sculpt.js` 组合（替代粗糙方块） |
|---|---|---|
| **力学 / 机械 / 热力学** | 齿轮传动、弹簧振子、双金属恒温器、气动执行器、桁架拱桥 | `createGearWheel` + `createHelicalCoil` + `createDeformableStrip({ bimetallic: true })` + `createPleatedBellows` + `createArchSpan` |
| **光学 / 热学 / 化学** | 棱镜聚焦、发热丝辐射、反应釜液位、透镜成像、光纤传输 | `createGlassVessel`（`ampoule`/`flask`/`dome`/`lens`）+ `createBeaconLighthouse`（菲涅尔环）+ `createHelicalCoil`（发光丝）+ `createTaperedConduit` |
| **电磁 / 数学 / 优化 / RL** | 磁场磁轭、损失/价值势能面、悬崖不连续边界、策略/梯度流、智能体探针 | `createHorseshoeYoke` + `createHeightfieldSurface` + `createFracturedChasm` + `createSculptedProbe` + `createTaperedConduit` |
| **生物 / 解剖 / 流体** | 磷脂双分子膜、血管分支、腔室剖面、呼吸膈膜泵 | `createParametricSurface` + `createLathedSolid`（配合 `stage.createCutawayPlane`）+ `createTaperedConduit` + `createPleatedBellows` |
| **电子 / 气动 / 协议硬件** | 翼型导流片、异形板卡支架、总线报文流、探针测点 | `createAirfoilVane` + `createBevelledProfile` + `createTaperedConduit` + `createSculptedProbe` |

---

## 3. 四类「原生真源」与模块按需装配表

| 原生真源类型 | 代表题材 | 视觉载体选择 | 辅助层装配方案 | 门禁 1 概念稿 + 三视图画什么 |
|---|---|---|---|---|
| **① 物理与空间真源** | 机械齿轮、发动机、面包板、器官剖面、户外搭建工序 | **轨道 A · 3D 雕塑实物模拟**（结构、剖面、X-Ray、装配错位反例） | **默认不挂 `LiveMathsPanel`**；靠精确雕塑部件、512px+ 丝印铭牌、热点推近与后果表现讲清 | **结构概念稿 + 正/侧/俯标准工程三视图**（含剖切面位置与 `L:W:H` 尺寸标尺） |
| **② 逻辑、代码与协议真源** | 网络协议、微控制器、指令流、缓存体系、逻辑门 | 协议走 **轨道 B**；软硬或空间规则结合走 **轨道 C**（真三维硬件/节点 ↔ 3D `HtmlSurface` 代码/真值表） | 装配**逐字段展开 / 代码行高亮 / 状态对照表**，用 [`LinkBus`](../kit/link-bus.js) 互锁 | **架构概念稿 + 硬件结构正/侧/俯三视图**与代码/协议通道对齐表 |
| **③ 数学、优化与算法真源** | 强化学习、概率分布、梯度优化、数值分析、线性代数 | **轨道 B/C · 精密数学工作台 ↔ 高度场/参数曲面** | **按因果揭示 `LiveMathsPanel`（KaTeX 真排版）** + `ChartCard`（含 `ghost` 与移动平均）+ 单步冻结解剖 | **数学真源概念稿 + 势能曲面/三维空间坐标的正/侧/俯三视图**（锁死高程尺度与动态包络） |
| **④ 物理 × 数学双真源** | 施密特触发器、恒温滞回、RC 充放电、PID 控制、运动学 | **轨道 C · 沿抽象阶梯双联**：雕塑 3D 物理实验台 ↔ 原理图 / 相图曲线 | **`LiveMathsPanel` 折叠按需展开**，与 3D 变形器物共用同一 `solve()` | **双联概念稿 + 物理装置正/侧/俯三视图**（标明形变位移行程与相图映射） |

---

## 4. 同一物体对应同一显示：领域图元复用规范（[`primitives/`](../primitives/)）

当制作跨越多个章节的课程或公开学习平台时，禁止每一课都重新随手捏一套长得不一样的部件：
- 在系列项目内建立 [`primitives/`](../primitives/)，内部基于 `kit/geo-sculpt.js` 与三视图锁定的 `DIMENSIONS` 常量表封装领域部件（如电路 `Resistor`/`Probe`、机械 `Valve`/`Piston`）；
- **核心约束**：同一个物理件或数学符号从第 1 课出现到最后一课，必须从同一个图元工厂实例化，保持**一致的几何比例、PBR 材质语义、可交互光环与标注规范**。

---

## 5. 生活比喻双准入条件 & 失真隐喻黑名单

### 5.1 合法比喻的唯一双准入条件
1. **定位诚实**：明确设为“前导直觉引子”并与真实机制本体或后续实验紧密衔接，绝不冒充机制终点。
2. **变量 1:1 定量对应**：比喻里的每个物理量都能与目标变量和公式严格对号（如水压高度 ↔ 电压 $V$、进水管径 ↔ 电阻 $R$、储水缸截面积 ↔ 电容 $C$）。

### 5.2 失真隐喻黑名单（门禁 0 审查淘汰）
- 禁止用无内部结构的盲目高低方块代表动态规划价值函数（应以连续高度场 + 动作分支 $q(s,a)$ 展开与折现对比）；
- 禁止用彼此毫无关系的两条孤立赛道小车解释 On-policy vs Off-policy（应共享同一随机种子、冻结同一步分叉对比自举目标 $a_{t+1}$ vs $\max_{a'}$）；
- 禁止用纯科幻颗粒或无关容器遮蔽函数逼近本质（应直接在函数空间坐标系或参数曲面呈现拟合漂移与目标靶心追踪）；
- 禁止用小人搬箱子取代可精确读取状态字、序号与载荷字段的协议时序。

---

## 6. 门禁 0 必填审计模板

### 6.1 《原生真源 → 可视/交互 1:1 同构清单》

| 原生细节项（结构 / 字段 / 公式） | 省略会导致什么误解 | 画布精确雕塑载体（`geo-sculpt` / 坐标系） | 按需装配辅助层（剖面 / 代码 / KaTeX 活公式 / 无） | 比喻与失真审查 |
|---|---|---|---|---|
| （写明关键构造、字段或准确数学项） | （写明漏掉它学生会错在哪） | （主舞台上的精确雕塑几何或坐标系） | （按 ①/②/③/④ 真源选装） | （确认无偷换概念与假数值） |

### 6.2 反例验证断言（Falsification Test，门禁 5 实机必测）
写出 **2–3 条可复现检验的反例断言**（`[触发操作] -> [应精确出现的临界切换/失效现象] -> [界面可观测证据]`），并在 `window.__simulify.falsify()` 中可执行落地。
