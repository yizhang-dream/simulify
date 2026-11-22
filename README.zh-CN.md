<h1 align="center">Simulify v2.2</h1>

<p align="center">
  <b>True 4D 多布局科学可视化与交互原理拆解技能 &nbsp;|&nbsp; 6 种布局 × 6 套皮肤 &nbsp;|&nbsp; 1:1 物理锐度 WebGPU + 实心剖切与动态场</b>
</p>

<p align="center">
  一套开源 Agent Skill 与零构建离线 ESM 工具套件：针对纯文本、静态架构图和可读教材讲不透的三维空间构造、科学动态场、连续四维时间演进与杂志式深度叙事，提供 6 种声明式布局原型（含编辑式 Scrollytelling）、6 套视觉皮肤、同向影棚光影与 45° Stencil 实心剖切、非盒体微纹理 PBR 雕塑、动态矢量/流场/等值线原语、扩展 KaTeX 数学排版与 6 模图表，以及一键离线导出 MP4 / WebM / GIF / APNG 能力。
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
| `archify` | 校验级 2D SVG 图谱 | 系统架构、时序流、ERD、状态生命周期图 | 专精二维结构连接 |
| `atlas-textbook` | 在线问题链交互书 | `carries`/`hook`/`relates` 章节编织与干净直觉句 | 继承其问题链承上启下与直白文风，落到可实时证伪的 4D 实验台 |
| **`simulify` v2.2** | **True 4D 时空 + 6 大布局原型 + 科学动态场与 KaTeX 双联** | **6 种布局（分栏/滚动叙事/双屏滑帘对比/工程三视图/全屏/专注）× 6 套皮肤、实心 45° 剖切帽、动态场与离线导片** | 概念稿 + 正/侧/俯三视图锁比例、渐进/滚动可逆揭示、微纹理 PBR 雕塑、WebGPU + 2× HTML-in-Canvas 与布局自适应全节拍门禁 |

---

## Simulify v2.2 核心能力升级

1. **6 种布局原型、6 套视觉皮肤与出版级排版（[`kit/layout-shell.js`](kit/layout-shell.js)、[`kit/primer-tokens.css`](kit/primer-tokens.css)、[`kit/theme-studio.css`](kit/theme-studio.css)）**：
   - 彻底打破单一全屏浮窗 HUD 局限，内置 **`fullbleed-hud`**、**`split-bench`**（左右零遮挡工作台 + `@container` 卡片响应）、**`ab-compare`**（双舞台视角互锁并排或 `WipeCompareController` 滑帘对比）、**`multi-view`**（主等轴 + 右侧实时正/侧/俯三视图条）、**`scrolly-stage`**（左侧 `16px / 60ch` Claude 衬线编辑式长文 + 右侧 Sticky 3D 舞台，由 `ScrollyBridge` + CSS Scroll-Driven 进度轨可逆驱动 4D 时钟）与 **`zen`** 专注模式（`toggleZenMode()`）。
   - 沿用全部 6 套视觉皮肤（`paper-ink` / `dark-studio` / `bio-cutaway` / `blueprint` / `monochrome-print` / `obsidian-gallery`），全套标题与阅读正文升级为 **Claude 风格离线衬线排印**（`Newsreader` + `Noto Serif SC` 400 常规体 / 650 标题体），交互控件保持 `Inter` + `Noto Sans SC` 清晰无衬线，数据读数保持 `JetBrains Mono` 等宽；内置 Okabe-Ito 8 色盲安全分类色（`--cat-1..8`）、出版级 KPI 卡片、ViewCube（`mountViewCube`）、动态比例尺（`mountScaleBar`）与无框 `editorial` 标注。
