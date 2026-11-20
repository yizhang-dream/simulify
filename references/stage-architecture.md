# 架构总览：零构建离线内核、发行外壳与验证工具链

> **架构设计原则**：所有运行资源（Three.js ESM、样式令牌、本地字体回退、多语言字典与烘焙缩略图）均**100% 离线随包运行、零外链 CDN**，使同一份代码可直接部署为静态网站或打包成桌面软件（Tauri / Electron / WebView2）。

---

## 1. Layer 1 · 单课核心引擎（[`kit/`](../kit/)）

| 模块 | 职责 | 核心导出 |
|---|---|---|
| [`kit/stage-3d.js`](../kit/stage-3d.js) | 正交等轴舞台、三点暖光、`RoomEnvironment`、`PCFShadowMap`、表面光环、轨道/缩放/`flyTo`、Raycaster 分组拾取 | `IsometricStage`, `SOLID_LAYER`, `GROUND_LAYER` |
| [`kit/outline-pass.js`](../kit/outline-pass.js) | 三通道离屏后处理：Layer 0 法线与深度 → 4× MSAA 颜色 → GLSL 轮廓折痕描边 | `OutlinePass` |
| [`kit/stage-2d.js`](../kit/stage-2d.js) | 轨道 B 精密 SVG 拓扑与 WAAPI 报文流转舞台 | `SvgFlowStage` |
| [`kit/timeline-director.js`](../kit/timeline-director.js) | `T1–T4` 时空导演：确定性快进/无漂移倒搓、阶段机位、问题链字段、`?stage=&step=&t=` URL 深链与测试钩子 | `TrackTimeline`, `TimelineDirector`, `PhaseScrubber`, `mountTimelineBar`, `applyUrlState`, `exposeTestHooks` |
| [`kit/link-bus.js`](../kit/link-bus.js) | 跨视图双向悬停/选中高亮与 `Zoom to it` 聚焦总线 | `LinkBus` |
| [`kit/callout-layer.js`](../kit/callout-layer.js) | 3D→2D 投影双层阴影描边引线、`afterStep` 分步显隐与 HUD 避让排布 | `CalloutLayer`, `resolveCalloutRects` |
| [`kit/chart-card.js`](../kit/chart-card.js) | 对比条、滞回环与多序列 XY 坐标图（含 `ghost` 基准线、临界标线、`dot`） | `ChartCard` |
| [`kit/live-maths.js`](../kit/live-maths.js) | 按需可折叠活公式实时数值代入、高亮查找表与单步因果分解 | `LiveMathsPanel` |
| [`kit/agency-loop.js`](../kit/agency-loop.js) | `AliveLoop` 自运转闭环与 `IntroDemo` 首轮自动规则演示（用户操作即让权） | `AliveLoop`, `IntroDemo` |
| [`kit/spring.js`](../kit/spring.js) / [`popups.js`](../kit/popups.js) | 阻尼弹簧核与 3D 锚点空间飘字 | `Spring`, `FloatingPopups` |
| [`kit/sound.js`](../kit/sound.js) / [`toolbar-a11y.js`](../kit/toolbar-a11y.js) | Web Audio 程序触感音效 + 工具栏 roving-tabindex 无障碍 | `TactileSound`, `initToolbars` |

---

## 2. Layer 2 · 可选站点与软件发行外壳（[`shell/`](../shell/)）

当从单个样板课扩展成**多语言整章学习站**或**离线桌面软件**时按需引入，不强绑单课：
- [`shell/i18n.js`](../shell/i18n.js)：多国语言字典管理（支持按需异步加载 JSON、参数插值、`[data-i18n]` 声明式刷新与 `ar`/`he` RTL 方向自动切换）；
- [`shell/command-palette.js`](../shell/command-palette.js)：`Ctrl+K` / `Cmd+K` 原生 `<dialog>` 命令面板（秒搜课程、分幕与核心术语跳转）；
- [`shell/storage-adapter.js`](../shell/storage-adapter.js)：可插拔 `StorageAdapter`（支持沙箱内存、网页 `localStorage` 与桌面软件自定义文件 IPC 桥）+ `MasteryStore` 学习完成度追踪；
- [`shell/app-shell.js`](../shell/app-shell.js)：一键挂载进度条 `[role="progressbar"]` 与语言切换胶囊。

---

## 3. CLI 工具链（[`scripts/`](../scripts/)）

- `python scripts/setup_vendor.py <lesson_dir>`：提取离线纯净 `three` ESM + `RoomEnvironment` + `RoundedBoxGeometry` 到本地 `vendor/`。
- `python scripts/verify_stage.py --root <dir> --entry <index.html> --probe "?stage=..."`：自动启临时服务并用无头浏览器巡检 `1280×800`、`1440×900`、`390×844` 三视口及 URL 深链探针，产出 JSON 验机回执与截图。
- `python scripts/bake_thumbs.py --root <dir> --manifest <thumbs.json>`：利用 `?thumb=1` 从真实渲染画面自动烘焙高清 2× 缩略图，零运行时 GPU 开销。

---

## 4. 关键工程坑点避雷

1. **MSAA 与深度纹理隔离**：`OutlinePass` 中挂了 `DepthTexture` 供精确采样，其 `normalTarget` 必须保持 `samples: 0`，而仅在 `colorTarget` 上开启 `samples: 4`。
2. **Layer 0 vs Layer 1 隔离**：真实物理实体放 Layer `0`（`SOLID_LAYER`）；地面 `ShadowMaterial` 接影平面与辅助网格放 Layer `1`（`GROUND_LAYER`），彻底避免地面出现杂乱描边。
3. **单一真相源 `solve()`**：舞台状态、形式化副图、曲线与活公式代入同帧由一个 `solve()` 返回值驱动，防止多处手算不同步。
