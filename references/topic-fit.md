# Simulify v3.1 题材与选型

从 [Grounding Brief](grounding-discovery.md) 选出核心认知障碍，再决定交互、Profile、布局和皮肤。需要可操纵的立体遮挡、空间结构或连续演化时使用 Simulify。纯二维关系图用 `archify`，短页图文用 `answer-me-with-html`，章节阅读用 `atlas-textbook`，视频制片用 `onetake`。

## 七类题材

| 题材 | Profile | 开场与可操作证据 |
|---|---|---|
| 结构解剖与内部透视 | `mechanical-3d` | 从可识别的实体起手，揭开遮挡。用车削、透明容器或参数曲面配实心剖面，建模前锁尺寸与正／侧／俯蓝图。T3/T4 |
| 规则器件与状态机 | `sandbox-direct`，结构本身关键时用 `mechanical-3d` | 从可切换的有效基准起手，观察输入何时触发状态变化。用倒角型材、齿轮或探针呈现关键器件。T1/T3 |
| 连续物理与数学定律 | `field-math` 或 `sandbox-direct` | 拖柄或涂画跨过临界点，同步观察高度场、等值线、弹性带、相图与代入式。T1/T2 |
| 工序流程与协议时序 | 实体空间工序用 `mechanical-3d`，可操纵的空间化仪器用 `sandbox-direct` | 分拍暂停并回拖。流带表达运动方向，字段读数保留载荷与依赖次序。纯时序关系交给 `archify`。T3/T4 |
| 代码与执行双联 | `field-math` 或 `sandbox-direct` | 在 `split-bench` 中让代码高亮与舞台读数共用模型分支和状态，用 `LinkBus` 互锁并可触发反例。T2/T3 |
| 编码规则与仪表 | `sandbox-direct` | 修改任意位即可核对命中行与表针方向。用清晰纹理显示仪表刻度。T1 |
| 标本辨识与组合 | `sandbox-direct` 或 `mechanical-3d` | 悬停提示可检部件，拖到测试区直接测量。复用车削件、玻璃容器或波纹管工厂。T1 |

机械精密形体采用 [三视图与同构准则](fidelity-isomorphism.md)。另两档锁定坐标范围、轴单位和自由度，允许开场直接操作。验收强度见 [门禁矩阵](engine-contract.md)。

## 三种布局与六套皮肤

| 布局 | 选型依据 |
|---|---|
| `fullbleed-hud` | 单焦点物件或大尺度场景，画布优先，HUD 保持轻量，按需放视角与比例尺。 |
| `split-bench` | 控制项、公式、代码或图表需要独立阅读栏，面板随所在栏宽调整。 |
| `ab-compare` | 基准与故障工况、两策略或实体与剖面需同视角比较，可并排或用滑帘。 |

任意布局可通过 `toggleZenMode` 暂时收起周边面板。皮肤按主题选择暖纸 `paper-ink`、暗棚 `dark-studio`、冷白剖面 `bio-cutaway`、工程图纸 `blueprint`、学术印刷 `monochrome-print` 或暗绒展厅 `obsidian-gallery`。[design-system.md](design-system.md)

物理题优先保留真实剖面和故障后果，逻辑题保留字段、真值／转移表与实际执行高亮，数学题保留带单位的实时公式和必要的数值、趋势及幽灵基准。按题材选最少的上下文面板，让状态变化成为读者的观察线索。多拍叙事按因果增减信息。[time-dimension.md](time-dimension.md)
