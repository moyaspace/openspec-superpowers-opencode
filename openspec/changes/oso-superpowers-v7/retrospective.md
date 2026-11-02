# Retrospective: oso-superpowers-v7

> Written: 2026-11-02 (after verify passed)
> Commit range: `b4ba0a098..aa07454a0`
> Worktree: `.worktrees/oso-superpowers-v7`（base `release/1.1`）

---

## 0. Evidence

> 量化前置數據 — 後續 Wins / Misses bullets 直接引用,避免每行重複 [evidence: ...]。

- **Commit range**: `b4ba0a098..aa07454a0` (32 commits)
- **Diff size**: +2498 / -979 lines across 52 files
- **Tasks done**: 66/66（`- [x]` = 66，`- [ ]` = 0，`[~]` = 0；`plan.md` 亦无 `[~]`）
- **Active hours**: 跨 34.7h（2026-11-01 01:33 → 2026-11-02 12:12，跨 2 天；纯动手时长未单独记录）
- **Subagent dispatches**: `.superpowers/sdd/plan/` 下 10 个 `task-*-brief.md`、10 个 `task-*-report.md`、16 个 `review-*.diff`（SDD 控制器实际调度证据）
- **New external dependencies**: none（`package.json` / `package-lock.json` 相对 base 无 diff）
- **Bugs encountered post-merge**: none（尚未合并）
- **OpenSpec validate state at archive**: pass（12/12 valid，0 failed；`multi-branch-base` 2 条 INFO 属既有 spec 的长度提示）
- **Test coverage signal**: `npm test` → typecheck + build + 305 主套件 + 5 elevated 全绿，0 fail；全局 bin 守卫（7 文件）未被修改

Commit chain（時序，節選關鍵節點）：

```
b4ba0a098 (base) oso-template-base-branch: archive change
83e65ca51 change: oso-superpowers-v7
eb417bfc8 test: forbid cross-major lock fallback (RED)
0bf7df463 fix(discovery): select lock file by exact major only (BUG012)
69389992e fix(setup): report unsupported Superpowers major instead of wrong lock (BUG012)
1cfb38334 chore(lock): refresh skills.lock.v6 to Superpowers v6.4.2 (BUG013)
6bb593e01 feat(lock): add skills.lock.v7 for Superpowers v7.0.1 (F001)
f81436abc feat(template): delegate opsx-apply to upstream SDD for v6+ (F001)
824639b32 feat(verify): report bash availability for SDD scripts (F001)
1f166c7cb ci: include skills.lock.v7 in tarball checks (F001)
c35578334 docs: extend compatibility guide to v5/v6/v7 (F001)
3994a781e docs(template): unify question tool, DONE statuses, and 13-command count
737c81675 docs(template): define CC/OMO abbreviations instead of bare [CC]
7713ea0b6 fix(registry): preserve createdAt when re-adding an existing entry
7db126665 fix(cli): make ensure-worktree idempotent and avoid deleting checked-out branches
8fd870687 chore(change): mark 12.1 and 12.5 verified in the real v7 environment
0dc27a999 chore(change): mark 12.9 verified via isolated HOME with v6.4.2
524923b89 chore(change): mark 12.4 verified by the demo apply run
aa07454a0 chore(change): mark 12.2 verified by fault-injection apply
```

---

## 1. Wins

- [`eb417bfc8` → `0bf7df463`；`.superpowers/sdd/plan/task-2-red-output.txt`] BUG012 严格走 RED → GREEN：先让「major 8 不得回退」的新用例失败并留存原始 RED 输出，再改 `selectLockFile` 只做精确匹配，避免把缺陷写成规格。
- [`6bb593e01`、`1cfb38334`、design D6] 两份 lock 清单的 hash 全部在目标 commit 的真实文件上脚本重算，并与开工参考值逐条对照；未手抄、未沿用旧值。
- [`8fd870687`、`0dc27a999`、`524923b89`、`aa07454a0`] v7.0.1 / v6.4.2 的真实环境验收（AC1、AC2、BUG013、`.superpowers/sdd/` 不入 `git status`、三脚本经 `bash <脚本>` 调用）全部实跑并留提交证据，没有用「逻辑等价」代替实跑。
- [`4cd5e1562`、`fbf08a9a0`] 委托改造后补了模板一致性测试，把「Step 5/6 委托正文」「不得出现 [CC] Subagent 语法」「v5 分支零改动」钉成可回归断言。
- [`824639b32`、`ea3991a37`] bash 检测新增 `warn` 状态而非用 `fail` 冒充 ⚠，`allPass` 仍为真，既有状态断言同步更新。
- 全量 Gate 一次通过：`npm test` 305 主套件 + 5 elevated 全绿，全局 bin SHA-256 守卫前后一致（`docs/testing.md` 的标准 Gate 可重复执行）。

## 2. Misses

