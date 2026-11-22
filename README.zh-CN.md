<h1 align="center">Simulify v2</h1>

<p align="center">
  <b>True 4D 交互原理拆解与仿真实验台技能 &nbsp;|&nbsp; WebGPU + HTML-in-Canvas &nbsp;|&nbsp; 离线视频 / GIF 确定性导出</b>
</p>

<p align="center">
  一套开源 Agent Skill 与零构建原生 ESM 工具套件：针对纯文本、静态架构图和可读教材讲不透的三维空间构造、连续四维时间演进与反事实因果，提供 1:1 物理与数学真源、可倒带搓动的渐进揭幕时间轴、3D 舞台直接操控，以及一键导出 MP4 / WebM / GIF / APNG 能力。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="https://simulify.xn--ltr42g543b.cn/">在线展台</a> · <a href="SKILL.md">Agent Skill 规范</a> · <a href="INSTALL.md">安装指南</a> · <a href="examples/index.html">本地示范展台</a> · <a href="#快速开始与命令行工具">快速开始</a>
</p>

---

## 为什么做 Simulify？（与兄弟插件的水平对位）

| 表达方式 | 原生媒介 | 擅长解决的问题 | `simulify` 接棒切入的地方 |
| :--- | :--- | :--- | :--- |
| 纯文字回复 | 段落列表 | 快速结论 | 遇到空间遮挡、时间差、正负反馈与多因子耦合时难以直观展开 |
| `answer-me-with-html` | 2D 图文 + 表格 | 极低 token 把多段道理做成一页纸 | 页面偏静态，学习者无法拧动参数亲手打破平衡观察动态后果 |
| `archify` | 校验级 2D SVG 图谱 | 系统架构、时序流、ERD、状态生命周期图 | 专精二维结构连接（可对照它的 `cache-miss` 时序图与 `examples/cache-bench/`） |
| `atlas-textbook` | 在线问题链交互书 | `carries`/`hook`/`relates` 章节编织与干净直觉句 | 继承其问题链承上启下与直白文风，落到可实时证伪的 4D 实验台 |
| **`simulify` v2** | **True 4D 时空 + 3D 剖面 + 形式化双联** | **单一 `solve()` 驱动的连续渐进实验台与离线视频导出** | 稀疏开场渐进揭幕、WebGPU + HTML-in-Canvas、3D 直接涂画与双层确定性录屏 |

---

## Simulify v2 核心能力升级

1. **True 4D 连续渐进揭幕（[`kit/spacetime.js`](kit/spacetime.js) + [`kit/choreography.js`](kit/choreography.js)）**：
   - [`SpacetimeClock`](kit/spacetime.js) 统一管理主时钟（`0 -> T`），支持连续双向搓动、变速（`0.25×`–`2×`）、单帧步进与分幕/节拍书签跳转。
   - [`SimulationTape`](kit/spacetime.js) 预烘焙确定性仿真轨迹，支持 O(1) 正反向连续插值采样与不可变反事实虚影快照（`captureGhost()`），改参后立刻同屏对照前后轨迹差异。
   - [`ActorChoreographer`](kit/choreography.js) 把 3D 角色入退场、上下文 HUD 卡片（`hudReveal`）、标注透明度、焦点压暗与镜头节拍（`cameraBeat`）全部写成时间 `t` 的纯函数：开场 `t = 0` 保持稀疏，随因果冲突逐层展开，往回拖动零漂移。
2. **零 CDN WebGPU + TSL + 原生 HTML-in-Canvas 渐进增强（[`kit/stage-3d.js`](kit/stage-3d.js)、[`kit/outline-pass.js`](kit/outline-pass.js)、[`kit/html-surface.js`](kit/html-surface.js)、[`kit/manipulator.js`](kit/manipulator.js)）**：
   - [`IsometricStage`](kit/stage-3d.js) 与 [`OutlinePass`](kit/outline-pass.js) 在支持硬件 WebGPU 的环境下自动启用 Three.js `WebGPURenderer` + TSL 管线，否则自动退回 WebGL2 / Canvas2D，全程 100% 离线零 CDN。
   - [`HtmlSurfaceManager`](kit/html-surface.js) 在 Chrome / Edge 157+ 上走现代原生 `<canvas content="drawable">`（`drawElementImageToTexture` / `texElementSubImage2D` / `updateElementGeometry`），把清晰中文排版、活公式与代码追踪直接贴上 3D 表面；在 Firefox / Safari 上平滑退化为 CSS `matrix3d` 叠加或 `CanvasTexture` 贴图。
   - [`StageManipulator`](kit/manipulator.js) 与 [`GridBrush`](kit/manipulator.js) 在捕获阶段拦截指针事件，支持直接拖动 3D 手柄或在 3D 网格上涂画地形而不与轨道相机冲突。
3. **双层确定性视频 / GIF 导出（[`kit/stage-exporter.js`](kit/stage-exporter.js) + [`scripts/export_video.py`](scripts/export_video.py)）**：
   - **Tier 1 浏览器离线一键导出**：[`StageExporter`](kit/stage-exporter.js) 逐帧调用 `window.__simulify.seek(t)`，按需懒加载 [`kit/export/`](kit/export/mp4-muxer.js) 下的纯 JS 编码器（`MP4`、`WebM`、带 4×4 Bayer 抖动与静止帧合并的 `GIF`、`APNG` 与单帧 `PNG`），通过 HTML-in-Canvas 或 Canvas2D 双路径合成。
   - **Tier 2 命令行影棚级渲染**：[`scripts/export_video.py`](scripts/export_video.py)（兼容 `uv run`）支持多进程 Playwright 捕获、`draft / 1080p60 / 4k60 / gif / webm` 预设、`caption / stage / hud` 画面模式与 `--shutter 180` 线性光快门运动模糊。
