## Why

`/opsx-ff` 目前无条件调用 `openspec new change`，只要目标 change 已存在就以 exit 1 中断；重复执行且无变化时，`git commit` 也以 exit 1 中断。于是「中断后续跑」这一最主要的使用场景必然失败，用户只能先自行查状态或手工绕过。`/opsx-propose` 与 `/opsx-new` 撞名时同样只抛出上游错误，且 AI 可能自行重试。本变更让 ff 可从任意状态收敛到 apply-ready，并让两个创建型命令在撞名时主动中止、给出继续方式，消除上述三类失败。

## What Changes

**`/opsx-ff` 的创建步骤（Step 4）**
- From: 无条件执行 `openspec new change "<name>"`；change 已存在即 exit 1 中断
- To: 先 `test -d openspec/changes/<name>`；存在则跳过创建直接进入 Step 4a，不存在才创建，创建失败停下报告
- Reason: 支持中断后续跑、artifact 已完成后再执行、注册表被 reset 后恢复
- Impact: 非破坏性；仅改变 ff 在「change 已存在」时的行为

**`/opsx-ff` 的提交步骤（Step 6）**
- From: `git add -A && git commit -m "change: <name>"`，无暂存内容时整条命令 exit 1
- To: `git add -A` 换行 `git diff --cached --quiet || git commit -m "change: <name>"`，无变化时跳过提交且不视为失败
- Reason: 幂等重跑不应在最后一步中断
- Impact: 非破坏性；无变化时不再产生空提交

**`/opsx-ff` 的 Output**
- From: 只报告「已创建 `<N>` 个 artifacts」
- To: 增加「本次跳过 `<M>` 个已完成 artifacts」，并在 `<N>` 为 0 时提示可 `/opsx-apply` 或 `/opsx-archive`
- Reason: 让「零创建」看起来是成功而非异常
- Impact: 仅输出文案

**`/opsx-propose` Step 4 与 `/opsx-new` Step 5（创建语义）**
- From: 无条件 `openspec new change`，撞名时由上游报错
- To: 先 `test -d`；已存在则 **STOP**，报告并列出 `/opsx-continue`（逐个）与 `/opsx-ff`（一次补齐），不覆盖已有 change
- Reason: 用主动判断取代上游报错，避免 AI 自行重试
- Impact: 非破坏性；撞名时中止而非报错，worktree 可能已创建（可由 `/opsx-remove` 清理）

## Capabilities

### New Capabilities

- `opsx-change-convergence`: `opsx-ff` 从任意状态补齐 artifacts 的幂等收敛语义，以及 `opsx-propose` / `opsx-new` 在名字已被占用时主动中止的创建语义；统一以 worktree 内 `test -d openspec/changes/<name>` 作为存在性判据。

### Modified Capabilities

- `opsx-template-command-parity`: `Output` 的 artifact 计数要求扩展为同时报告跳过数并处理零创建；`Artifact Creation Guidelines` 的撞名建议改为由 Step 4 中止（不再建议 `/opsx-continue` 作为被动提示）。

## Impact

- 模板命令文件：`template/.opencode/commands/opsx-ff.md`、`template/.opencode/commands/opsx-propose.md`、`template/.opencode/commands/opsx-new.md`
- 测试：`test/setup-template-invariants.test.js` 新增断言（不改现有断言）
- 变更日志：`CHANGELOG.md` 的 `## [1.1.2]` → `### Changed` 追加一条
- 不改：`src/`（零改动）、`README.md` / `README.zh-CN.md`（归 T005）、现有测试断言、部署版 `.opencode/commands/`（gitignored）
- 运行时依赖与数据迁移：无
