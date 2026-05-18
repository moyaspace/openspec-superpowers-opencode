# openspec-superpowers-opencode

OpenSpec 项目模板，用于将 Superpowers 方法论桥接到 OpenCode。

## 本质

- **这是一个基础设施/工作流仓库，没有应用代码。** 操作对象是 `openspec/changes/` 中的变更 artifacts（提案、规格、任务）。
- 核心价值：将 Superpowers skills（brainstorming、writing-plans、using-git-worktrees 等）通过 OpenSpec 的 OPSX 命令接入 OpenCode。

## 关键命令

所有操作通过 OpenSpec CLI（v1.3.1）驱动，两条路径等价：

| 操作 | 长命令 | 快捷键 |
|------|--------|--------|
| 创建变更并生成所有 artifacts | `openspec new change <name>` → 逐个生成 | `/opsx-ff <name>` |
| 开始/继续实现 | `openspec instructions apply ...` → 编码 | `/opsx-apply` |
| 验证实现 vs 规格 | `openspec status --json` → 检查清单 | `/opsx-verify` |
| 归档变更 | `openspec list --json` → 确认 → 归档 | `/opsx-archive` |

**核心流程：** `/opsx-ff <name>` → `/opsx-apply` → `/opsx-verify` → `/opsx-archive`

## OpenSpec CLI 速查

```powershell
openspec new change "<name>"          # 创建变更目录
openspec status --change "<name>"     # 查看 artifact 状态
openspec status --change "<name>" --json  # JSON 格式（解析 artifact 依赖）
openspec instructions <artifact-id> --change "<name>"  # 获取 artifact 模板+指令
openspec instructions apply --change "<name>" --json   # 获取上下文文件和任务
openspec list --json                  # 列出所有变更
openspec schema validate <schema>     # 校验 schema
openspec schemas                      # 列出可用 schema
```

## Schema 说明

- `openspec/config.yaml` 当前使用 **`superpowers-bridge-opencode`**（自定义 schema）。
- 回退到内置 schema：改 `config.yaml` 中的 `schema: spec-driven` 即可。
- 切换 schema 不需要删除 schema 目录，改配置即可随时切换。

## Superpowers Skill 载入规则

本 schema 使用自定义 workflow，通过 `Read` 替代 `skill()` 来载入 Superpowers skills。

### 基底路径

Superpowers 通过 `opencode.json` 的 `plugin` 数组或 `npm install -g superpowers@git+https://github.com/obra/superpowers.git` 安装后，skills 目录路径因平台而异：

| 平台 | 路径格式 |
|------|---------|
| Windows | `C:\Users\<用户名>\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\` |
| Linux | `~/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills/` |

setup 脚本通过 `find ~/.cache/opencode/packages/superpowers@* -type d -path "*/node_modules/superpowers/skills"` 自动检测，无需手动指定。

### skill() 不可用时

如果 `skill()` 工具不可用或报错，改用手动 `Read` 对应 skill 文件：
- `Read <基底路径>/<技能名称>/SKILL.md`
- 按 Read 到的内容执行

### 子 Agent 调度

本 schema 的 apply 阶段使用 `task()` 调度子 Agent：
- 实现任务 → `task(category="deep", load_skills=["test-driven-development"], ...)`
- 代码搜索 → `task(subagent_type="explore", ...)`
- 查文档 → `task(subagent_type="librarian", ...)`
- 架构决策 → `task(subagent_type="oracle", ...)`
- Code review → `task(subagent_type="oracle", ...)`

## 项目结构

```
openspec/
├── config.yaml          # OpenSpec 配置（schema 选择）
├── schemas/
│   └── superpowers-bridge-opencode/  # 自定义 schema（schema.yaml + templates/）
├── changes/
│   └── archive/         # 已归档变更
└── specs/               # 主规格文件（可空，由变更流程填充）

.opencode/
├── commands/            # OPSX 快捷键定义（/opsx-*）
├── skills/              # OPSX skill 定义（openspec-*-change）
└── package.json         # @opencode-ai/plugin v1.14.48
```

## docs/DEPLOYMENT.md

- **仓库内唯一的完整技术文档**（中文，667 行）。
- 记录了 `superpowers-bridge-opencode` schema 的完整安装/配置/升级流程。
- 涉及将 Superpowers skills（通过 `Read` 替代 `skill()`）适配到 OpenCode。
- Windows 下路径格式：`C:\Users\<username>\.cache\opencode\...`
- 处理任何与 bridge 安装/升级/迁移相关的问题时，先读此文件。

## 注意事项

- **没有应用代码要构建或测试。** 不要运行 `npm install`、`npm test` 等。
- **setup 脚本自动适配平台。** 脚本内写死路径（`setup.ps1` 用 `\`，`setup.sh` 用 `/`），但 Superpowers 路径通过 `find` 自动检测。
- OPSX command 定义在 `.opencode/commands/` 中（用户可触发），OPSX skill 定义在 `.opencode/skills/` 中（可通过 `skill()` 加载）。
- 用户可通过 `.opencode/package.json` 中 `@opencode-ai/plugin` 的版本感知 OPSX 兼容性。
