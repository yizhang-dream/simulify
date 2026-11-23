# Simulify v3.1

[English](README.md) · [安装](INSTALL.md) · [技能规范](SKILL.md) · [本地展台](examples/index.html) · [在线展台](https://simulify.xn--ltr42g543b.cn/)

Simulify 将物理结构、机械原理、数学定律和动力系统做成交互式 3D/4D 工作台。学习者可剖开遮挡、回拖因果过程，或直接调参观察模型在什么条件下失效。交付物是零构建的静态目录，随包提供 Three.js、字体和 KaTeX。

## 3 个 Profile × 3 种布局 × 6 套皮肤（双审美渲染档）

| Profile | 适用场景 |
|---|---|
| `mechanical-3d` | 装配、连杆和精密剖面。先建立共享 `DIMENSIONS` 与正／侧／俯正交蓝图。 |
| `field-math` | 标量场、矢量场、相空间曲面、波动与优化。 |
| `sandbox-direct` | 进入即能操纵的仪器与坐标空间。 |

`fullbleed-hud` 以画布为主，`split-bench` 提供独立工作栏，`ab-compare` 同步对照视角。`toggleZenMode()` 可在当前布局收起周边面板。六套 CSS 皮肤归入两套清晰渲染档：**Primer 触感图解档**（`paper-ink`、`monochrome-print`：`NoToneMapping`、选择性 IBL、对象 ID 圆核抗锯齿墨线、解析 `fwidth()` 网格）与 **Studio 精密 PBR 档**（`dark-studio`、`obsidian-gallery`、`bio-cutaway`、`blueprint`：`StudioLightformerEnvironment`、`NeutralToneMapping`、原生 4× MSAA 配倒角高光与紧贴 `Box3` 阴影）。[设计系统](references/design-system.md)

## 快速开始

在仓库根目录生成并启动独立工作台。

```bash
python scripts/new_bench.py my-bench --title "My Mechanism" --profile mechanical-3d --layout split-bench --skin paper-ink --with-vendor --serve
```

通过 HTTP 打开生成的实验台。`--with-vendor` 将 Kit、可复用的 `primitives/`、现代 Three.js、字体和 KaTeX 一并打包。无公式时可加 `--no-katex`。仓内目录可共享 Kit 与 vendor。独立包使用 `three.webgpu.js` 支持 WebGPU 和 WebGL2。[本地预览](http://127.0.0.1:8092/)

在 `model.js` 定义确定性的 `solve(params, t)` 及结构化 `falsifyCases`。`createSimModel()` 把同一份状态快照分发给 3D 场景、图表、代码高亮与活公式，也可使用 `rk4Step`、`integrateRK4` 和 `bisectRoot` 做数值计算。[脚手架](scripts/new_bench.py) · [Vendor 脚本](scripts/setup_vendor.py) · [模型底座](kit/model-core.js) · [API 声明](kit/index.d.ts)

默认用 WebGL2/WebGPU 加 DOM/CSS HUD 与引线，空间贴附内容可选 3D HTML-in-Canvas。用 `SpacetimeClock` 和 `SimulationTape` 支持反向拖动与基准叠比，多拍叙事按因果逐步揭示。[架构](references/stage-architecture.md) · [时间与交互](references/time-dimension.md)

## 校验与分工

```bash
node tests/run-tests.mjs
uv run scripts/verify_stage.py --root my-bench --entry index.html
```

浏览器验证器生成多视口截图、2× 局部特写裁片、汇总审稿单（`*-contact-sheet.png`）、Look-Dev 像素与场景遥测（含紫帧检测）及 JSON 回执。打开审稿单与特写核对倒角、材质、比例、演进和故障工况是否符合原理与材料。[Profile 门禁矩阵](references/engine-contract.md)

纯二维流程图用 `archify`，视频制片用 `onetake`。
