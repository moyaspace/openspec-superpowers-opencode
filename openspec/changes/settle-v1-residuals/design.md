## Context

`ensure-worktree` 是 `/opsx-propose`、`/opsx-ff`、`/opsx-new` 在 Step 3/4 创建隔离工作树的入口。它的契约是「确保 `.worktrees/<name>` 是一个检出了 `feature/<name>` 的真实 git worktree」。当前实现（`src/cli/index.ts:414-472`）用 `fs.existsSync` 判断存在性，覆盖了 8 种状态里的 2 种，并包含一条会丢提交的破坏性动作（`git branch -D`）。

同时，三份命令模板在 `ensure-worktree` 之后直接 `cd` 与复制，没有 worktree 就位后的只读校验；`cd` 失败时「复制 → 验证 → 重新复制」无上限。verify artifact 的 PRECHECK 用 `origin/main` 计算提交证据，在 `release/1.1` 等维护分支上严重失真。`scripts/run-tests.mjs` 的 `restoreGlobalShim()` 在 install 钩子退役后可能已成冗余死代码。

本变更只收口这些遗留项，不做 V2.0 同源改动，也不改 Step 2 的 git 预检块。

## Goals / Non-Goals

**Goals:**

- `ensure-worktree` 只以 `git worktree list --porcelain` 的登记 + 目标目录 `--show-toplevel` 自检作为判据，正确覆盖 8 种状态。
- 陈旧元数据先 `git worktree prune`；分支存在且未被检出时挂回，绝不删除含提交的分支。
- 创建/复用后做只读后置校验，错误在 Step 3 立即暴露。
- 三份模板在 worktree 就位后做两项只读校验，`cd` 有失败分支，复制重试限 1 次。
- GAP008 以证据决定删除或保留 `restoreGlobalShim()`，不预设结论。
- 两份 `schema.yaml` 的 verify PRECHECK 以 `baseBranch` 为主路径，缺失时退化并记录基准。
- `npm test` 全绿且用例数不少于基线（342 主套件 + 5 elevated）。

**Non-Goals:**

- 不改 `Step 2`（git 预检块）；HEAD/首次提交问题记录到 `local/notes/opsx-step2-git-preflight.md`，不在本变更修。
- 不改 `README.md` / `README.zh-CN.md`（归 T005）。
- 不改 `.opencode/commands/`（gitignored 部署产物）。
- 不改 V2.0 线（`main`）的 BUG009/010/014–017。
- 不改 `apply.requires` 结构与 artifact 图；GAP011 只改 verify instruction 的 PRECHECK 文本。
- 不删除任何用户文件；不删除含提交的分支；不抢占已被其他 worktree 检出的分支。

## Decisions

### D1：登记簿是唯一事实来源

`runEnsureWorktree` 先执行 `git worktree list --porcelain` 解析出 `{path, branch}` 列表（复用现有 `readWorktreeEntries`），再按文档 §4 决策树判定。`fs.existsSync` 只回答「路径存不存在」，`--is-inside-work-tree` 不参与判定（普通子目录同样为 true）。

顺序：先认「已经对了」（零副作用）→ 再查「被谁占着」→ 最后才创建；破坏性动作排在所有冲突排除之后。

### D2：8 种状态与动作

| 状态 | 判定 | 动作 |
|---|---|---|
| A 已在该 worktree 内、分支正确 | 当前 `--show-toplevel` == target 且分支 == `feature/NAME` | REUSE |
| B 目录存在、真 worktree、分支正确 | 登记有目标 + 目录在 + `--show-toplevel`==自己 + 分支对 | REUSE |
| C 目录存在、真 worktree、分支不对 | 登记有 + 目录在 + 分支 != `feature/NAME` | ABORT（打印当前分支） |
| D 目录存在但不是 worktree | 登记无 + `--show-toplevel` != 自己 | 空目录 → 删除后创建；非空目录/文件 → ABORT（零删改） |
| E 登记还在但目录被删 | 登记有 + 目录不存在 | `git worktree prune` → 重读登记 → 按 G/H 处理 |
| F 目录不存在、分支被检出在别处 | 登记里 branch == `refs/heads/feature/NAME` 且路径不是 target | ABORT |
| G 目录不存在、分支存在未被检出 | `show-ref --verify` 成功 | `worktree add target feature/NAME`（挂回，保提交） |
| H 全新 | 无目录、无登记、无分支 | `worktree add target -b feature/NAME` |

### D3：后置校验（A/B/G/H 共用）

创建/复用成功后校验三项，任一失败即 `process.exit(1)` 并指明失败项：

1. `realpath(git -C target rev-parse --show-toplevel)` == `realpath(target)`
2. `git -C target rev-parse --abbrev-ref HEAD` == `feature/NAME`
3. `realpath(git -C target rev-parse --git-common-dir)` == `realpath(repoRoot/.git)`

复用时可额外报告 `git -C target status --porcelain` 非空（只警告，不重置）。

### D4：可独立测试的判定函数

把判定抽成纯函数优先：`decideWorktreeAction(entries, targetDir, branch, fsFacts)` → `{action: 'reuse'|'create'|'abort', reason?}`，由 `runEnsureWorktree` 负责执行 git 命令与退出码。这样 8 种状态可以单测覆盖，而仓库级测试仍走真实 `git`。若抽取成本过高，至少保证每种状态有一个 `test/cli.test.js` 用例走真实仓库。

### D5：模板侧只读保险

