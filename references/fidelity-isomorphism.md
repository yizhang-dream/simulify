# Simulify v3.1 原生真源、同构与雕塑

将读者必须理解的结构、状态转移与方程逐项映射到可见、可操纵、可复算的证据。Step 1 可用一行记录每个关键对象或定律、遗漏会带来的误解、舞台上的载体及可触发的故障工况。

## 四类原生真源

| 真源 | Profile 与主要载体 | 辅助层 |
|---|---|---|
| ① 物理与空间 | `mechanical-3d` 呈现结构与遮挡，`sandbox-direct` 呈现受操纵的运动副 | 精确曲面、实心剖切、X-Ray、铭牌和错接后果，按需加解释公式 |
| ② 逻辑、代码与协议 | `sandbox-direct` 用于可操纵的仪表或硬件，连续量主导时选 `field-math` | 真实字段、转移表和随模型执行的代码高亮，用 `LinkBus` 互锁。纯关系图交给 `archify` |
| ③ 数学、优化与算法 | `field-math` 呈现真实坐标、参数曲面、高度场或不连续边界 | KaTeX 活公式、图表基准和单步冻结，锁定量纲、空间范围和核心式 |
| ④ 物理与数学双真源 | `mechanical-3d` 或 `sandbox-direct` 呈现形变、行程与临界开关 | 同一 `solve()` 展示物理量如何映射到相图、曲线和活公式 |

## 尺寸、几何与剖面

`mechanical-3d` 在建模前锁定 Front / Side / Top 正交蓝图和共享 `DIMENSIONS`，覆盖长宽高、标高、壁厚、间隙及运动包络。优先使用参数表和程序化正交图。用真实轮廓、曲率和连接关系塑形，盒体只用于确为盒状的部件。核对实物比例，再查自动几何门禁。`field-math` 和 `sandbox-direct` 锁定坐标范围、量纲与自由度，几何类门禁作为遥测。[engine-contract.md](engine-contract.md)

雕塑工厂使用受光 PBR 材质，写入 `userData.simulifyGeoKind` 供审计。跨章节从同一工厂实例化部件，保持比例、材质语义、可操作提示和标注一致。[kit/geo-sculpt.js](../kit/geo-sculpt.js) · [primitives/](../primitives/)

### 五大跨学科泛用构造族
1. **车削精密器物族（`'lathe'`）**：`createLathedSolid`、`createGlassVessel`（`ampoule` 安瓿 / `flask` 烧瓶 / `dome` 光学钟罩 / `lens` 透镜 + 黄铜领圈与 `setFillLevel()`）、`createSculptedProbe`（车削黄铜底座 + 陶瓷机身 + 发光光学冠 + 翼片方向指针）、`createBeaconLighthouse`（阶梯底座 + 菲涅尔棱镜环 + 光学灯室）。
2. **异形倒角型材族（`'extrude'`）**：`createBevelledProfile`（任意 2D 轮廓与镂空孔位倒角拉伸）、`createGearWheel`（渐开线倾角齿轮 + 减重孔 + 车削轮毂）、`createHorseshoeYoke`（U 型倒角马蹄磁轭 + N/S 极靴）、`createArchSpan`（抛物/圆弧/尖拱桥架与拱腹镂空）、`createAirfoilVane`（NACA 4-digit 空气动力翼型）。
3. **零 GC 连续地形、断裂悬崖、参数曲面与弯曲弹性带（`'heightfield' | 'chasm' | 'parametric' | 'strip'`）**：
   - `createHeightfieldSurface`：带独立法线实体裙边的连续曲面，原位 `updateHeights(heightFn, colorFn)` + `sampleHeight(x, z)`；
   - `createFracturedChasm`：确定性岩层阶梯 + 锯齿断崖缘 + 分级岩层色 + 可选熔岩缝 + 零 GC `setCarveProgress(u)`；
   - `createParametricSurface`：任意 $(u, v) \mapsto (x, y, z)$ 参数化曲面与原位 `updateSurface()`；
   - `createDeformableStrip`：实心等弧长弹性梁 / 铜钢双金属层压带，零 GC `setCurvature(k)` 返回精确 `{ tipPos, tipAngle, tipNormal }`。
