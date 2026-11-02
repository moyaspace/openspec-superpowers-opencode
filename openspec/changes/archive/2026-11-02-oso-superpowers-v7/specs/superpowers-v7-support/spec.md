## ADDED Requirements

### Requirement: v7 锁清单基线

`template/` MUST 提供 `skills.lock.v7.json`，其 `upstream.commit` MUST 等于 Superpowers v7.0.1 的提交 `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，且 MUST 覆盖 6 个条目：`brainstorming/SKILL.md`、`writing-plans/SKILL.md`、`subagent-driven-development/SKILL.md`、`subagent-driven-development/implementer-prompt.md`、`subagent-driven-development/task-reviewer-prompt.md`、`test-driven-development/SKILL.md`。每个条目的 `sha256` MUST 由该 commit 的实际文件内容计算得出，MUST NOT 沿用其他版本的旧值。

#### Scenario: v7 锁清单存在且条目完整

- **WHEN** 检查 `template/skills.lock.v7.json`
- **THEN** 文件存在，`upstream.repo` 为 `github.com/obra/superpowers`，`upstream.commit` 为 `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，`skills` 恰好包含上述 6 个键，每个键都有 64 位十六进制 `sha256`

#### Scenario: hash 与 v7.0.1 实际文件逐条一致

- **WHEN** 用 v7.0.1 干净 checkout 的对应文件重算 SHA-256，并与 `skills.lock.v7.json` 逐条比对
- **THEN** 6 个值全部一致；若与开工命令给出的参考值不一致，实现 MUST 停止并报告「上游可能已换版本」，MUST NOT 默默采用新值继续

### Requirement: v7 环境下 init 无 hash 警告

安装 Superpowers v7.0.1 后执行 `oso init`，`oso` MUST 选中 v7 锁清单并完成逐文件校验，MUST NOT 输出任何 hash 不匹配或文件不存在的警告。

#### Scenario: v7 环境 init 全绿

- **WHEN** Superpowers 版本为 7.0.1（文件与锁清单一致）且执行 `oso init`
- **THEN** 逐技能校验全部通过，输出中不含 `hash 不匹配` / `文件不存在` 类警告

#### Scenario: 校验使用的是 v7 清单而非 v5

- **WHEN** 在 v7 环境下执行 `oso init`
- **THEN** 输出提示使用的是与 major 7 对应的锁文件，且不出现 v5 清单中的条目名被报为「文件不存在」

### Requirement: v6 及更高版本的 apply 委托上游 SDD

`template/.opencode/commands/opsx-apply.md` 中 **Superpowers v6 及更高** 的分支 MUST 改为整体委托上游 `subagent-driven-development`：Pre-flight 阶段 MUST 只做两件事 —— Read `subagent-driven-development/SKILL.md`，以及确认 `scripts/` 下 `task-brief`、`review-package`、`sdd-workspace` 三个脚本存在；随后 MUST 严格按该 SKILL.md 的流程执行（含它指引读取的全部 `references/*.md`），MUST NOT 在 OSO 侧复刻控制器逻辑。**Superpowers v5 分支 MUST 保持原样**。

#### Scenario: 委托 Pre-flight 成功并读到全部 references

- **WHEN** Superpowers 为 v7 且主会话按 `opsx-apply.md` 执行 Pre-flight
- **THEN** 成功 Read `SKILL.md`，确认三个脚本存在，并按 SKILL.md 指引读到 v7 的 7 份 references（`preflight` / `fix-loop` / `handling-reports` / `final-review` / `resuming` / `cannot-verify` / `batching`）

#### Scenario: SKILL.md 读取失败时停止

- **WHEN** `subagent-driven-development/SKILL.md` 的 Read 失败
- **THEN** 流程 STOP 并告知用户，MUST NOT 静默降级为主会话自行实现

#### Scenario: 委托脚本缺失时停止

- **WHEN** `scripts/` 下 `task-brief`、`review-package`、`sdd-workspace` 任一不存在
- **THEN** 流程报告缺失项并 STOP，MUST NOT 进入逐任务实现

#### Scenario: SDD 能力在 v7 下完整可用

- **WHEN** 在 v7 环境执行 apply，遇到任务卡住、任务被阻塞、以及全部任务完成三种情形
- **THEN** 分别按 SKILL.md 走 fix-loop（最多 5 轮后升级）、按 BLOCKED 出口处理、并执行 final review 收口 deferred-minor

#### Scenario: v5 分支不受影响

- **WHEN** 检查 `opsx-apply.md` 中 Superpowers v5 的分支
- **THEN** 其 Read 清单（`implementer-prompt.md` / `spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md` / `test-driven-development/SKILL.md`）与两步审查流程与本 change 之前完全一致

### Requirement: 委托段包含三项补充约定