- 🟡 [evidence: `docs/testing.md` §1 写「278 主套件」，实际本次运行 305 tests] 测试计数文档已滞后，读者按文档估算耗时会偏。属于文档漂移，不阻塞。
- 🟡 [evidence: verify instruction PRECHECK 要求 `git merge-base HEAD origin/main`；实际 base 为 `release/1.1`，`origin/release/1.1` 不存在] schema 的 verify 口径与本仓库「多 base 分支」设计不一致：按 `origin/main` 算是 113 commits，按真实 base 算是 32 commits。
- 📌 [evidence: `openspec validate` → `multi-branch-base` requirements[0]/[3] > 500 字符] 既有 spec 的 Requirement 过长，INFO 级提示长期存在，未在本次清理。
- 📌 [evidence: `template/skills.lock.v5.json` 未改；design Non-Goals 明写「v5 拼凑值不修」] v5 基线仍不可信，只是被文档标注为「不得作准确基线」。
- 📌 [evidence: `git branch -r` 无 `origin/release/1.1`] base 分支无远端跟踪，收尾时 base 只能从注册表读取，无法用远端交叉校验。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1–12 之外 | 追加修复 `ensure-worktree` 幂等性（`7db126665`，见 `.superpowers/sdd/plan/bug7-ensure-worktree-fix.md`） | apply 过程中发现「已在目标 worktree 内重跑会误删分支」，属收尾流程的安全缺陷，就地修复并补测试 |
| 1–12 之外 | 追加修复注册表 `createdAt` 被覆盖（`7713ea0b6`，见 `.superpowers/sdd/plan/registry-createdat-fix.md`） | 收尾需要复述 base 与创建时间，re-add 丢失 `createdAt` 会破坏审计信息 |
| Task 10 | 依据用户当条指令改 `opsx-finish.md` 措辞，并同步模板一致性守卫 | 任务本身即【用户指挥】追加范围，未扩权到部署版 `.opencode/commands/` |
| Task 12 | 12.1/12.2/12.4/12.5/12.9 由用户在真实 v7 / v6.4.2 环境实跑后勾选 | 设计 Non-Goals 明写 AI 不自行切换用户缓存；AI 只记录证据，不代跑 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（`brainstorm.md`，含 7 个方案对比与 Agreed Approach） |
| superpowers:writing-plans                        | ✓（`plan.md`，12 个 Task 的 micro-task 分解） |
| superpowers:using-git-worktrees                  | ✓（`.worktrees/oso-superpowers-v7` + `feature/oso-superpowers-v7` + 注册表条目） |
| superpowers:subagent-driven-development          | ✓（`.superpowers/sdd/plan/` 下 10 brief / 10 report / 16 review 包） |
| (transitive) superpowers:test-driven-development | ✓（`eb417bfc8` RED → `0bf7df463` GREEN，RED 输出留存） |
| (transitive) superpowers:requesting-code-review  | ✓（16 个 `review-*.diff` + `final-review-b4ba0a098..HEAD.diff`） |
| superpowers:finishing-a-development-branch       | ✓（本次 `/opsx-finish` 正在执行） |

### Deliberately Skipped Skills

（无 — 所有 apply 阶段 skill 均已使用。）

## 5. Surprises

- **base 无法从远端交叉校验**：`git branch -r` 只有 `origin/main` / `github/main`，`origin/release/1.1` 不存在；base 只能依赖 `openspec/oso-change-registry.json` 的 `baseBranch`。这解释了为何 Step 6a 必须「禁止默认推断」。
- **PRECHECK 口径与仓库现实脱节**：verify instruction 的 `git merge-base HEAD origin/main` 在 base=`release/1.1` 时给出 113 commits 的噪声值，真实 change 范围是 32 commits。指令层面对多 base 分支的支持仍不完整。
- **测试数已增长到 305**：`docs/testing.md` 的 278 是旧快照，标准 Gate 的实际覆盖面比文档描述更宽。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **verify 的 PRECHECK 必须从注册表 `baseBranch` 取 base，不得硬编码 `origin/main`/`origin/master`** → **Promote to schema**（`superpowers-bridge-opencode` 的 verify.instruction）
  > **Why**: 本次 `origin/main` 与真实 base `release/1.1` 相差 81 个 commit，PRECHECK 输出的「commit 证据」会严重失真；多 base 分支是仓库既有设计（`multi-branch-base` spec）。
  > **How to apply**: 每当 verify artifact 需要计算 `base..HEAD` 时，先读 `openspec/oso-change-registry.json` 的 `baseBranch`，读不到再问用户，禁止默认 `main`。

- [ ] 🟡 **测试计数类文档必须由命令产出，不手写** → **Promote to project CLAUDE.md / `docs/testing.md` 维护规则**
  > **Why**: `docs/testing.md` §1 写 278，实际 `npm test` 报 305 tests；手写数字每次新增用例都会再次漂移。
  > **How to apply**: 修改 `test/*.test.js` 或升级测试框架后，同步更新 §1 命令速查表中的计数；或改为「以 `npm test` 实际输出为准」。

- [ ] 📌 **缺陷被固化成断言的用例，应在修复时单独审计** → **Promote to memory**（type: feedback）
  > **Why**: `test/setup-discovery.test.js` 曾断言「major 7 → v5 lock」，把 BUG012 的静默回退当作规格；若只改实现不改断言，测试会保护缺陷。
  > **How to apply**: 修 BUG 时先 grep 测试中是否把旧行为写成期望值，RED 步骤必须包含「旧断言反转」，而不是新增用例绕过旧断言。

- [ ] 📌 **base 分支无远端跟踪时，收尾前显式声明校验来源** → **One-off**（记录即可）
  > **Why**: `origin/release/1.1` 不存在，本次 base 只来自注册表；这是一次性环境事实，不是通用规则。