4. **真 3D 螺旋线圈、变径管路与波纹管（`'helix' | 'conduit' | 'bellows'`）**：`createHelicalCoil`（真螺旋丝/弹簧/电感，支持 `setGlow` / `setCompression`）、`createTaperedConduit`（无扭转平行输运标架变径管/光束/策略流带 + 端盖 + 顶点色渐变）、`createPleatedBellows`（原位 `setExtension(factor)` 保持法兰厚度）。
5. **微纹理 PBR 与 Fresnel X-Ray 材质工厂**：`createSculptMaterial(preset, overrides)`（10 套材质自动挂接缓存式程序拉丝/磨砂/阳极氧化微法线与粗糙度贴图 `createProceduralSurfaceMaps`，兼容 6 套主题光棚）+ `createXRayMaterial()`（菲涅尔边缘发亮半透明外壳，自动建议挂 `GLASS_LAYER = 3` 免阻断内部墨线）；闭合剖切统一使用 `stage.createCutawayCap(target, plane)` 渲染 45° 实心工程剖面线。

**科学动态场与工程标注原语（[`kit/field-viz.js`](../kit/field-viz.js)）**：感知均匀色带（`viridis`/`plasma`/`magma`/`coolwarm`/`thermal`/`cividis`）+ `renderColorbar()`、定向脉冲流带 `createFlowConduit`、零 GC 3D 矢量场 `createVectorField`、可逆 4D 粒子群 `createDeterministicSwarm`、频闪轨迹丝带 `createMotionTrail`、3D 尺寸/力矢/夹角标注（自动明暗反差精灵标牌）与带独立哑光裙边的等值线标量高度场 `createContourField`。

### 跨学科造型映射配方表

| 学科领域 | 典型机制与对象 | 推荐 `kit/geo-sculpt.js` 组合 |
|---|---|---|
| **力学 / 机械 / 热力学** | 齿轮传动、弹簧振子、双金属恒温器、气动执行器、桁架拱桥 | `createGearWheel` + `createHelicalCoil` + `createDeformableStrip({ bimetallic: true })` + `createPleatedBellows` + `createArchSpan` |
| **光学 / 热学 / 化学** | 棱镜聚焦、发热丝辐射、反应釜液位、透镜成像、光纤传输 | `createGlassVessel`（`ampoule`/`flask`/`dome`/`lens`）+ `createBeaconLighthouse`（菲涅尔环）+ `createHelicalCoil`（发光丝）+ `createTaperedConduit` |
| **电磁 / 数学 / 优化 / RL** | 磁场磁轭、损失/价值势能面、悬崖不连续边界、策略/梯度流、智能体探针 | `createHorseshoeYoke` + `createHeightfieldSurface` + `createFracturedChasm` + `createSculptedProbe` + `createTaperedConduit` |
| **生物 / 解剖 / 流体** | 磷脂双分子膜、血管分支、腔室剖面、呼吸膈膜泵 | `createParametricSurface` + `createLathedSolid`（配合 `stage.createCutawayPlane`）+ `createTaperedConduit` + `createPleatedBellows` |
| **电子 / 气动 / 协议硬件** | 翼型导流片、异形板卡支架、总线报文流、探针测点 | `createAirfoilVane` + `createBevelledProfile` + `createTaperedConduit` + `createSculptedProbe` |

## 比喻与故障工况

将生活比喻标为引子，并逐量说明适用的定量对应与边界。价值函数应保留状态与动作分支，对同一随机种子冻结同一步来比较策略的自举目标。在函数或参数空间展示逼近误差，协议依赖用可读的序号和字段说明。数学变量、单位与上下标用 KaTeX 排版。[design-system.md](design-system.md)

选 2–3 个来自典型误区的故障工况 / 极限实验，写清输入变动、预期临界切换或失效和界面证据。用结构化 `falsifyCases` 重算同一时刻的基准与变异状态，以独立不变量判据检查失效边界，让舞台、图表与公式都能显示同一次极限实验。[kit/model-core.js](../kit/model-core.js)
