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

## 不阻断原则（MUST，优先于本命令其余步骤）

执行中的 change 不等待人工确认。遇到冲突、歧义、计划缺陷、或原本想请示的上限：**裁决、记录、继续**。规格是约束、计划是它的论证，两者都没回答的，由你的判断定。

- 每条裁决 MUST 按 `Ruling: <决定了什么> — <为什么> — <判断错误时的代价>` 记入 ledger，并在 Step 8 抄进 `tasks.md` 的 `## Decisions`。
- 判断错误只产生**人看得见、撤得掉**的返工；停在一个问题上等人，代价是整段时间。
- 「要不要继续」「阶段小结」这类请示 MUST NOT 发。

**只有以下情形 MUST 停下，且 MUST 在汇报里点名是哪一条：**

1. SKILL.md 枚举的停止条件 —— 以你实际读到的版本为准（6.0–6.1 顶部 `Continuous execution` 为 3 条、7.x 为 4 条），MUST NOT 写死条数或内容
   - 「plan 坏了」这类条件 MUST 按上游的精度理解：只有**每条前进路径都只能靠猜**才算停止条件；plan 有具体缺陷但能裁决的，裁决 + 记录 + 继续。6.x 把「plan 本身错了」写在 `BLOCKED` 的处置里（escalate）—— 那是对 `BLOCKED` 状态的处置，不等于「凡 plan 有缺陷就停下」
2. 本命令自身定义的 STOP：所需脚本缺失、需要修改 `openspec/schemas/` 或 `openspec/config.yaml`、`tests 0` 且退出码 0（假 RED）；
3. 用户明确要求停下或改变方向。

除以上三类，停下一律视为本阶段未完成。

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

- **输出含 `.worktrees/<name>`** → 跳过创建
- **输出不含** → 从**项目根**执行 `openspec-superpowers-opencode ensure-worktree <name>`

**MUST NOT** 在 `git worktree list` 已列出目标时再调用 `ensure-worktree`。

进入 worktree：

```bash
cd .worktrees/<name> || { echo "STOP: cd 失败"; exit 1; }
```

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

并确认 SKILL.md 引用的脚本都存在（此处只确认可访问，不运行）。MUST NOT 写死脚本名单——
不同版本的脚本集合不同（6.0.x 无 `sdd-workspace`，7.0.2 多出 `sdd-repo`），一律以 SKILL.md 实际引用为准。

如果有任一 Read 失败、或有脚本缺失，STOP 并明确输出：缺哪个脚本、当前 Superpowers 主版本号、
以及「请升级 Superpowers 或改用 v5 分支」；不要静默降级。

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

### Step 4.5: v6+ 委托契约（四节，MUST / MUST NOT）

下面四节只对 **v6+ 分支**生效，是硬约束，不是参考资料。SKILL.md 里的命令与派发语法都按 **Claude Code（下称 CC）** 侧写，落到 **oh-my-openagent（下称 OmO）** 必须按本节改写；v5 分支不受本节影响。

**① bash 调用写法（MUST）**

SDD 的 `scripts/` 下三个脚本虽然有 `#!/usr/bin/env bash`，但安装到本机后不保证有可执行位（Windows 侧尤其没有），且 Windows 上直接执行脚本会失败（会话 shell 未必是 bash）；加上占位符替换后的绝对路径可能含空格，因此：

- MUST 一律写成 `bash <脚本路径> [参数...]`，不得直接执行脚本路径。
- 脚本路径 MUST 用双引号包裹。
- Windows（Git Bash / MSYS）同样 MUST 带 `bash ` 前缀；MUST NOT 省略前缀，MUST NOT 用 `sh` 或 `./` 替代。
- `scripts/...` 是相对 SDD 技能目录的路径，MUST NOT 当作仓库相对路径。

SKILL.md 中的写法 → 本命令 MUST 使用的写法：

参数个数与顺序 MUST 以脚本自身的 usage 为准，不由本命令规定——不同 Superpowers 版本不同
（6.1.x 的 `sdd-workspace` 无参数，6.2.0 起必须 1 个 `PLAN_FILE`）。
不确定时先执行 `bash "<脚本绝对路径>"`（不传参数），脚本会打印 usage 并以非零码退出，
按提示补齐后重试。MUST NOT 凭记忆猜测参数。