2. **影棚同向光影、零额外 Pass 缝隙 AO、Stencil 45° 实心剖切与 `GLASS_LAYER = 3`（[`kit/stage-3d.js`](kit/stage-3d.js)、[`kit/outline-pass.js`](kit/outline-pass.js)、[`kit/geo-sculpt.js`](kit/geo-sculpt.js)）**：
   - 统一主光与投影灯方向并新增轮廓背光 `_rimLight`、零额外 Pass 屏幕空间缝隙环境光遮蔽（`setAOStrength()`）、径向渐隐程序地网（`cartesian`/`polar`/`plinth`/`none`）、柔和接触阴影（`addContactShadow()`）、局部点光源（`createAccentLight()`）与按需景深（`enableDepthOfField()`）。
   - 打通 WebGPURenderer（`THREE.ClippingGroup` + `colorPass` 模板缓冲）与传统 WebGLRenderer 双后端的 **45° 交叉斜线实心 Stencil 剖切帽**（`stage.createCutawayCap()`）；新增缓存式程序 PBR 微纹理（`createProceduralSurfaceMaps()`）与 Fresnel **`createXRayMaterial()`**（独立 `GLASS_LAYER = 3` 仅进色彩通道，绝不遮断内部实体轮廓线）。
3. **科学动态场与工程标注原语库（[`kit/field-viz.js`](kit/field-viz.js)）**：
   - 内置 6 套感知均匀科学色带（`viridis`/`plasma`/`magma`/`coolwarm`/`thermal`/`cividis`）+ `renderColorbar()`、定向脉冲流带 `createFlowConduit`、零 GC 3D 矢量场 `createVectorField`、可逆 4D 确定性粒子群 `createDeterministicSwarm`、频闪轨迹丝带 `createMotionTrail`、自动明暗反差朝向相机的 3D 尺寸/力矢/夹角标注（`createDimensionMeasure`/`createForceArrow`/`createAngleArc`）以及独立哑光裙边的等值线标量高度场 `createContourField`。
4. **编排器、扩展 KaTeX 数学 AST、6 模图表与 4D 轨道 B（[`kit/choreography.js`](kit/choreography.js)、[`kit/live-maths.js`](kit/live-maths.js)、[`kit/chart-card.js`](kit/chart-card.js)、[`kit/stage-2d.js`](kit/stage-2d.js)）**：
   - [`ActorChoreographer`](kit/choreography.js) 新增无透明穿帮的 `matte`/`wireframe` 去饱和聚焦模式、`explodeGroup()`、`clipSweep()` 及 `explode`/`draw`/`blueprint` 转场。
   - [`LiveMathsPanel`](kit/live-maths.js) 离线内置完整 KaTeX 引擎（[`kit/katex/katex.mjs`](kit/katex/katex.mjs) + 完整 20 枚 `.woff2` 字体，零 CDN），提供 `renderTex()`、`substituteTexVars()` 与 `renderMathInElement()`（正文/卡片/标注中 `$...$` / `$$...$$` / `\(...\)` / `\[...\]` 自动渲染并内置货币金额防误触），原生支持 `tex:` 公式 + `LinkBus` 联动，并 100% 兼容原有 AST 原语（`mathSqrt`/`mathMatrix`/`mathCases`/`mathAccent`/`mathFence`/`mathAlign`）。
   - [`ChartCard`](kit/chart-card.js) 扩充为 6 模持久图表（`xy` / 通用 `hysteresis` / `distribution` / `heatmap` / `timing` / `spark-kpi`）；[`SvgFlowStage`](kit/stage-2d.js) 全面主题化、自动裁切边框箭头并支持确定性 4D `setPacketSchedule()`。
5. **布局自适应全节拍质量裁判与双层导片（[`scripts/verify_stage.py`](scripts/verify_stage.py)、[`kit/stage-exporter.js`](kit/stage-exporter.js)、[`scripts/export_video.py`](scripts/export_video.py)）**：
   - [`scripts/verify_stage.py`](scripts/verify_stage.py) 自动识别 6 套布局原型，全节拍巡检 HUD 遮挡、字体与物理画布锐度、`geometry-diversity`、`three-views` 四视图、真实鼠标拖拽 `camera-ownership` 与 `--no-hic` 回退。
   - Tier 1 浏览器离线零 CDN 导片（覆盖全部 6 套皮肤背景）与 Tier 2 命令行影棚渲染（`scripts/export_video.py`，`--shutter 180`）。

---

## 真 4D 新基线（概念稿 → 工程三视图锁比例 → 立体真 4D）