委托改造 MUST 同时写入三项约定，缺任一项视为未完成：① bash 脚本调用写法；② SDD 的 [CC] 语法到 OMO `task()` 的映射；③ `tasks.md` 勾选契约。

#### Scenario: bash 脚本以 bash 前缀调用

- **WHEN** Windows 上调用 `task-brief` / `review-package` / `sdd-workspace`
- **THEN** 命令写作 `bash <脚本路径>`，且文档说明脚本无执行位、直接执行会失败

#### Scenario: [CC] 语法按映射表转换

- **WHEN** SDD 文档中的写法需要在本项目执行
- **THEN** `Subagent (general-purpose)` 映射为 `task(category="deep", load_skills=[])`；`model` 由 category 隐含；后台执行使用 `run_in_background=true`；续跑同一子会话使用 `task_id`

#### Scenario: Superpowers 技能不经由 load_skills 传递

- **WHEN** 需要把 Superpowers 技能内容交给子 Agent
- **THEN** 文档要求先 Read 技能文件再把内容嵌入 prompt，并说明 `load_skills` 只接受已注册 skill ID、传入 Superpowers 技能会被静默忽略

#### Scenario: SDD 报告完成的任务回写 tasks.md

- **WHEN** SDD 的 report 中某任务 `status = done`
- **THEN** 主会话 MUST 勾选 `openspec/changes/<name>/tasks.md` 中对应的 checkbox，使 `openspec status` 不再显示该任务未完成

### Requirement: schema 的 apply 段与命令文本口径一致

`template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 `apply:` 段 MUST 采用与 `opsx-apply.md` 相同的委托口径（Pre-flight 只做 Read SKILL.md + 确认三脚本；实现与审查交给 SDD），MUST NOT 继续把 v6 的自编排描述为默认路径。

#### Scenario: schema 与命令文本一致

- **WHEN** 对比 `schema.yaml` 的 `apply:` 段与 `opsx-apply.md` 的 v6+ 分支
- **THEN** 两者对 Pre-flight、实现、审查的描述一致；`apply:` 段中出现 `spec-reviewer-prompt.md` 等文件时，仅限于描述 v5 分支

### Requirement: bash 可用性检查

`oso verify` MUST 在 Superpowers 主版本 ≥ 6 时增加一项 bash 可用性检查；bash 不可用时 MUST 以 ⚠ 形式提示安装方式，且 MUST NOT 判定整体检查失败。`oso init` 的输出 SHOULD 打印一行 bash 状态并复用同一检测函数，MUST NOT 因缺 bash 而中止。

#### Scenario: bash 可用

- **WHEN** 主版本 ≥ 6 且 `bash` 可在 PATH 或 Git for Windows 默认路径中找到
- **THEN** 该项状态为通过，并显示 bash 路径

#### Scenario: bash 不可用

- **WHEN** 主版本 ≥ 6 且未找到 bash
- **THEN** 该项以 ⚠ 提示「SDD 脚本需要 bash」并给出 Windows 安装方式；整体检查仍视为通过（`allPass` 为真），不阻塞

#### Scenario: 主版本低于 6 时跳过

- **WHEN** Superpowers 主版本 < 6
- **THEN** 不执行该检查项

### Requirement: 分发清单包含 v7 锁清单

`.github/workflows/ci.yml` 的 tarball 内容完整性检查 MUST 包含 `package/template/skills.lock.v7.json`，确保发布包不缺该文件。

#### Scenario: tarball 检查覆盖 v7 lock

- **WHEN** CI 打包并校验 tarball 内容
- **THEN** 缺失 `template/skills.lock.v7.json` 会使检查失败

### Requirement: 兼容文档覆盖 v5 / v6 / v7

`docs/superpowers-version-compatibility.md` MUST 覆盖 v5、v6、v7 三个版本，并 MUST 记录三个既存问题：v6 锁清单曾长期停留在 v6.1.1、v5 锁清单为拼凑值不可作准确基线、v5 分支引用的 reviewer prompt 自 v6 起已不存在。文档 MUST 说明 v7 的 brainstorming 语义变化（体量分流 + 强制批准门）以及 OSO 明确覆盖该分流、始终走完整 artifacts 流程。

#### Scenario: 文档覆盖三版本与既存问题

- **WHEN** 阅读该文档
- **THEN** 能分别查到 v5、v6、v7 的行为差异，三个既存问题及各自处置，以及「OSO 始终走完整 artifacts 流程」的明确表述

### Requirement: SDD 工作目录不污染仓库状态

委托后在 v7 环境执行 apply 时，SDD 的 `.superpowers/sdd/` MUST 自动创建且 MUST NOT 出现在 `git status` 中。

#### Scenario: 工作目录被忽略

- **WHEN** v7 环境下完成一次 apply 并执行 `git status`
- **THEN** `.superpowers/sdd/` 不出现在未跟踪文件列表中（由 SDD 或模板 `.gitignore` 覆盖）