| 脚本 | 本命令 MUST 使用的写法 |
|---|---|
| `sdd-workspace` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/sdd-workspace" <参数按 usage>` |
| `task-brief` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/task-brief" <参数按 usage>` |
| `review-package` | `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/review-package" <参数按 usage>` |

`bash --version` 失败 → STOP 并告知用户安装 Git for Windows（或等价 bash）后重试；MUST NOT 静默降级成手工拼 prompt。

**② SDD → OmO 语法映射（MUST）**

SKILL.md 用 **Claude Code（CC）** 的 Subagent 语义描述派发。在 **oh-my-openagent（OmO）** 中 MUST 按下表改写，MUST NOT 照抄 `Subagent (general-purpose)` 一类语法：

| SDD 写法 | OmO MUST 写法 | 说明 |
|---|---|---|
| `Subagent (general-purpose)` | 实现者：`task(category=<按下表选>, load_skills=[], description="<任务名>", prompt="<prompt>")` | `description` 必填；`category` MUST 显式指定，不得省略（省略会继承会话默认模型）；只用于**实现者** |
| Subagent 承担审查角色（task reviewer） | 审查者：`task(subagent_type="oracle", description="<审查名>", prompt="<prompt>")` | 与本仓库既有约定一致（v5 分支同样用 `oracle`）；MUST NOT 用 `category` 派审查者 |
| 按任务复杂度选 `model`（SKILL.md 的 Model Selection） | **不写** `model` 参数 | 档位由下方「实现者档位」表决定；MUST NOT 写 `model` 参数 |
| 异步派发（一律） | `run_in_background=true` | 结果用 `background_output(task_id="bg_...")` 收取，不要短超时轮询。不要为了少一步往返改成同步：同步会阻塞主会话，用户在等待期间无法插话 |
| 续跑同一个子 Agent（fix loop 前 3 轮、补充上下文） | `task(..., task_id="ses_...")` | 首次派发返回的 `ses_...` 会话 ID 要记下；续跑 MUST 带上它，不得另起新 Agent 重来 |
| `load_skills=["test-driven-development"]` 之类 | **MUST NOT 依赖**，一律 `load_skills=[]` | `load_skills` 只接受已注册的 skill ID；Superpowers 的 skill 是文件系统上的 `.md`，不是注册技能，传进去会被**静默忽略**（不报错、不生效） |

**实现者档位（MUST，只按 plan 里读得到的客观信号，不估计时长）**

| plan 的形态 | category |
|---|---|
| 计划里已含完整代码，实现等于照着抄 + 跑测试；或只碰 1–2 个文件且规格完整 | `quick` |
| 要改多个文件，且它们彼此牵连（改签名、加字段、接新模块），但做法计划里已写明 | `deep` |
| 计划没定方案，实现者必须自行决定方案、模块边界或数据结构；或实现者必须先理解大片代码库才能动手 | `ultrabrain` |

> 判据出自 Superpowers `subagent-driven-development/SKILL.md` 的 Model Selection：
> `Touches 1-2 files with a complete spec` / `Touches multiple files with integration concerns` /
> `Requires design judgment or broad codebase understanding`。
> 上游按模型能力分三档，本桥接按 OmO 的 category 映射，语义一一对应。

**派发后取结果（MUST）**：派发时 MUST 记下 `task()` 返回的 `bg_...` 任务 ID 与 `ses_...` 会话 ID。完成后 MUST 主动调用 `background_output(task_id="bg_...")` 取结果。

本桥接已知问题：子任务完成时虽会唤醒控制方回合，但**唤醒信号不含任务 ID 与结果正文**（只剩一行内部标记）。因此 MUST NOT 假设结果会自动送达，也 MUST NOT 依赖唤醒信号判断哪个任务完成——用自己记下的 `bg_...` 去取。

这条与插件版本无关：即使某些版本的唤醒信号带正文、或只在全部任务完成时汇总通知，按「自己记 ID、主动取」执行都能成立，因此 MUST NOT 因通知变好而改回被动等待。

等待期间若有本地工作（更新 ledger、打包下一个审查）就继续做，然后回来取结果；不要用短超时反复轮询，也不要无声地无限等。MUST NOT 并行派发多个实现者（会冲突）。