4. **升级版 4D 质量裁判（[`scripts/verify_stage.py`](scripts/verify_stage.py)）**：
   - 保留 v1 全部校验项（`prose-lint`、`stage-frame`、`chart-legibility`、`hud-overlap`、`falsify-oracle`），并通过 `--strict-4d` 新增 4 项硬门槛：`initial-sparsity`（禁止开场堆满终态）、`temporal-scrub-determinism`（正反向搓动可复现）、`mandatory-falsify`（强制数学证伪）与 `visual-integrity`（防空白画布、防代码卡片横向截断与零 GPU 报错）。
5. **1:1 原生真源与可选平台外壳（`shell/`）**：
   - 延续单一 `solve()` 驱动 3D 舞台、[`LiveMathsPanel`](kit/live-maths.js)（双向 `LinkBus` 高亮）与 [`ChartCard`](kit/chart-card.js)（可交互搓动 XY / 滞回曲线），配套离线 `i18n`、`Ctrl+K` 命令面板、可插拔存储适配器与真场景 2× 缩略图烘焙（[`scripts/bake_thumbs.py`](scripts/bake_thumbs.py)）。

---

## 现役旗舰与示范实验台

在 `simulify/` 根目录起本地静态服务即可浏览画廊 [`examples/index.html`](examples/index.html)（或 [`index.html`](index.html)）：

- **`examples/rl-td-bench/`**（⭐ Simulify v2 旗舰 · RL 第 7 章 True 4D 连续 6 节拍实验台）：以 44 秒 `SpacetimeClock` + `ActorChoreographer` 重构 `TD(0) → Sarsa → 四向 Q 下沉悬崖 → 3D 玻璃 n-step 视野弧 → 策略分叉 → 3D 活代码追踪`，支持直接在 3D 棋盘涂画悬崖（`GridBrush`）、同屏对比 Sarsa 安全路径与 Q-Learning 贴崖虚影、WebGPU + HTML-in-Canvas 渐进增强，以及一键导出 MP4 / WebM / GIF / APNG。
- **`examples/cache-bench/`**（现役对标样例 · 双槽缓存 LRU vs FIFO 4 幕工作台）：对照 1 ns SRAM 命中与 100 ns 主存回源，同序列暴露 FIFO 误杀热点，联动 [`LinkBus`](kit/link-bus.js) 3D↔表格高亮、`ChartCard.updateXY` 命中率 vs `ghost` 基准线与可折叠 AMAT 活代入算式*（后续波次将升级至 v2 4D 内核）*。
- **`examples/hysteresis-bench/`**（现役对标样例 · 双金属恒温器物理 × 数学双真源工作台）：在噪声环境下复现单阈值高频继电器抖动，分 3 幕拉宽 $\Delta T$ 回差带，同一 `solve()` 同步驱动双金属片弯曲、加热灯丝、滞回相图与 $T_{\text{on}}/T_{\text{off}}$ 切换不等式表*（后续波次将升级至 v2 4D 内核）*。

> **v1 归档样例**：早期 v1 实验台（包含概率统计第 5 章 `prob-stat-ch5-bench`）已完整保留 git 历史与独立可运行文件，归档于 [`examples/archive/`](examples/archive/README.md)。

---

## 快速开始与命令行工具

依赖 Python 3.10+（推荐配合 `uv`）与 Node.js 20+，无需打包器与联网 CDN：

```bash
# 1. 提取离线 Three.js WebGPU + TSL + 兼容 ESM 运行时到共享目录
python3 scripts/setup_vendor.py examples/shared

# 2. 运行全部语法检查、链接完整性校验与 v1/v2 单元测试
npm test

# 3. 执行三视口 + v2 4D 质量裁判 (--strict-4d)
uv run scripts/verify_stage.py --root . --entry examples/rl-td-bench/index.html --strict-4d

# 4. 离线烘焙 2× 高清缩略图（支持 manifest 中指定 t 与 exportMode）
uv run scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json

# 5. 通过 Tier 2 命令行导出高清 4D 视频与 GIF
uv run scripts/export_video.py --root . --entry examples/rl-td-bench/index.html \
  --out dist/rl-td.mp4 --preset 1080p60 --hud caption --formats mp4,gif
```

---

## 目录结构

```text
simulify/
├── SKILL.md                  # Agent Skill 工作流、真源同构规则与 v2 4D 质量门
├── LICENSE                   # MIT 开源协议
├── kit/                      # Layer 1：零构建 4D 时钟、编排引擎、WebGPU/TSL 3D 舞台、
│   │                         #          HTML-in-Canvas 表面、3D 操控器、图表、活公式与样式令牌
│   └── export/               # 按需懒加载纯 JS MP4/WebM/GIF/APNG 封装器与双路径合成器
├── primitives/               # 高精领域 3D 图元工厂（如 rl-primitives.js）
├── shell/                    # Layer 2：可选多语言 i18n、Ctrl+K 命令面板、存储适配器与进度条
├── scripts/                  # setup_vendor.py、verify_stage.py (--strict-4d)、bake_thumbs.py、export_video.py
├── references/               # 原生真源同构、T1–T4 时间维度、题材适配、视觉规范与系统架构手册
├── examples/                 # 现役示范画廊（rl-td-bench v2 旗舰 + cache-bench + hysteresis-bench）
│   └── archive/              # 归档 v1 实验台（保留完整历史与可运行代码，如 prob-stat-ch5-bench）
└── tests/                    # 全量 Node ESM 单元测试、封装器校验、语法与链接完整性套件
```
