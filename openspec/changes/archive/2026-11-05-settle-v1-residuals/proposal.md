## Why

`ensure-worktree` 目前只凭 `fs.existsSync` 判断 worktree 是否存在，导致普通目录被当成合法 worktree、隔离静默失效；分支已存在时先 `git branch -D` 再重建，会丢失未合并提交；陈旧登记不 prune、复用不校验分支，提交可能落到错误分支。与此同时，模板 Step 3/4 缺少 worktree 就位后的只读校验与 `cd` 失败分支，verify PRECHECK 又用 `origin/main` 计算提交证据而在维护分支上严重失真。这些都是 1.1.2 发布前的硬阻塞项，必须在 T005 之前收口。

## What Changes

**`ensure-worktree` 判定（BUG023 / BUG024 / BUG025 / BUG026）**
- From: `:432` 仅 `fs.existsSync` 即返回成功；`:439-445` 分支被检出时直接 exit 0 但不建目录；`:448-456` 分支存在且未被检出时 `git branch -D` 后 `-b` 重建；创建/复用后无任何校验。
- To: 以 `git worktree list --porcelain` 为唯一登记源，按决策树处理 8 种状态；陈旧登记先 `git worktree prune`；分支存在且未被检出时挂回；创建/复用后做根目录、分支、`git-common-dir` 三项只读校验；普通非空目录/文件一律中止且零删改。
- Reason: 隔离静默失效与数据丢失都是 P0；假成功会导致模板死循环。
- Impact: 非破坏性；重跑（已就位）保持零副作用、零报错；只新增中止路径。

**模板 Step 3/4 的 worktree 就位校验（GAP010）**
- From: `cd .worktrees/<name>` 无失败分支；复制失败「重新执行复制再验证」无上限；不校验目录与分支。
- To: `cd` 失败即停；随后两项只读校验（`--show-prefix` 为空、`--abbrev-ref HEAD` 等于 `feature/<name>`）；复制重试上限 1 次；三份模板同步。
- Reason: CLI 修好前需要第二道保险；`cd` 失败时旧写法会死循环。
- Impact: 仅命令指令文本；不改变正常路径。

**`restoreGlobalShim()` 冗余判定（GAP008）**
- From: `scripts/run-tests.mjs` 的 `finally` 无条件调用 `restoreGlobalShim()` 兜底。
- To: 先按 backlog 三项证据验证（≥5 次运行、隔离核对、no-op 日志）；判定冗余则删除函数、`findGlobalOso()`、`OSO_SKIP_SHIM_RESTORE`、`finally` 调用与失败退出码逻辑；仍在污染则修污染源并保留兜底，状态记「部分完成」。
- Reason: GAP006 已删除 install 钩子，污染源头消失，但测试是否完全隔离尚未证明。
- Impact: 可能仅删死代码，也可能保留兜底；两种结果都需证据入 verify.md。

**verify PRECHECK 基准（GAP011）**
- From: `git log --oneline $(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null)..HEAD | wc -l`。
- To: 先 `openspec list --json` 取本 change 条目的 `baseBranch`；缺失时退回 `origin/main` 并在 verify.md §5 标注 `baseline: origin/main (registry had no baseBranch)`；再 `git log --oneline <base>..HEAD | wc -l`。
- Reason: 多 base 下 `origin/main` 把无关历史计入提交证据，后置写进 verify.md 的 commit range 失真。
- Impact: 仅 verify instruction 的 PRECHECK 文本；两份 `schema.yaml` 同步，不动 artifact 结构。

## Capabilities

### New Capabilities

- `worktree-isolation-safety`: `ensure-worktree` 的 8 状态判定、陈旧元数据 prune、分支复用、创建/复用后置校验，以及三份 OPSX 命令模板在 worktree 就位后的只读校验与复制重试上限。
- `test-run-global-isolation`: `npm test` 编排器对全局垫片的兜底策略——先验证测试已完全隔离，再决定删除或保留 `restoreGlobalShim()`，并把三条验证证据固化到 verify.md。

### Modified Capabilities

- `multi-branch-base`: 新增「verify 提交证据以本 change 的 `baseBranch` 为基准」要求；`baseBranch` 缺失时退化为 `origin/main` 并强制在 verify.md §5 记录所用基准。

## Impact

- 代码：`src/cli/index.ts`（`runEnsureWorktree`，必要时抽出可独立测试的判定函数）
- 模板：`template/.opencode/commands/opsx-propose.md`（Step 3a）、`opsx-ff.md`（Step 3a）、`opsx-new.md`（Step 4a）
- 脚本：`scripts/run-tests.mjs`（GAP008，按验证结论处理）
- schema：`template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 与 `openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 verify PRECHECK 文本
- 测试：`test/cli.test.js` 扩展 BUG023–BUG026 复现路径；`test/setup-template-invariants.test.js` 新增模板与 schema 断言
- 文档：`CHANGELOG.md` 的 `## [1.1.2]` → `### Fixed`；GAP008 涉及 `docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md` 时同步
- 不改：`Step 2` git 预检块、`README*.md`、`.opencode/commands/`（gitignored）、V2.0 线、`apply.requires` 与 artifact 图
- 运行时依赖与数据迁移：无