所有依赖旧单视角 2D 概念图推导出的示范实验台已清空，画廊以全新基线重新出发：

1. **架构概念稿（Step 1a）**：用清晰结构化文本与表格敲定原生真源（`①–④`）、三维立体结构与剖切层次、`T1–T4` 分拍揭示台账、直操交互与反例断言，不再出误导纵深的单视角 2D 概念图。
2. **正/侧/俯工程三视图（Step 1b）**：动代码前先出对齐的**正视图（Front）/ 侧视图（Side）/ 俯视图（Top）**三视图，并锁死 `DIMENSIONS` 三轴世界尺寸常量表（`L × W × H`、壁厚间隙与 4D 运动包络）。
3. **真 4D 构建与四视图回校（Steps 2–3）**：基于 `kit/` 离线引擎按尺寸表构建全视角自洽的立体真 4D 装置，并用 `verify_stage.py` 自动跑通全节拍交互与 **正视 / 侧视 / 俯视 / 等轴** 四视图比例验机。

---

## 快速开始与命令行工具

依赖 Python 3.10+（推荐配合 `uv`）与 Node.js 20+，无需打包器与联网 CDN：

```bash
# 1. 提取离线 Three.js WebGPU + TSL + 兼容 ESM 运行时与四层离线字体
python3 scripts/setup_vendor.py examples/shared
# 可选：为独立发布项目按实际汉字做超轻子集化瘦身
uv run --with fonttools --with brotli python3 scripts/setup_vendor.py dist/my-bench --fonts-only --subset-cjk dist/my-bench

# 2. 运行全部语法检查、清单同步、链接完整性校验与 v2.1 单元测试
npm test

# 3. 执行三视口 + 全节拍 + 正/侧/俯/等轴四视图 + 字体/雕塑/相机所有权质量裁判
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html
# 同时检验 Firefox/Safari 无 HTML-in-Canvas 环境的回退清晰度
uv run scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html --no-hic

# 4. 离线烘焙 2× 高清缩略图（支持 manifest 中指定 t 与 exportMode）
uv run scripts/bake_thumbs.py --root . --manifest examples/thumbs-manifest.json

# 5. 通过 Tier 2 命令行导出高清 4D 视频与 GIF
uv run scripts/export_video.py --root . --entry examples/<your-bench>/index.html \
  --out dist/demo.mp4 --preset 1080p60 --hud caption --formats mp4,gif
```

---

## 目录结构

```text
simulify/
├── SKILL.md                  # Agent Skill 工作流（概念稿 + 三视图锁版）、四条铁律与全节拍门禁
├── plugin.json               # 插件清单（v2.2.0，与 .claude-plugin/marketplace.json 同步）
├── LICENSE                   # MIT 开源协议
├── kit/                      # Layer 1：1:1 物理锐度 WebGPU/TSL 舞台（同向光影/背光/AO/实心剖切帽）、
│   │                         #          6 布局外壳（layout-shell.js）、科学动态场（field-viz.js）、4 层 OutlinePass、
│   │                         #          2× HtmlSurface、微纹理 PBR geo-sculpt、4D 时钟与编排、6 模 ChartCard 与扩展 KaTeX 活公式
│   ├── fonts/                # 离线四层 WOFF2 字库（Newsreader、Inter、KaTeX、JetBrains Mono + CJK）
│   └── export/               # 按需懒加载纯 JS MP4/WebM/GIF/APNG 封装器与双路径合成器
├── primitives/               # 按三视图 DIMENSIONS 尺寸表封装的领域 3D 图元工厂
├── shell/                    # Layer 2：可选多语言 i18n、Ctrl+K 命令面板、存储适配器与进度条
├── scripts/                  # setup_vendor.py (--subset-cjk)、verify_stage.py (--no-hic + three-views)、bake_thumbs.py、export_video.py
├── references/               # 原生真源与雕塑法则、T1–T4 时间维度、题材适配、视觉与字体规范、架构手册
├── examples/                 # 清空待入驻的真 4D 画廊与共享离线 Three.js 运行时
└── tests/                    # 全量 Node ESM 单元测试、雕塑/字体/封装器校验、语法与链接完整性套件
```