若有多个已派发且尚未取结果的任务，MUST 逐个取完，不能只取一个就继续。

> 「不要短超时轮询、不要无声无限等、不得并行派发多个实现者」出自 Superpowers `subagent-driven-development/SKILL.md` §Waiting on dispatched subagents：
> `never poll a wait interface with short timeouts, and never sit in one silent, open-ended wait either`
> `Never dispatch multiple implementation subagents in parallel (conflicts).`
> 该节另有「child results arrive on their own」一句，在 OmO 当前环境**不成立**（唤醒信号无正文），故不采纳。

Superpowers skill 的唯一正确传递方式：`Read` 该 `.md` 文件，把内容（或其要求）直接嵌进 `prompt`，或让子 Agent 自己去 `Read` 指定路径。

**③ tasks.md 勾选契约（MUST）**

**勾选依据是实际执行证据，不是 plan 的声明。**

- 实现者 report 中 `status = DONE` 的任务，控制方 MUST 在 `openspec/changes/<name>/tasks.md` 勾选对应 checkbox（`- [ ]` → `- [x]`）。SDD 只维护自己的 ledger 与 todo，不会写 OpenSpec 的 tasks.md，这一条只能由本命令补上。
- plan task 与 checkbox **不是 1:1**：task 是派发与审查单位，checkbox 是验收点，数量与顺序都不保证对应。用 task 的 `**Covers:**` 声明快速定位；声明与实际不符时 MUST 以实际执行证据为准，并如实记录偏离，不得因声明对不上而中断流程。
- **纯验证项**（`openspec validate`、工作区干净、全量测试）不由任何 plan task 代勾；由本命令在实际执行到该验证时勾选（如 Step 7 / Step 8）。未执行不得勾选。
- 无法确定某 checkbox 是否已完成时 MUST NOT 勾选，并在本文件末尾写明原因 —— 宁可少勾（可见），不可错勾（不可见）；MUST NOT 留无声的空框（归档后无人能分辨那是「没做」还是「做了但按规则不勾」）。
- 非 `DONE` 状态的处置 MUST 与上游 `Handling Implementer Status` 对齐，MUST NOT 一刀切：
  - `DONE_WITH_CONCERNS`：先分类，MUST NOT 一刀切 ——
    - **正确性 / 范围**（会让 review 的结论或审查对象变化）→ 先处理（fix loop），MUST NOT 勾
    - **`observations`（记录性备注）** → 先记入 `## Decisions`，再按该 task 的审查是否 clean 决定：clean 则**可勾**（上游的完成判据是「review clean → ledger 记 complete」，状态字面不是判据），不 clean 则走 fix loop、不勾。判据：与本次交付的正确性、边界都无关，**不能用「需要改」来描述，只是「值得知道」**（上游举例是「这个文件在变大」——那只是举例，不代表要监控文件大小之类的指标）
  - `NEEDS_CONTEXT` / `BLOCKED`：补齐上下文或降级拆分后重新派发，MUST NOT 勾。
- MUST 逐条勾选，不得批量把所有 checkbox 一次勾完；审查回退的任务 MUST 改回未勾选。
- 未真正执行的验收项（测试、构建、手工验证）MUST 记为「未验」，MUST NOT 写成通过。
- 只有当**凭现有信息无法判断**某个 checkbox 的完成状态时才询问用户；有事实依据的分歧 MUST 自行按证据处理，不把判断推回给用户。

**④ 冲突与缺口的裁决（MUST）**

pre-flight 扫描发现的冲突或缺口，若某条 MUST 可测、且补测试的成本低（不新增依赖、改动不超一个测试文件），MUST 本轮当场补掉，不得以「交给后续审查」结案。只有成本高或无法自动验证时，才留给最终审查分诊。

约束含「第一个 / 优先级 / 顺序」这类语义时，MUST 补一个能让优先级真正起作用的用例：让多个候选同时满足触发条件，验证选中的是被声明为优先的那个。候选数量由签名决定，不写死。

每条裁决 MUST 写明：决定、理由、判断错误时的代价。

