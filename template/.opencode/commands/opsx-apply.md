---
description: Implement tasks from an OpenSpec change in existing worktree (Experimental)
---

按照 schema 定义的 apply 阶段流程，在已存在的 worktree 中实现变更。

**Input**: 可选指定变更名称（如 `/opsx-apply add-auth`）。省略时从上下文推断，如果模糊则用 **question** 工具让用户选择。

**Apply 只负责实现**——worktree 由 `/opsx-ff` / `/opsx-new` 提前创建。

```
1. 选择变更 → 检测 worktree → 进入
2. Pre-flight → 检查 skill 文件、工具链
3. 逐任务实现 → task() 派 Agent + 审查
4. Verification → openspec status
5. 提交 → 在 worktree 中提交
```

合并、清理、retrospective、archive、PR 由 `/opsx-finish` 处理。

---

### Step 1: 选择变更

如果提供了名称则直接用，否则：
- 从上下文推断
- 如果只有一个活跃变更则自动选中
- 如果模糊则运行：

  ```bash
  openspec-superpowers-opencode verify
  ```

  - **成功（exit 0）** → 执行 `openspec list --json` → 获取活动 changes → 使用 **question** 工具让用户选择
  - **失败（exit 1）** →
    - 向用户展示 verify 的输出结果（诊断报告和修复建议）
    - 用 `question` 工具询问用户：**修复** 或者 **停止**
    - 用户选择**修复**，根据 verify 输出的修复命令执行修复 → 修复成功后重新执行本步骤
    - 用户选择**停止**，中断流程

宣布：`"Using change: <name>"`

### Step 2: 确保 worktree 存在并进入

```bash
git worktree list
```

- **输出含 `.worktrees/<name>`** → `cd .worktrees/<name>`
- **输出不含** → 从**项目根**执行 `openspec-superpowers-opencode ensure-worktree <name>`，再 `cd .worktrees/<name>`

**MUST NOT** 在 `git worktree list` 已列出目标时再调用 `ensure-worktree`。

### Step 3: 读取 schema apply 指令

```bash
openspec instructions apply --change "<name>" --json
```

同时读取 schema.yaml 中的 `apply:` 阶段指令了解完整流程。

### Step 4: Pre-flight

**4a. 检测 Superpowers 版本，确认对应 skill 能力可 Read / 可访问：**

先读取 `{{SUPERPOWERS_BASE_PATH}}../package.json` 的 `version` 字段，
取主版本号（如 `5`、`6`、`7`）：`5` 走 v5 分支，`6` 及以上（v6+，含 v7）走 v6+ 分支，
然后按版本检查对应文件。

**Superpowers v5：**
Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/implementer-prompt.md
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/spec-reviewer-prompt.md
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/code-quality-reviewer-prompt.md
  {{SUPERPOWERS_BASE_PATH}}test-driven-development/SKILL.md

**Superpowers v6+：**
Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md

并确认 SDD 的三个脚本存在（此处只确认可访问，不运行）：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/task-brief
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/review-package
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/sdd-workspace

如果有任一 Read 失败、或 v6+ 下任一脚本缺失，STOP 并告知用户，不要静默降级。

**4b. 确认 plan.md 中提到的工具链（mvn、docker、node 等）可用。**

**4c. 确认 .gitignore 已就绪：**

读取 plan.md，如果计划中包含 `npm install` / `cargo build` / `pip install` 等
会产生构建产物的命令，则在执行前确认对应子目录已有 .gitignore 排除产物：

| 项目类型 | 需排除的产物 |
|---------|-------------|
| Node/TypeScript | `node_modules/`, `dist/`, `*.tsbuildinfo` |
| Rust | `target/` |
| Python | `__pycache__/`, `*.pyc`, `.venv/`, `dist/` |
| Go | 二进制产物 |

**原则：先写 .gitignore，再跑 install/build。避免产物被误提交。**

### Step 4.5: v6+ 委托契约（三节，MUST / MUST NOT）

下面三节只对 **v6+ 分支**生效，是硬约束，不是参考资料。SKILL.md 里的命令与派发语法都按 **Claude Code（下称 CC）** 侧写，落到 **Oh My OpenCode（下称 OMO）** 必须按本节改写；v5 分支不受本节影响。

**① bash 调用写法（MUST）**

SDD 的 `scripts/` 下三个脚本虽然有 `#!/usr/bin/env bash`，但安装到本机后不保证有可执行位（Windows 侧尤其没有），且 Windows 上直接执行脚本会失败（会话 shell 未必是 bash）；加上占位符替换后的绝对路径可能含空格，因此：

