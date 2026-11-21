<h1 align="center">Simulify</h1>

<p align="center">
  <b>3D / 4D 交互原理拆解与仿真实验台技能 &nbsp;|&nbsp; 1:1 原生真源 &nbsp;|&nbsp; 纯离线网页与桌面软件通用</b>
</p>

<p align="center">
  一套开源 Agent Skill 与零构建原生 ESM 工具套件：针对纯文本、静态架构图和可读教材讲不透的三维空间构造、四维时间演进与反事实因果，用可调参、可快进回溯、可亲手证伪的高精度交互实验台与 3D 剖面一次讲清楚。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="https://simulify.xn--ltr42g543b.cn/">在线展台</a> · <a href="SKILL.md">Agent Skill 规范</a> · <a href="INSTALL.md">安装指南</a> · <a href="examples/index.html">本地示范展台</a> · <a href="#快速开始">快速开始</a>
</p>

---

## 为什么做 Simulify？（与兄弟插件的水平对位）

| 表达方式 | 原生媒介 | 擅长解决的问题 | `simulify` 接棒切入的地方 |
| :--- | :--- | :--- | :--- |
| 纯文字回复 | 段落列表 | 快速结论 | 一遇到空间遮挡、时间差、正负反馈与多因子耦合就失语 |
| `answer-me-with-html` | 2D 图文 + 表格 | 极低 token 把多段道理做成一页纸 | 页面偏静态，学习者无法拧动参数亲手打破平衡看因果 |
| `archify` | 校验级 2D SVG 图谱 | 系统架构、时序流、ERD、状态生命周期图 | 专精二维结构连接（可对照它的 `cache-miss` 时序图与我们的 `cache-bench`） |
| `atlas-textbook` | 在线问题链交互书 | `carries`/`hook`/`relates` 章节编织与干净直觉句 | 我们直接继承其**问题链承上启下**与**去 AI 味直觉文风**到可操作实验台 |
| **`simulify`** | **3D 空间 + 4D 时间 + 形式化双联** | **单一 `solve()` 驱动的活实验与整章仿真拆解** | 空间剖面、确定性跳幕回溯、活公式代入、以及可直接证伪的反例现场 |

---

## 核心设计思想

1. **一条不变底线：1:1 原生真源（不靠童话比喻哄人“看似看懂”）**：
   - 动笔前先做「原生真源审计（① 物理空间 / ② 代码协议 / ③ 数学算法 / ④ 物理×数学双联）」：实物按真实结构、错接后果模拟，算法数学直接把坐标、分解树、实时活公式代入与理论 `ghost` 基线焊接在同一真源上，绝不搞僵化一刀切。
2. **补齐 4D 时间维度（`T1–T4`）与整章知识承载**：
   - `PhaseScrubber` 负责 **T1 瞬态慢放搓相位** 与 **T2 连续慢变直达稳态**；
   - `TimelineDirector` 负责 **T3 长流程确定性重建快进/零漂移向后回溯** 与 **T4 整章 3–6 幕渐进累加实验台**（拒绝物体稀少的单帧玩具）。
3. **问题链衔接（`carries` / `hook` / `relates`）**：
   - 借鉴 `atlas-textbook`，让第 $k$ 幕接住上一幕暴露的冲突（`carries`），并以本幕末尾的瓶颈问题（`hook`）把学习者自然推进下一幕。
4. **同时适配静态开站与离线软件发行**：
   - 全套件 **100% 离线零 CDN**：Layer 1 `kit/` 聚焦单课渲染与交互；Layer 2 `shell/` 按需提供 **多国语言 `i18n`**、**`Ctrl+K` 全局命令面板**、**可插拔存储适配器（Web `localStorage` / Electron·Tauri 文件桥）+ 进度条**，外加 **`bake_thumbs.py` 真场景高清缩略图离线烘焙**。

---

## 对标示范样例（可实机运行对比）

在 `simulify/` 根目录下起本地静态服务即可浏览总展台 [`examples/index.html`](examples/index.html)：

- **`examples/rl-td-bench/`**（⭐ RL 第 7 章整章 5 幕标杆 · 方案 A 2.5D 精密仪器台）：覆盖 `TD(0) → Sarsa → n-step → Q-Fork → 统一视角与代码`，内置阳极氧化铝下沉式 `-100` 深红悬崖、26 块倒角四向 Q 扇区瓷砖、悬浮半透明 3D 玻璃 `n-step` 弧、`TD Fork` 分叉电路与实时 Python 单步追踪，全量接入质量裁判 Oracle。
- **`examples/cache-bench/`**（直接对标二维 `cache-miss` 时序图）：把缓存命中/缺页变成 **4 幕演进的 3D 双槽对照工作台**——1 ns 与 100 ns 路径速度差、`LRU` vs `FIFO` 同序列反例分叉、[`LinkBus`](kit/link-bus.js) 3D↔表格双向联动高亮、`ChartCard.updateXY` 实时命中率 vs `ghost` 基准线、以及可折叠 $\text{AMAT}$ 活代入算式。
- **`examples/hysteresis-bench/`**（物理 × 数学双真源 3D 仿真实验台）：真实演示噪声环境里单阈值控温如何触发高频机械抖动，再分 3 幕拉宽 $\Delta T$ 回差带，同一 `solve()` 实时联动双金属片弯曲、加热灯丝、滞回相图与 $T_{\text{on}}/T_{\text{off}}$ 切换不等式表。
- **`examples/prob-stat-ch5-bench/`**（概率统计第 5 章整章 5 幕精密仪器台）：串联 $L^2$ 条件期望正交投影与 MSE 分解、超几何有限总体修正、平方变换双尾/重期望法则、泊松-伽马对偶重尾帕累托与 $\chi^2 / t / F$ 三维采样穹顶，内置 4/4 反例证伪 Oracle。

---

## 快速开始

依赖 Python 3.9+ 与 Node.js 20+（实机三视口校验与缩略图烘焙依赖 Python `playwright`）：

```bash
# 1. 提取离线纯净 Three.js ESM 到共享依赖目录
python scripts/setup_vendor.py examples/shared

# 2. 运行全部单元测试与语法/链接校验
npm test

# 3. 自动三视口 (1280x800, 1440x900, 390x844) + 深链探针验机
python scripts/verify_stage.py --root . --entry examples/cache-bench/index.html --probe "?stage=act-3&end"

# 4. 利用 ?thumb=1 从真实场景自动烘焙 2× 高清缩略图
python scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json
```

---

## 目录结构

```text
simulify/
├── SKILL.md                  # 1 次视觉选图 + 3 项代码硬约束工作流
├── LICENSE                   # MIT 开源协议
├── kit/                      # Layer 1：零构建 3D/2D 舞台、时间导演、LinkBus、XY 图表、活公式与样式令牌
├── primitives/               # 高精领域图元工厂 (如 rl-primitives.js)
├── shell/                    # Layer 2：可选多语言 i18n、Ctrl+K 命令面板、存储适配器与进度条
├── scripts/                  # setup_vendor.py、verify_stage.py (自动化质量裁判 Oracle)、bake_thumbs.py
├── references/               # 原生真源同构、T1–T4 时间维度、题材适配、视觉规范与系统架构手册
├── examples/                 # 100% 离线对标示范展台 (shared vendor + 烘焙缩略图 + rl-td-bench + cache-bench + hysteresis-bench)
└── tests/                    # Node ESM 单元测试与完整性校验
```