> 裁决机制见本命令开头的「不阻断原则」。格式 `Ruling: <what you decided> — <why> — <what it costs if wrong>` 出自 Superpowers **7.x** 的 `subagent-driven-development/SKILL.md` §`Rulings, not stalls`；6.0–6.1 **无此节**（其 SKILL.md 顶部只有 `Continuous execution`：不打断 + 3 条停止条件），因此裁决与记录义务由本命令提供，MUST NOT 依赖该章节名存在。「可测 MUST 当场补」与「优先级语义补多候选用例」两条为本桥接补充，上游无对应原文。

### Step 5: 逐任务实现

先检测 Superpowers 版本，然后按对应版本流程执行。

**派发前分诊（MUST）**：逐个检查 plan task 的 `**Covers:**`。

- **全部命中纯验证项** → **不派发**。该 task 的验收项由本命令在 Step 7 / Step 8 亲自执行并勾选；plan 里不该存在这种 task，若遇到说明 plan 生成有缺陷，照此处理并在 `## Decisions` 记录。
- **部分命中** → 代码部分派发，验证部分留给 Step 7。
- **不含纯验证项** → 正常派发。

判断错误时不要绕过：`review-package` 报 `empty commit range` 这类「范围为空」的错误，说明派出去的对象没有产生任何变更。MUST 回头核对这条 task 的 `**Covers:**` 是否全部属于纯验证项，重新判断该不该派发；MUST NOT 自行编造审查内容把审查走完。

**Superpowers v5 流程：**