- MUST 一律写成 `bash <脚本路径> [参数...]`，不得直接执行脚本路径。
- 脚本路径 MUST 用双引号包裹。
- Windows（Git Bash / MSYS）同样 MUST 带 `bash ` 前缀；MUST NOT 省略前缀，MUST NOT 用 `sh` 或 `./` 替代。
- `scripts/...` 是相对 SDD 技能目录的路径，MUST NOT 当作仓库相对路径。

SKILL.md 中的写法 → 本命令 MUST 使用的写法：

| SKILL.md 中的写法 | 本命令 MUST 使用的写法 |
|---|---|
| `bash scripts/sdd-workspace PLAN_FILE` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/sdd-workspace" <plan.md 路径>` |
| `bash scripts/task-brief PLAN_FILE N` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/task-brief" <plan.md 路径> <任务序号>` |
| `bash scripts/review-package PLAN_FILE BASE HEAD` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/review-package" <plan.md 路径> <BASE> <HEAD>` |

`bash --version` 失败 → STOP 并告知用户安装 Git for Windows（或等价 bash）后重试；MUST NOT 静默降级成手工拼 prompt。

**② SDD → OMO 语法映射（MUST）**

SKILL.md 用 **Claude Code（CC）** 的 Subagent 语义描述派发。在 **Oh My OpenCode（OMO）** 中 MUST 按下表改写，MUST NOT 照抄 `Subagent (general-purpose)` 一类语法：

| SDD 写法 | OMO MUST 写法 | 说明 |
|---|---|---|
| `Subagent (general-purpose)` | 实现者：`task(category="deep", load_skills=[], description="<任务名>", prompt="<prompt>")` | `description` 必填；`category="deep"` 只用于**实现者** |
| Subagent 承担审查角色（task reviewer） | 审查者：`task(subagent_type="oracle", description="<审查名>", prompt="<prompt>")` | 与本仓库既有约定一致（v5 分支同样用 `oracle`）；MUST NOT 用 `category="deep"` 派审查者 |
| 按任务复杂度选 `model`（SKILL.md 的 Model Selection） | **不写** `model` 参数 | 模型由 `category` 隐含；SKILL.md 的「机械任务用便宜模型 / 架构任务用最强模型」→ 选对应 `category`，不写模型名 |
| 后台派发 | `run_in_background=true` | 结果用 `background_output(task_id="bg_...")` 收取，不要短超时轮询 |
| 续跑同一个子 Agent（fix loop 前 3 轮、补充上下文） | `task(..., task_id="ses_...")` | 首次派发返回的 `ses_...` 会话 ID 要记下；续跑 MUST 带上它，不得另起新 Agent 重来 |
| `load_skills=["test-driven-development"]` 之类 | **MUST NOT 依赖**，一律 `load_skills=[]` | `load_skills` 只接受已注册的 skill ID；Superpowers 的 skill 是文件系统上的 `.md`，不是注册技能，传进去会被**静默忽略**（不报错、不生效） |

Superpowers skill 的唯一正确传递方式：`Read` 该 `.md` 文件，把内容（或其要求）直接嵌进 `prompt`，或让子 Agent 自己去 `Read` 指定路径。

**③ tasks.md 勾选契约（MUST）**

- 实现者 report 中 `status = DONE` 的任务，控制方 MUST 在 `openspec/changes/<name>/tasks.md` 勾选对应 checkbox（`- [ ]` → `- [x]`）。SDD 只维护自己的 ledger 与 todo，不会写 OpenSpec 的 tasks.md，这一条只能由本命令补上。
- 其它状态（`DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED`）MUST NOT 勾选。
- MUST 逐条勾选，不得批量把所有 checkbox 一次勾完；审查回退的任务 MUST 改回未勾选。
- 未真正执行的验收项（测试、构建、手工验证）MUST 记为「未验」，MUST NOT 写成通过。

### Step 5: 逐任务实现

先检测 Superpowers 版本，然后按对应版本流程执行。

**Superpowers v5 流程：**

Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/implementer-prompt.md
  {{SUPERPOWERS_BASE_PATH}}test-driven-development/SKILL.md

对 plan.md 中的每个微任务：
1. 使用 implementer-prompt.md 模板构造基础 prompt
2. 从 TDD SKILL.md 中提取 RED-GREEN-REFACTOR 流程、铁律作为 prompt 的前置指令
3. 通过 `task()` 派 Agent 实现（load_skills=[]，TDD 通过 prompt 嵌入传递）：

```typescript
task(
  category="deep",
  load_skills=[],
  description="实现 <任务名>",
  prompt="<TDD 前置指令 + 模板填充后的内容>",
  run_in_background=true
)
```

**Superpowers v6+ 流程（委托给 SDD，不再自编排）：**

