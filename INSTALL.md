# Install Simulify v3.1 · 安装 Simulify v3.1

[English](#english) · [中文](#中文)

---

## English

Simulify is an agent skill plus a zero-build ESM kit for offline 3D/4D static directories. The kit offers 3 profiles, 3 layouts, and 6 CSS skins. Install it **one way per agent** to avoid loading the skill twice.

Use Node.js 20+ for the tests and Python 3.10+ for the CLI tools. Headless verification and thumbnail baking also use Playwright.

### Antigravity (plugin)

1. Clone the repository into your plugin directory.

   ```bash
   git clone --depth 1 https://github.com/yizhang-dream/simulify ~/.gemini/config/plugins/simulify
   ```

   On Windows: `git clone --depth 1 https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.gemini\config\plugins\simulify"`.
2. Open **Customizations → Plugins** and confirm **Simulify** is enabled. The skill is available from the agent's next turn.
3. Try *"Build a 3D cutaway explainer of how a bimetallic thermostat switches."*

The manifest is [`plugin.json`](plugin.json); the skill is exposed through [`skills/simulify/SKILL.md`](skills/simulify/SKILL.md), which points to the root [`SKILL.md`](SKILL.md).

### Claude Code (plugin)

```bash
claude plugin marketplace add yizhang-dream/simulify
claude plugin install simulify@simulify
```

The plugin loads in the next session, or after `/reload-plugins`.

### Codex, Cursor, OpenCode and other agents (full-repo skill)

Clone the full repository into your agent's skills directory so the relative paths to `kit/`, `primitives/`, `scripts/`, `references/`, and bundled `examples/shared/vendor/` stay intact (single-folder skill copies break those relative paths):

```bash
git clone --depth 1 https://github.com/yizhang-dream/simulify ~/.agents/skills/simulify
```

On Windows: `git clone --depth 1 https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.agents\skills\simulify"`. The skill entry is the root [`SKILL.md`](SKILL.md).

### Standalone local preview

```bash
git clone --depth 1 https://github.com/yizhang-dream/simulify
cd simulify
python scripts/new_bench.py my-bench --with-vendor --serve
```

Open [http://127.0.0.1:8092/](http://127.0.0.1:8092/) to load the bench over HTTP. `--with-vendor` copies bundled Three.js (WebGPU/TSL runtime without legacy `three.module.js`), fonts, and KaTeX through `setup_vendor.py`; pass `--no-katex` when a bench has no equations. Use `archify` for pure 2D flowcharts and `onetake` for motion-video production. [Model core](kit/model-core.js) · [API declarations](kit/index.d.ts) · [Profiles, layouts, and skins](README.md)

Run the repository tests and verify the authored bench from the repository root.

```bash
node tests/run-tests.mjs
uv run scripts/verify_stage.py --root my-bench --entry index.html
```

---

## 中文

Simulify 是一个 Agent Skill 加零构建原生 ESM 套件，交付离线 3D/4D 静态目录，支持 3 个 Profile、3 种布局和 6 套 CSS 皮肤。**每个 Agent 只选一种方式安装**；同名的 skill 与 plugin 同时存在会重复加载。

测试使用 Node.js 20+，命令行工具使用 Python 3.10+。无头校验与缩略图烘焙还需要 Playwright。

### Antigravity（插件）

1. 把仓库克隆到插件目录。

   ```bash
   git clone --depth 1 https://github.com/yizhang-dream/simulify ~/.gemini/config/plugins/simulify
   ```

   Windows：`git clone --depth 1 https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.gemini\config\plugins\simulify"`。
2. 打开 **Customizations → Plugins**，确认 **Simulify** 已启用。插件热加载，无需重启，下一轮对话即可使用其中的技能。
3. 试试 *「做一个双金属片恒温器的 3D 剖面讲解，带可拖动时间轴和可调回差带」*。

清单文件是 [`plugin.json`](plugin.json)；技能经由 [`skills/simulify/SKILL.md`](skills/simulify/SKILL.md) 暴露，它指向根目录的 [`SKILL.md`](SKILL.md)。

### Claude Code（插件）

```bash
claude plugin marketplace add yizhang-dream/simulify
claude plugin install simulify@simulify
```

下个会话生效，或执行 `/reload-plugins`。

### Codex、Cursor、OpenCode 等其他 Agent（整仓 Skill）

请整仓浅克隆到对应 Agent 的 skills 目录（例如 `~/.agents/skills/simulify`），保持 `kit/`、`primitives/`、`scripts/`、`references/` 与随仓 `examples/shared/vendor/` 相对路径完整（仅拷贝单子目录会导致相对路径失效）：

```bash
git clone --depth 1 https://github.com/yizhang-dream/simulify ~/.agents/skills/simulify
```

Windows：`git clone --depth 1 https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.agents\skills\simulify"`。技能入口为根目录 [`SKILL.md`](SKILL.md)。

### 独立本地预览（不需要 Agent）

```bash
git clone --depth 1 https://github.com/yizhang-dream/simulify
cd simulify
python scripts/new_bench.py my-bench --with-vendor --serve
```

打开 [http://127.0.0.1:8092/](http://127.0.0.1:8092/)，通过 HTTP 加载工作台。`--with-vendor` 通过 `setup_vendor.py` 离线复制随仓的 Three.js（默认省去遗留 `three.module.js`）、字体和 KaTeX；无公式的工作台可加 `--no-katex`。纯二维流程图用 `archify`，视频制片用 `onetake`。[模型底座](kit/model-core.js) · [API 声明](kit/index.d.ts) · [Profile、布局和皮肤](README.zh-CN.md)

在仓库根目录运行测试并验收已实现的工作台。

```bash
node tests/run-tests.mjs
uv run scripts/verify_stage.py --root my-bench --entry index.html
```
