<!-- openspec-superpowers-opencode_instructions -->

# AGENTS.md - AI 行为指令

本项目使用 openspec-superpowers-opencode（`superpowers-bridge-opencode` schema）驱动开发流程，
所有功能变更遵循 artifact 生命周期管理。

## 开发规则

- 变更必须先在 worktree（`.worktrees/<name>/`）中生成 artifacts 和代码
- `main` 分支仅包含已合并的完成工作，始终保持干净
- 实现阶段使用 TDD（RED → GREEN → REFACTOR）方法论
- **所有 OpenSpec 工作流操作必须使用 `/opsx-*` 系列命令（如 `/opsx-propose`、`/opsx-apply`、`/opsx-ff` 等），不得手动模拟**
- **禁止自动执行 OpenSpec 工作流命令**：`/opsx-propose`、`/opsx-ff`、`/opsx-apply`、`/opsx-finish` 等 OpenSpec 工作流命令。必须由用户发起后才能执行。用户显式调用的流程（如输入 `/opsx-finish` 后）内部步骤不受限制。

## Git 协作规则

- rebase 中遇到 lockfile（Cargo.lock、go.sum、package-lock 等自动 resolving 产物）冲突时，lockfile 无法手动合并，必须重新生成（如 `cargo generate-lockfile` / `npm install` / `go mod tidy` 等）。重新生成的锁文件可能引入非预期的版本漂移，所以必须先编译验证再 `rebase --continue`

## Superpowers Skill 载入

本 schema 使用 `Read` 替代 `skill()` 来载入 Superpowers skills。

### Superpowers 路径

```
{{SUPERPOWERS_BASE_PATH}}
```

### skill() 不可用时

如果 `skill()` 工具不可用或报错，改用手动 `Read` 对应 skill 文件：

- `Read <Superpowers 路径>/<技能名称>/SKILL.md`
- 按 Read 到的内容执行

### 子 Agent 调度

| 任务类型    | 调用方式                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 实现任务    | `task(category="deep", load_skills=[], ...)` — prompt 中嵌入 TDD 指令（Read {{SUPERPOWERS_BASE_PATH}}test-driven-development/SKILL.md） |
| 代码搜索    | `task(subagent_type="explore", ...)`                                                                                                    |
| 查文档      | `task(subagent_type="librarian", ...)`                                                                                                  |
| 架构决策    | `task(subagent_type="oracle", ...)`                                                                                                     |
| Code review | `task(subagent_type="oracle", ...)`                                                                                                     |

### ⚠️ 关键限制：`load_skills` 不支持 Superpowers 技能

`task()` 的 `load_skills` 参数**只接受已注册 skill ID**（`skill()` 工具可找到的技能）。
Superpowers 技能（TDD、brainstorming 等）是文件系统上的 `.md` 文件，**不是注册技能**。
传入 `load_skills=["test-driven-development"]` 会**静默忽略**，不报错。

**唯一正确的传递方式**：Read 文件后，内容直接嵌入 `prompt` 字段。见上方"子 Agent 调度"表。

## 项目文档参考

以下文档是 AI 理解项目上下文的主要入口。标注 `*` 的为推荐必配。

### 项目概览

- `README.md` — 项目定位、安装、快速开始 *
- `docs/QUICKSTART.md` — 用户快速上手指南
- `docs/features.md` — 功能列表与特性说明

### 架构与设计

- `docs/architecture.md` — 总体架构、模块划分 *
- `docs/decisions/` — 各类决策记录
  - 架构决策（ADR）：系统级选型、模块拆分理由
  - 设计决策（DDR）：功能设计方案对比、API 权衡
  - 实现决策（IDR）：编码阶段取舍、性能优化策略
- `docs/design.md` — 功能设计文档

### 开发与测试

- `docs/development.md` — 开发环境、构建命令、代码风格 *
- `docs/how-it-works.md` — 工作原理
- `docs/testing.md` — 测试规范与运行方式 *
- `test-runs/` — 自动生成的测试运行记录（`.gitignore`）

### 需求与实施

- `docs/prd.md` — 产品需求文档
- `docs/tasks.md` — 实施任务列表及当前进度 *

### 经验积累

- `docs/learnings/` — 开发过程中沉淀的经验、踩坑记录、需要重复执行的场景应对方式

<!-- openspec-superpowers-opencode_instructions -->