Read：
  {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/implementer-prompt.md
  {{SUPERPOWERS_BASE_PATH}}test-driven-development/SKILL.md

对 plan.md 中的每个 **task** 执行（task 是派发与审查的单位；step 是实现者内部的执行方法，不单独派发）：

> 若 plan 中存在「同一类小改动重复多次」的任务（同一行修复、常量变更、字段新增等），MUST NOT 逐个派发：
> 合并为一次派发、一次 diff 评审（Superpowers 7.0.1 起 `subagent-driven-development/references/batching.md` 有此规定；
> 更早版本按同一原则处理）。只有需要独立判断、独立测试或独立评审面的工作，才单独派发。
1. 使用 implementer-prompt.md 模板构造基础 prompt
2. 从 TDD SKILL.md 中提取 RED-GREEN-REFACTOR 流程、铁律作为 prompt 的前置指令
3. 通过 `task()` 派 Agent 实现（load_skills=[]，TDD 通过 prompt 嵌入传递）：

```typescript
task(
  category="<按 Step 4.5 ② 的档位表选>",
  load_skills=[],
  description="实现 <任务名>",
  prompt="<TDD 前置指令 + 模板填充后的内容>",
  run_in_background=true
)
```

**Superpowers v6+ 流程（委托给 SDD，不再自编排）：**

严格按 `{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md` 执行。Step 5 与 Step 6 是同一个 SDD 循环的两半，一起交给它，不得拆成两套自作流程：

下列章节名自 Superpowers 6.2.0 起存在；6.0–6.1 无同名章节，按你实际读到的 SKILL.md 中对应职责的章节执行。

- **Setup**：SKILL.md 的 Setup 段（workspace 用 `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/sdd-workspace" <参数按 usage>` 取得；ledger 是 workspace 下的 `progress.md`，已存在则先读它续跑）。
- **Pre-flight**：SKILL.md 中负责 pre-flight 的章节（6.2+ 在 `Setup` 前后；6.0–6.1 为 `Pre-Flight Plan Review`），含其中的冲突扫描。
- **逐任务**：SKILL.md 的 The Task Loop（6.0–6.1 为 `The Process` + `Handling Implementer Status` + `Handling Reviewer ⚠️ Items`）。
- **收尾**：SKILL.md 的 Final Review（6.0–6.1 无该章节，收尾按 `The Process` 末段 + `../requesting-code-review/code-reviewer.md`）。

MUST 读完 SKILL.md 指引的每一个文件：
- 若 SKILL.md 指向 `references/` 下的文件（Superpowers 7.0.1 起为 7 份），逐个读完；
- 若无 `references/` 目录（6.x），读 SKILL.md 全篇 + 它点名的 prompt 模板文件。
MUST NOT 因目录不存在而跳过，也 MUST NOT 凭记忆替代实读。

MUST NOT 用旧的自编排流程替代 SKILL.md。细节一律以 SKILL.md / `implementer-prompt.md` / `task-reviewer-prompt.md` / `references/` 为准；本节只补两处 SKILL.md 没写明的 OmO 落地口径 —— 脚本的 bash 调用形态（Step 4.5 ①）与 `BASE` 的记录口径（Step 6）。以下内容不在本节重述：

- implementer / task reviewer 的 prompt 怎么填（含 TDD 指令怎么进入 prompt —— 不再手工从 `test-driven-development/SKILL.md` 摘录 RED-GREEN-REFACTOR 前置指令）；
- fix loop 的轮次上限、BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS 的处置、断点续跑规则。

派发语法 MUST 按 Step 4.5 的「② SDD → OmO 语法映射」改写：`task(category=<按档位表选>, load_skills=[])`，不写 `model` 参数，一律异步派发加 `run_in_background=true`，续跑带 `task_id="ses_..."`。

**派发 prompt MUST 声明 artifact 归属（MUST）**：每次派发实现者，prompt 里 MUST 含一句等价的声明 ——

> `openspec/changes/<name>/` 下的 `tasks.md`、`plan.md`、`specs/**` 由 apply 控制方维护，**不在你的写入范围**。你需要留证据时，把命令原文、汇总行与数值退出码写进**你的 report**，由控制方转抄。

这条对 v5 与 v6+ 两条路径都适用。即使 plan 的某个 step 写了「写入 tasks.md」，也按本声明覆盖，并在 `## Decisions` 记一条（plan 写的，但 artifact 归控制方）。

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

- 单任务审查 → SKILL.md 的 Review the task 环节：用 `bash "{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/scripts/review-package" <参数按 usage>` 生成 package，再用 `task-reviewer-prompt.md` 填 prompt、按 `task(subagent_type="oracle", ...)` 派审查者（`BASE` 是实现者派发前记录的 commit，不是 `HEAD~1`）。
- 修复 → SKILL.md 的 fix loop 环节（7.x 另有 `references/fix-loop.md`，存在则一并读）。
- 全分支审查 → SKILL.md 的 Final Review（7.x 另有 `references/final-review.md`）。

除 SDD 流程之外，OSO 只追加四条额外约束（MUST）：

1. 实现者 report 中 `status = DONE` 的任务，控制方 MUST 在 `openspec/changes/<name>/tasks.md` 勾选对应 checkbox（见 Step 4.5 ③）；其它状态不勾。
2. MUST NOT 修改 `openspec/schemas/` 下任何文件与 `openspec/config.yaml`。发现确需修改时，STOP 并向 OSO 维护者（oso 仓库 / npm 包作者）报告：说明哪个文件、哪一段、为什么模板本身需要改。执行阶段不得改动这些文件。
3. 审查者报告只采信结构化区块（Spec Compliance / Issues / Assessment 等）；正文前的过程叙述一律忽略，不据此下结论。缺必需 section 时才用同一 `task_id` 要求重发；仅有过程叙述不触发重发。
4. **审查者 prompt MUST 带范围声明（MUST）**：每次派审查者，prompt 里 MUST 含一句等价声明 ——「本 task 的 review 范围是 `BASE..HEAD` 的代码改动；`openspec/changes/<name>/tasks.md` 等 change artifact 由控制方在 Commit 阶段填写，**不属于本 task 的交付物**。若你发现 artifact 状态与 brief 不一致，请报为 ⚠️ 交控制方裁决，**不要判为 task 缺陷**」。MUST NOT 写成「不要检查这一项」—— 那是预先压制发现；要给的是归属与处置路径（上游的 `⚠️ Cannot verify from diff` 通道正好可承接）。

### Step 7: Verification

所有任务完成后，在 worktree 中运行验证：

```bash
openspec status --change "<name>" --json
```

只看 apply 阶段该交付的部分：`tasks` 与 `plan` 必须为 `done`（也可直接读 `applyRequires` 字段）。

`verify` 与 `retrospective` 属于后续阶段，此时**必然未完成**，`isComplete` 因此必然为 `false` —— 这是正常的。
MUST NOT 因为 `isComplete: false` 就在本阶段补写这两个 artifact，也不要尝试「补完」。

此外，控制方 MUST 在 worktree 内**独立执行** plan 中约定的测试命令，记录命令、退出码与汇总行中的**测试数量**。数量与 plan 声明不一致时，MUST 先自查原因（用例被跳过、plan 计数口径不同等）：能解释则继续并记入 `## Unverified`，查不出原因才停下报告。`tests 0` 且退出码 0 属假 RED，MUST 停下。实现者报告里的「测试通过」只作线索，不作证据。

退出码 MUST 以数值写出（如 `exit=0`），MUST NOT 写布尔、MUST NOT 省略：

- bash / zsh：`cmd; echo "exit=$?"`
- pwsh / PowerShell：`cmd; echo "exit=$LASTEXITCODE"`（`$?` 是布尔值，不是退出码，MUST NOT 当证据用）

取不到数值退出码 → 该项 MUST 记入 `## Unverified`，MUST NOT 写成通过。

> 「测试通过即证明在测已有行为」出自 Superpowers `test-driven-development/SKILL.md` §Verify RED - Watch It Fail：
> `Test passes? You're testing existing behavior. Fix test.` / `Test errors? Fix error, re-run until it fails correctly.`
> 「`tests 0` 且退出码 0 属假 RED」与「独立复跑、数量核对」为本桥接补充，上游无对应原文。

### Step 8: 落盘裁决并提交

提交前 MUST 把 `openspec/changes/<name>/tasks.md` 末尾四节补齐（`## Decisions` / `## Deferred` / `## Unverified` / `## Verification`），一节一条、写明理由；无内容时留 `—`。这些内容随 change 归档，SDD workspace 删除后仍可追溯。

四节分工（MUST，不得混装）：

- `## Decisions`：`Ruling:`、过程性偏离（结论仍成立）、未勾选的原因
- `## Deferred`：不阻塞合并的 Minor，写明 file:line 与未修原因
- `## Unverified`：**未真正执行**的验收项
- `## Verification`：**执行过的命令与结果** —— 命令原文、汇总行、数值退出码、测试数量。证据 MUST NOT 只留在对话里

四节只对 apply 阶段新写的 change 生效；历史 change 不追溯、不要求补齐。

若本次 apply 修改了 `plan.md` 或 `specs/**`：

- 只允许两类改动：**事实错误**（版本号、命令写法等）与**范围措辞**（验收场景的表述边界）。MUST NOT 改验收断言、需求范围或行为约定；确需改这类内容 → STOP 并上报用户。
- MUST **独立提交**：先提交这些文件，再提交其余（含 tasks.md 的勾选与四节），两笔分开。
- 该提交的 message MUST 写明：改了哪个 artifact、旧值 → 新值、为什么。
- 默认不需要复审。若改动触及验收断言或需求范围（正常情况下应已被上一条拦下），MUST 先做一次 scoped re-review：`bash "<SDD>/scripts/review-package" <参数按 usage>` → `task-reviewer-prompt.md` → `task(subagent_type="oracle", ...)`，结论记入 `## Decisions` 后再提交。

**改了 `plan.md` 就必须让 brief 失效（MUST）**

brief 是一次性抽取的产物，实现者只读 brief、不读 plan。因此只要 `plan.md` 在任何一步被修改（含 Step 8 的事实错误修正），MUST 重新生成受影响 task 的 brief，否则实现者会按已废弃的指令继续做：

- 重跑 `task-brief <PLAN_FILE> <N>`（路径与参数以脚本打印的 usage 为准，各版本目录不同，MUST NOT 写死路径）
- 在 SDD ledger 记一行：`brief regenerated for task N (reason: plan 事实修正)`

按该 task 的派发状态处置（MUST）：

- 尚未派发 → 正常派发，使用新 brief
- 已返回 → 下一次续跑 / fix loop 派发 MUST 使用新 brief
- 仍在运行 → MUST 等它返回（MUST NOT 并行派发实现者），返回后按新 brief 复核一次，差异按 fix loop 处理。MUST NOT 假设可以向**运行中的**子 Agent 注入消息 —— `task(task_id=...)` 只能续跑已结束的会话

提交其余的变更：

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