三份模板的 Step 3a / 3a / 4a 统一为：

```text
3a-1  ensure-worktree <name>（失败 → 停下报告）
3a-2  cd .worktrees/<name> || { echo "STOP: cd 失败"; exit 1; }
3a-3  test "$(git rev-parse --show-toplevel)" = "$(pwd -P)" || { echo "STOP: 不是独立 worktree"; exit 1; }
3a-4  test "$(git rev-parse --abbrev-ref HEAD)" = "feature/<name>" || { echo "STOP: 分支不对"; exit 1; }
3a-5  复制 schemas/config → test -f 三项（失败重试最多 1 次，仍失败停下）
3a-6  codegraph init（失败不阻断）
```

`opsx-new.md` 的编号是 4a-1…4a-6，内容相同。

### D6：GAP008 先验证后删除

按 backlog 三条关闭条件执行，缺一不可：连续 ≥5 次 `npm test` 后全局垫片 `TOOL_DIR` 仍指向正式安装版且 `openspec-shim-e2e` 稳定收集 3 条；逐个核对调用 `installShims()` 的测试，确认 bin 定位已隔离；在恢复处临时加日志证明恢复前后一致（no-op）。三条齐备才删除 `restoreGlobalShim()` / `findGlobalOso()` / `OSO_SKIP_SHIM_RESTORE` / `finally` 调用与失败退出码逻辑，并同步文档。若发现仍在污染，修污染源、保留兜底、状态记「部分完成」。

### D7：GAP011 verify 基准

两份 `schema.yaml` 的 verify PRECHECK 第 1 项改为：

```text
base=$(openspec list --json | 取本 change 的 baseBranch)
if 缺失: base=origin/main; 在 verify.md §5 标注
        baseline: origin/main (registry had no baseBranch)
git log --oneline "$base"..HEAD | wc -l
```

`src/registry-utils.ts` 的 `findProjectRoot` 用 `--git-common-dir`，worktree 内可解析到项目根注册表；`mergeListJson` 经 `withBaseBranch()` 注入 `baseBranch`；`openspec list --json` 是唯一读取路径，不直接解析注册表文件。

### D8：测试与文档落点

- `test/cli.test.js` 的 describe `ensure-worktree idempotency and branch safety` 内扩展 BUG023–BUG026 用例。
- `test/setup-template-invariants.test.js` 新增：三份模板 Step 3/4 含两条校验命令；两份 `schema.yaml` 的 verify PRECHECK 不以 `origin/main` 为主路径。
- `CHANGELOG.md` 的 `## [1.1.2]` → `### Fixed` 补 BUG023–BUG026、GAP008、GAP010、GAP011 条目。

## Risks / Trade-offs

- **[既有测试断言与 BUG024 冲突]** → `test/cli.test.js:146` 的 `normal path deletes a stale branch and creates the worktree` 断言残留分支被删除并在当前 HEAD 重建（SHA == base），与 BUG024「分支 SHA 与删除前一致」互斥。缓解：重写该条用例的分支断言，保留其创建 worktree 的断言；apply 前向用户确认这是「不得修改既有用例断言」的必要例外。**不修改前两条既有用例（幂等、被别处检出时跳过）的断言。**
- **[`worktree prune` 可能清理用户预期外的失效登记]** → 只清理「目录已不存在」的登记，不碰磁盘文件；prune 后重读登记再判定，避免误删。
- **[空目录删除的边界]** → 只删「存在、是目录、且为空」的目标路径；非空目录与文件一律中止，零删改。
- **[GAP008 结论不确定]** → 可能以保留兜底收尾；tasks/spec 按条件分支写，不把「删除」当必然结果。
- **[两份 schema.yaml 是独立文件]** → 必须同步改；用测试断言锁住两份的 PRECHECK 口径，防止 `oso init` 下发版与本仓库自用版分叉。注意：仓库根的 `openspec/schemas/` 被 `.gitignore:44` 排除、不会被提交，干净 checkout / CI 中可能不存在；`template/openspec/schemas/...` 才是被跟踪的下发源。测试应对 `template/` 副本无条件断言，对仓库根副本采用「存在则断言、缺失则跳过并在输出中说明」的策略（或由 CI setup 先复制），避免在 CI 里因文件缺失而误红。
- **[Windows 路径大小写/realpath]** → 复用现有 `samePath` 的规范化策略（Windows 下转小写），后置校验同样走规范化比较。

## Migration Plan

1. 先补 `test/cli.test.js` 的复现用例（RED）。
2. 重写 `runEnsureWorktree` 判定（GREEN），保留既有正常路径输出文案。
3. 改三份模板与两份 `schema.yaml`，补 `setup-template-invariants` 断言。
4. 执行 GAP008 三条验证，按结论删除或保留。
5. 跑 `npm test`（≥5 次用于 GAP008 证据）与全量回归，更新 `CHANGELOG.md`。
6. 回滚策略：改动集中在 CLI 判定、模板文本与 schema 文本，无数据迁移；如回归失败按文件级 `git checkout` 回退。

## Open Questions

- 既有测试 `test/cli.test.js:146` 的断言必须重写才能满足 BUG024；这是执行块「不得修改既有用例的断言」与 backlog 关闭条件的直接冲突。**需在 apply 前向用户确认**，不在本变更内自行弱化其他断言。
- GAP008 的最终状态取决于验证结果：删除（完成）或保留 + 记「部分完成」。verify.md 必须写入三条证据。