严格按 `{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md` 执行。Step 5 与 Step 6 是同一个 SDD 循环的两半，一起交给它，不得拆成两套自作流程：

- **Setup**：SKILL.md 的 Setup 段（workspace 用 `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/sdd-workspace" <plan.md 路径>` 取得；ledger 是 workspace 下的 `progress.md`，已存在则先读 `references/resuming.md`）。
- **Pre-flight**：SKILL.md 要求读的 `references/preflight.md`（含其中的冲突扫描）。
- **逐任务**：SKILL.md 的 The Task Loop（§1 dispatch implementer → §2 handle report → §3 review task → §4 fix loop → §5 complete task）。
- **收尾**：SKILL.md 的 Final Review（`references/final-review.md`）。

MUST 读取 SKILL.md 指引的每一个 `references/` 文件（v7 共 7 份：`batching.md`、`cannot-verify.md`、`final-review.md`、`fix-loop.md`、`handling-reports.md`、`preflight.md`、`resuming.md`），按其中的规则执行，不得凭记忆替代。

MUST NOT 用旧的自编排流程替代 SKILL.md。细节一律以 SKILL.md / `implementer-prompt.md` / `task-reviewer-prompt.md` / `references/` 为准；本节只补两处 SKILL.md 没写明的 OMO 落地口径 —— 脚本的 bash 调用形态（Step 4.5 ①）与 `BASE` 的记录口径（Step 6）。以下内容不在本节重述：

- implementer / task reviewer 的 prompt 怎么填（含 TDD 指令怎么进入 prompt —— 不再手工从 `test-driven-development/SKILL.md` 摘录 RED-GREEN-REFACTOR 前置指令）；
- fix loop 的轮次上限、BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS 的处置、断点续跑规则。

派发语法 MUST 按 Step 4.5 的「② SDD → OMO 语法映射」改写：`task(category="deep", load_skills=[])`，不写 `model` 参数，后台派发加 `run_in_background=true`，续跑带 `task_id="ses_..."`。

### Step 6: 审查每个任务的产出

根据 Superpowers 版本执行对应审查流程。

**Superpowers v5（两步审查）：**

任务完成后，依次执行两项审查：

**Spec 审查**：
Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/spec-reviewer-prompt.md

用 spec-reviewer-prompt.md 模板构造审查 prompt，派 `task(subagent_type="oracle", ...)` 审查。

**代码质量审查**：
Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/code-quality-reviewer-prompt.md

用 code-quality-reviewer-prompt.md 模板构造审查 prompt，派 `task(subagent_type="oracle", ...)` 审查。

全部通过 → 标记 tasks.md checkbox 为完成。

**Superpowers v6+（审查同样交给 SDD）：**

实现与审查都在 SDD 的同一个循环里完成，本命令不另起一套审查流程；审查者按 SKILL.md §3 派发：

- 单任务审查 → SKILL.md §3 Review the task：用 `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/review-package" <plan.md 路径> <BASE> <HEAD>` 生成 package，再用 `task-reviewer-prompt.md` 填 prompt、按 `task(subagent_type="oracle", ...)` 派审查者（`BASE` 是实现者派发前记录的 commit，不是 `HEAD~1`）。
- 修复 → SKILL.md §4 The fix loop（读 `references/fix-loop.md`）。
- 全分支审查 → SKILL.md 的 Final Review（读 `references/final-review.md`）。

除 SDD 流程之外，OSO 只追加两条额外约束（MUST）：

1. 实现者 report 中 `status = DONE` 的任务，控制方 MUST 在 `openspec/changes/<name>/tasks.md` 勾选对应 checkbox（见 Step 4.5 ③）；其它状态不勾。
2. MUST NOT 修改 `openspec/schemas/` 下任何文件与 `openspec/config.yaml`；确实需要改 → STOP 并上报，交由用户处理，不得自行改动。

### Step 7: Verification

所有任务完成后，在 worktree 中运行验证：

```bash
openspec status --change "<name>" --json
```

确认所有 artifacts 已完成。如果有未完成的，按提示补充。

### Step 8: 在 worktree 中提交变更

```bash
git add -A && git commit -m "<name>: <描述>"
```

### 完成

```
✓ 变更 <name> 已实现并提交。
  Worktree 路径: .worktrees/<name>/
  分支: feature/<name>

下一步: 运行 /opsx-finish 进行合并、清理和归档。
```

---

**幂等性**：如果某些步骤已完成（如已实现部分任务、已提交），则跳过。
通过检查 `.worktrees/<name>/` 是否存在、`git status`、tasks.md 的 checkbox 状态等来判断。

**用户中断**：任何时候用户可中断。再次运行 `/opsx-apply` 时从上一次中断处继续。
