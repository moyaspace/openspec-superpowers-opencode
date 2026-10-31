> Base: release/1.1

## Why

`/opsx-propose` 与 `/opsx-finish` 目前只支持以 `main` 为 base：propose 文本要求「commit → 回 main」「检查 main 是否有未提交更改」，finish 的 Step 6a 默认「通常是 main 或 master」。在 `release/1.1` 等维护分支上工作时，AI 会被引向 `git rebase main` / `git checkout main && git merge`，把维护线提交重放回 2.0.0 线，属于历史污染级别的错误；而 `oso init` 会把这两个命令部署给所有用户。同时 V1 模板的 `opsx-finish` 仍按语言猜测试命令（BUG007），`opsx-propose` 与实战版不一致（BUG008）。本 change 一次性修复 base 分支硬编码（F002）并补齐模板一致性。

## What Changes

**base 记录机制（F002，代码）**
- From: `ensure-worktree` 从当前 HEAD 切分支但**不记录** base；`registry.add()` 整条替换条目，无 `baseBranch` 字段。
- To: `RegistryEntry` 新增可选 `baseBranch?: string`；`add()` 改**合并语义**（保留已有字段、不写 `undefined` 空键）；propose/ff/new 各自在切 worktree 前读出 base、在注册步用 `registry add --base` 写入（唯一写入点；`ensure-worktree` 不读不写 base）；`openspec list --json`（shim `mergeListJson`）在输出中注入 `baseBranch`，供 finish 读取。
- Reason: base 事后不可追溯，finish 只能靠猜 `main`。
- Impact: 非破坏性（可选字段 + 合并语义，不带 `--base` 时行为不变）。

**opsx 命令文本（F002，模板 5 条命令）**
- From: `opsx-propose`（4 处）、`opsx-finish`（Step 6a + 3 处选项注释）、`opsx-ff`（3 处）、`opsx-new`（3 处）、`opsx-continue`（1 处）硬编码 `main`；工具名 `AskUserQuestion`（错误写法）5 处。
- To: 改为「原分支 / 当前分支」；**propose / ff / new 三条创建型命令**统一在「创建 worktree 之前」从项目根读出 base（2d / 3d，只读），并各自在 `registry add` 时用 `--base "<BASE_BRANCH>"` 写入注册表（propose 为 4a、ff 为 4a、new 为 5a），Output 展示「基础分支」；finish 重写 Step 6a（读 `openspec list --json` 的 `baseBranch` → 问用户 → STOP，不默认 main）+ 新增「方向约束（MUST）」段 + `<base>` → `<base-branch>`；工具名统一 `question`。
- Reason: 文本不告诉 AI，导致 `git checkout main`。
- Impact: `oso init` 后所有用户的 `/opsx-*` 行为对齐；`main` 为 base 的既有流程不回归。

**opsx-finish Step 3b（BUG007）**
- From: template 的 `opsx-finish.md` Step 3b 按语言猜测试命令（`go.mod` → `go test ./...`），环境缺失被判为回归。
- To: 用 V1 实战版整文件替换，Step 3b 改为「项目自带入口优先（makefile test: → CI 显式命令 → 项目文档），候选冲突询问用户；失败先甄别环境类再判回归；语言默认命令兜底」；还原 `{{SUPERPOWERS_BASE_PATH}}` skill 路径。
- Reason: 收尾假失败。
- Impact: 仅 `template/.opencode/commands/opsx-finish.md`。

**opsx 命令一致性（BUG008）**
- From: template 的 `opsx-propose` 缺 Step 5 全量 artifact 循环与 Output 计数（`opsx-ff` 已具备），收尾为 Guardrails；`opsx-new` 是脚手架命令，本就不生成 artifacts。
- To: 把实战版三块（Step 5 全量 artifact 循环 + TodoWrite、Output 计数写法、Artifact Creation Guidelines）同步进 `opsx-propose.md`；`opsx-ff` 核对即可；`opsx-new` 保持脚手架，不移植三块。
- Reason: `oso init` 得到的 propose 可能漏生成 `applyRequires` 中的 artifact。
- Impact: 仅 `template/.opencode/commands/opsx-propose.md`（`opsx-ff` 核对无改动）。

## Capabilities

### New Capabilities
- `multi-branch-base`: 以当前分支为 base 的工作流——propose/ff/new 都在切 worktree 前读出 base、在 `registry add` 时用 `--base` 写入，finish 在 Step 6a 经 `openspec list --json` 读回而非默认 `main`；模板 5 条命令文本以当前/基础分支为 base；配套代码 `RegistryEntry.baseBranch` + `add()` 合并语义 + `registry add --base` + `mergeListJson` 注入。
- `opsx-finish-test-dispatch`: `opsx-finish` 的测试命令分派——项目自带入口优先、候选冲突询问、环境类失败先甄别、语言默认命令兜底，模板不含本机绝对路径且保留 `{{SUPERPOWERS_BASE_PATH}}`。
- `opsx-template-command-parity`: template 的 `opsx-propose` / `opsx-ff` 与实战版在 Step 5 全量 artifact 循环、Output 计数、Artifact Creation Guidelines 三块对齐；`opsx-new` 明确保持脚手架定位（不生成 artifacts）。

### Modified Capabilities
<!-- 无既有 capability 的需求被修改；openspec/specs/ 当前为空。 -->

## Impact

- 模板命令：`template/.opencode/commands/opsx-propose.md`、`opsx-finish.md`、`opsx-ff.md`、`opsx-new.md`、`opsx-continue.md`。
- 代码：`src/registry.ts`（`RegistryEntry` / `add()`）、`src/cli/index.ts`（`runEnsureWorktree` / `handleRegistry add`）。
- 测试：`test/registry.test.js`、`test/registry-utils.test.js`、`test/oso-acceptance-opsx-mapping.test.ts`、`test/setup-template-invariants.test.js`（新增断言见方案 §3.7）。
- 不触碰：`main`（2.0.0 线）、部署版 `.opencode/commands/`（T006 已定稿）、版本号 / npm publish / dist-tag（T005）、Superpowers v7（T004）。
