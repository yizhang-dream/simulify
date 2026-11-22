# Install Simulify · 安装 Simulify

[English](#english) · [中文](#中文)

---

## English

Simulify is an agent skill plus a zero-build ESM kit. Install it **one way per agent**; a skill and a plugin with the same name load twice.

Requirements: Node.js 20+ and Python 3.9+ (Python `playwright` only for headless verification and thumbnail baking). No bundler, no CDN.

### Antigravity (plugin)

1. Clone the repository into your plugin directory (the folder name becomes the plugin directory):

   ```bash
   git clone https://github.com/yizhang-dream/simulify ~/.gemini/config/plugins/simulify
   ```

   On Windows: `git clone https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.gemini\config\plugins\simulify"`.
2. Open **Customizations → Plugins** and confirm **Simulify** is enabled. It loads live, no restart; the skill is available from the agent's next turn.
3. Try one of the suggested prompts, for example: *"Build a 3D cutaway explainer of how a bimetallic thermostat switches."*

The manifest is [`plugin.json`](plugin.json); the skill is exposed through [`skills/simulify/SKILL.md`](skills/simulify/SKILL.md), which points to the root [`SKILL.md`](SKILL.md).

### Claude Code (plugin)

```bash
claude plugin marketplace add yizhang-dream/simulify
claude plugin install simulify@simulify
```

The plugin loads in the next session, or after `/reload-plugins`.

### Codex, Cursor, OpenCode and other agents (skill)

```bash
npx -y skills add yizhang-dream/simulify -g -y -a <your agent name>
```

Or copy/clone the repository into the agent's skills directory (for example `~/.agents/skills/simulify`). The skill entry is the root [`SKILL.md`](SKILL.md); keep the whole repository together, because the skill refers to `kit/`, `primitives/`, `shell/`, `scripts/` and `references/` by relative path.

### Standalone local preview (no agent)

```bash
git clone https://github.com/yizhang-dream/simulify
cd simulify
python -m http.server 8092
# open http://127.0.0.1:8092/examples/index.html
```

ES modules need HTTP, so opening files with `file://` will not work. Optional checks:

```bash
npm test
python scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html
```

---

## 中文

Simulify 是一个 Agent Skill 加零构建原生 ESM 套件。**每个 Agent 只选一种方式安装**；同名的 skill 与 plugin 同时存在会重复加载。

环境：Node.js 20+、Python 3.9+（仅在无头校验与缩略图烘焙时需要 Python `playwright`）。无需打包器，无需 CDN。

### Antigravity（插件）

1. 把仓库克隆到插件目录（目录名即插件目录名）：

   ```bash
   git clone https://github.com/yizhang-dream/simulify ~/.gemini/config/plugins/simulify
   ```

   Windows：`git clone https://github.com/yizhang-dream/simulify "$env:USERPROFILE\.gemini\config\plugins\simulify"`。
2. 打开 **Customizations → Plugins**，确认 **Simulify** 已启用。插件热加载，无需重启，下一轮对话即可使用其中的技能。
3. 试一个推荐提示词，例如：*「做一个双金属片恒温器的 3D 剖面讲解，带可拖动时间轴和可调回差带」*。

清单文件是 [`plugin.json`](plugin.json)；技能经由 [`skills/simulify/SKILL.md`](skills/simulify/SKILL.md) 暴露，它指向根目录的 [`SKILL.md`](SKILL.md)。

### Claude Code（插件）

```bash
claude plugin marketplace add yizhang-dream/simulify
claude plugin install simulify@simulify
```

下个会话生效，或执行 `/reload-plugins`。

### Codex、Cursor、OpenCode 等其他 Agent（Skill）

```bash
npx -y skills add yizhang-dream/simulify -g -y -a <你的 agent 名>
```

也可以把仓库整体克隆或复制到该 Agent 的 skills 目录（如 `~/.agents/skills/simulify`）。技能入口是根目录 [`SKILL.md`](SKILL.md)；请保留整个仓库，因为技能按相对路径引用 `kit/`、`primitives/`、`shell/`、`scripts/` 与 `references/`。

### 独立本地预览（不需要 Agent）

```bash
git clone https://github.com/yizhang-dream/simulify
cd simulify
python -m http.server 8092
# 浏览器打开 http://127.0.0.1:8092/examples/index.html
```

ES 模块必须走 HTTP，直接双击 `file://` 打开无法运行。可选自检：

```bash
npm test
python scripts/verify_stage.py --root . --entry examples/<your-bench>/index.html
```
