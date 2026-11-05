# settle-v1-residuals — Brainstorm

> 说明：本变更的全部方案已在开工块与 `local/docs/2026-11-05_opsx-ensure-worktree-decision.md` 中裁决。按用户「不要再讨论方案」的指令，本节只做记录与收敛，不重新提问。

## Design Summary

本次变更是 1.1.2 发布前的遗留项收口，共 7 项：4 个 `ensure-worktree` 缺陷（BUG023–BUG026）、1 项模板侧 worktree 就位校验缺口（GAP010）、1 项 `restoreGlobalShim()` 冗余判定（GAP008）、1 项 verify PRECHECK 基准失真（GAP011）。

核心设计只有一条：`ensure-worktree` 不再用 `fs.existsSync` 判断「是不是 worktree」，而是把 `git worktree list --porcelain` 的登记簿 + 进入目录后的 `--show-toplevel` 自检作为唯一事实来源；分支已存在时挂回而不是删除重建；创建/复用后做只读后置校验。模板侧加同一判据的只读保险；verify 的 commit 证据改用注册表里本 change 的 `baseBranch`。

## Alternatives Considered

### 方案 A：保留 `fs.existsSync`，补 `git rev-parse --is-inside-work-tree`

- **做法**：目录存在时再用 `--is-inside-work-tree` 判断是否在某个工作树内。
- **优点**：改动最小，只加一行判断。
- **缺点**：普通子目录（`.worktrees/demo` 是普通目录）里 `--is-inside-work-tree` 同样返回 true，因为它能向上摸到主仓库的 `.git`，无法区分「真 worktree」与「主仓库内的普通目录」。
- **为何未采用**：判据本身不成立，无法修复状态 D（BUG023）。

### 方案 B：`ensure-worktree` 输出结构化 JSON，由模板判断

- **做法**：CLI 返回 `{ status: 'reuse'|'create'|'abort', path, branch }`，三份模板解析后分别处理。
- **优点**：模板可精确区分每种状态并给出不同提示。
- **缺点**：改动 CLI 的对外输出契约，需同步三份模板的解析、错误处理与测试；超出「只动 Step 3/4 获取段落」的范围。
- **为何未采用**：收益有限、范围膨胀，且模板仍需要自己的只读校验作为第二道保险。

### 方案 C：登记簿 + `--show-toplevel` 自检 + prune + 分支挂回 + 后置校验（采用）

- **做法**：以 `git worktree list --porcelain` 为唯一登记源；按文档 §4 决策树处理 8 种状态；陈旧元数据先 `git worktree prune` 再重读；分支存在且未被检出时 `worktree add <dir> <branch>` 挂回；创建/复用后校验根目录、分支、`git-common-dir`。
- **优点**：只读判据与 git 语义一致；不做破坏性删除；后置校验把错误前移到 Step 3；重跑零副作用。
- **缺点**：需要新增若干只读 git 调用与针对 8 种状态的测试。
- **为何未采用**：无，本方案胜出。

## Agreed Approach

采用方案 C。CLI 侧按 `local/docs/2026-11-05_opsx-ensure-worktree-decision.md` §4/§5 重写 `runEnsureWorktree`；模板侧按该文档 §8 加两项只读校验、`cd` 失败分支与复制重试上限 1 次；GAP008 按「先验证后删除」处理；GAP011 把 verify PRECHECK 的基准改为注册表 `baseBranch`。

## Key Decisions

1. **D1 只信登记簿**：`git worktree list --porcelain` 是「是不是 worktree」的唯一事实来源；`fs.existsSync` 只用于判断「路径是否存在/是否为空」，不用于判断 worktree 合法性。
2. **D2 普通目录处置**：空目录清理后按正常流程创建；非空目录或文件一律中止，零删改。
3. **D3 分支复用**：分支存在且未被检出时用 `worktree add <dir> <branch>` 挂回，保留其上全部提交；禁止 `git branch -D feature/<name>`。
4. **D4 后置校验**：创建/复用后校验 `realpath(--show-toplevel) == realpath(targetDir)`、`--abbrev-ref HEAD == feature/<name>`、`realpath(--git-common-dir) == realpath(repoRoot/.git)`，任一失败即中止并指明失败项。
5. **D5 模板保险**：三份命令在 `ensure-worktree` 之后、复制之前做两项只读校验（根目录、分支），`cd` 有失败分支，复制重试上限 1 次。
6. **D6 GAP008 先验证后删除**：连续 ≥5 次运行 + 隔离核对 + no-op 日志三条证据齐备才删 `restoreGlobalShim()` 及其配套；若发现仍污染，修污染源、兜底保留、状态记「部分完成」。
7. **D7 GAP011 基准**：verify PRECHECK 先取本 change 的 `baseBranch`，缺失才退回 `origin/main` 并在 verify.md §5 标注基准；两份 `schema.yaml` 同步改。

## 已裁决（用户确认）

用户已裁决：**参照 `local/docs/2026-11-05_opsx-ensure-worktree-decision.md` 处理**。据此：

- **状态 F（分支被其他 worktree 检出）→ ABORT（非 0 退出）**。`test/cli.test.js:129` 的既有断言 `code === 0` 改为 `code !== 0`；「分支 SHA 不变」「目标目录不存在」两条断言保留。
- **状态 G（分支存在但未被检出）→ 挂回分支，保留 SHA**。`test/cli.test.js:146` 的既有断言 `SHA === base` 改为 `SHA === 删除前 SHA`；「worktree 已创建」「exit 0」两条断言保留。
- **其余既有用例**（`inside the target worktree exits 0 without recreating or deleting`）完全兼容，不动。
- **GAP008 的删除条件仍是验证结论**，不是预设结论：本变更可能以「保留兜底 + 记部分完成」收尾；tasks 与 spec 按条件分支写。
