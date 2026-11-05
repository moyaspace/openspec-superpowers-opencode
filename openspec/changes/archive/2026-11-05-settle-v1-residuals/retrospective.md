# Retrospective: settle-v1-residuals

> Written: 2026-11-06 (after verify passed)
>
> Commit range: `68b8b3e1e..b7992e40d`
>
> Worktree: `.worktrees/settle-v1-residuals` (branch `feature/settle-v1-residuals`)

---

## 0. Evidence

> 量化前置數據 — 後續 Wins / Misses bullets 直接引用本節，避免每行重複 [evidence: ...]。

- **Commit range**: `68b8b3e1e..b7992e40d` (21 commits)
- **Diff size**: +1695 / -186 lines across 23 files（`git diff --shortstat release/1.1...HEAD`）
- **Tasks done**: 39/39（`tasks.md` 中 `- [x]` = 39，`- [ ]` = 0）
- **Active hours**: ≈2.5h（首个 commit `63e0a183d` 00:41 → 末个 `b7992e40d` 03:13，本机时区同一夜间）
- **Subagent dispatches**: n/a — 仓库内无可核实的 SDD 派发记录（`.superpowers/sdd/` 仅含 `.gitignore`）
- **New external dependencies**: none（`package.json` / `package-lock.json` 在 `release/1.1...HEAD` 零 diff）
- **Bugs encountered post-merge**: n/a（尚未合并）
- **OpenSpec validate state at archive**: 待归档时确认（写本文件时未运行 `openspec validate`）
- **Test coverage signal**: 主套件 361 tests / 361 pass / 0 fail；elevated 5 tests / 5 pass / 0 fail（本次 `/opsx-finish` Step 3b 实测，`npm test` 退出码 0，两次全局 bin 守卫均报告「未被修改（7 个文件）」）

Commit chain（時序）:

```
68b8b3e1e docs: reposition the product narrative around orchestration   ← base
63e0a183d change: settle-v1-residuals
5c5e05715 docs(change): record ensure-worktree F/G decisions from decision doc
b5fb87a63 test: reproduce ensure-worktree residual bugs (RED)
63a352f6a test: resolve symlinks in ensure-worktree path assertions
ed70686e7 chore(openspec): mark Task 1 tasks complete
24a8a177b fix: harden ensure-worktree judgment
68059911d test: expand Windows 8.3 short paths in fixtures
6faae0864 chore(openspec): mark Task 2 tasks complete
3a0038a2e docs(commands): validate worktree placement before copying
e8eb33f22 chore(openspec): mark Task 3 tasks complete
b5195200c chore(test): settle global shim restore fallback
7400cf5b1 chore(openspec): mark Task 4 tasks complete
2751262f8 docs(schema): derive verify baseline from baseBranch
e6732f63c chore(openspec): mark Task 5 tasks complete
c20feaab8 docs(changelog): record 1.1.2 residual fixes
f06a2321a docs: align worktree creation doc with ensure-worktree behavior
292a7da47 docs(verify): refresh Task 6 evidence after doc fix
767ac3550 chore(openspec): mark Task 6 tasks complete
05ab1f51b fix: validate ensure-worktree names and post-validation
aa5c73ba6 fix(commands): use show-prefix for portable root check
b7992e40d docs: align evidence and bookkeeping                              ← head
```

---

## 1. Wins

- [evidence: `src/cli/index.ts` +422/-39, `test/cli.test.js` +252] 核心修复方向选对了：用 `git worktree list --porcelain` 登记簿 + `--show-toplevel` 后置校验替换 `fs.existsSync` 存在性判据。`ensure-worktree idempotency and branch safety` 这一组 14 个用例（含 8 种状态）在本次 finish 复跑中全绿，且每条用例都断言了「零副作用 / 零删改 / SHA 不变」。
- [evidence: `b5fb87a63`, verify.md §6.4] RED 是真红：先落 8 个失败用例（22 tests / 14 pass / 8 fail），再动实现。`24a8a177b` 才转 GREEN。这使「修了什么」与「修好了没有」由测试而不是叙述来界定。
- [evidence: `scripts/run-tests.mjs` 净删除 `restoreGlobalShim` / `findGlobalOso` / `OSO_SKIP_SHIM_RESTORE`, verify.md §5.1–5.3] GAP008 严格执行了「先取证后删除」：7 次连续 `npm test`、隔离审计 6 组测试文件、no-op 日志三条证据齐备后才删兜底。没有把「看起来冗余」当成「确定冗余」。
- [evidence: `test/setup-template-invariants.test.js` +100] 三份命令模板（`opsx-propose` / `opsx-ff` / `opsx-new`）的 worktree 就位校验不是靠人工 review 保证的，而是被不变量测试逐条锁住（`cd` 失败分支、两条只读校验、复制重试上限）。
- [evidence: `git diff release/1.1...HEAD -- package.json` 为空] 零新依赖、零 `main` 触碰、工作区最终干净。对发布前的收口变更是恰当的风险姿态。
- [evidence: `2751262f8`] GAP011 把 verify 的 commit 证据基准从硬编码的 `origin/main` merge-base 改为注册表 `baseBranch`，两份 `schema.yaml` 同步。本变更自己就是第一个受益者（base 是 `release/1.1`，不是 `main`）。

## 2. Misses

- 🟡 [painful | evidence: verify.md §6.1 记 353 tests；本次实测 361；`05ab1f51b` +300 行] **verify.md 的测试证据滞后于最终 HEAD。** §6.3 写下「文档-only 变更…未重跑」，但此后 `05ab1f51b`（`src/cli/index.ts` +184、两个测试文件 +155）与 `aa5c73ba6`（模板 + `test/setup-template-invariants.test.js` +13）都是行为改动。最终 `b7992e40d` 只回填了 9 行 verify.md，没有追加新一次全量跑数。结果是：归档时会附上一份比实际代码旧 8 个用例的测试证据。
- 🟡 [painful | evidence: verify.md 全文无 `Overall Decision` 段] **verify.md 缺三态结论。** schema 的 retrospective PRECHECK 依赖 `! grep -q '^- \[x\] ❌ FAIL'`，模板 `verify.md` 设计上有 `✅ PASS / ⚠️ PASS WITH WARNINGS / ❌ FAIL` 三选框，但本 change 的 verify.md 是「实现期证据文件」，两者形状不一致。本次只能按「无 FAIL 即放行」通过，verify 结论是隐式的而非显式的。
- 📌 [nit | evidence: `plan.md` 全文 checkbox 均为 `- [ ]`] **plan.md 与 tasks.md 双轨，完成度只能从 tasks.md 读。** plan.md 的 6 个 Task 共 40+ 个 Step 全部未勾选，实际完成情况靠 `tasks.md` 39/39 才可判断。两个文件都在 change 目录里，读的人需要知道「哪一份才是进度源」。
- 📌 [nit | evidence: 21 commits 中 6 个 `chore(openspec): mark Task N tasks complete`] **记账提交占 29%。** 每个 Task 固定产出「实现 commit + 记账 commit」两条，`git log` 的信号被稀释。若改为在实现 commit 内一并更新 tasks.md，21 条可压到 15 条左右，历史更可读。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1. 复现用例（RED） | 追加 `63a352f6a`（断言里解析 symlink）与 `68059911d`（Windows 8.3 短路径展开） | 平台事实：Windows 上 `%TEMP%` 与 `git rev-parse` 输出可能分别是 8.3 短路径与长路径，直接字符串相等会假红。plan 未预判夹具层面的路径规范化。 |
| 2. 判定函数与 `runEnsureWorktree` 重写 | `05ab1f51b` 追加了 plan 完全没有的一项：`ensure-worktree` **名称校验**（路径穿越 `../`、shell 元字符、嵌套路径一律拒绝）与更强的后置校验 | 实现过程中暴露的输入面风险：`ensure-worktree <name>` 的 `name` 直接参与 `path.join`，`plan.md` 只覆盖了「目录已存在」的 8 种状态，没有覆盖「名字本身是攻击面」。属于合理的范围扩大，但它只在实现期被发现，说明 plan 的威胁建模不完整。 |
| 3. 模板侧 worktree 就位校验 | plan 写的是 `git rev-parse --show-toplevel` 比对；最终 `aa5c73ba6` 改为 `--show-prefix`（相对当前 cwd 的根前缀） | 可移植性：`--show-toplevel` 返回绝对路径，在模板里与用户当前 cwd 拼出的相对路径比较时脆弱（盘符大小写、短路径）。`--show-prefix` 直接给出「从当前目录到仓库根」的相对段，判空即可，且跨平台一致。spec / design / CHANGELOG 在 `aa5c73ba6` 同步改写。 |
| 5. GAP011 verify PRECHECK | Step 5「以 `release/1.1` 为 base 实跑一次 verify」的结论以 `git log release/1.1..HEAD` 为准，commit 数在 verify.md §6.4 记为「12，后续提交会变化」 | 计划期记录的是当时快照（12），实际收尾时是 21。把会漂移的数字写成「以 git log 为准」比写死快照更稳。 |
| 6. 文档与全量回归 | 追加 `f06a2321a`（`docs/WORKTREE-CREATION.md` 与实现对齐）与 `aa5c73ba6` 的 CHANGELOG 修订 | 全仓搜索（Task 6 Step 3）发现文档仍描述旧版防御性清理行为，属于 Task 6 派生出的修复，plan 未列条目。 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（brainstorm.md 55 行；按用户「不要再讨论方案」指令只做记录与收敛，未重新提问，属用户指令优先） |
| superpowers:writing-plans                        | ✓（plan.md 144 行，含 Global Constraints / Review Focus / 6 Task 分步） |
| superpowers:using-git-worktrees                  | ✓（`.worktrees/settle-v1-residuals` + `feature/` 分支 + 注册表 `baseBranch=release/1.1`） |
| superpowers:subagent-driven-development          | ✗（无可核实派发记录，见下） |
| (transitive) superpowers:test-driven-development | ✓（`b5fb87a63` RED：8 个新用例失败 → `24a8a177b` GREEN） |
| (transitive) superpowers:requesting-code-review  | ✗（无 review 记录，见下） |
| superpowers:finishing-a-development-branch       | ✓（本次 `/opsx-finish` 正在执行该 skill 的收尾流程） |

> **Default expectation**: 全部 ✓。每個 skill 都是 schema 設計的一部分，
> 跳過屬於異常情境。任一項 ✗ 都必須在下方
> `### Deliberately Skipped Skills` subsection 提出原因與預防方案。

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill —— 没有 implementer / spec-reviewer / code-quality-reviewer 的派发与结论落盘。
  - **Why this cycle**: 可观察的证据是 `.superpowers/sdd/` 目录内只有 `.gitignore`（`Get-ChildItem -Recurse` 无其它文件），21 个 commit 呈「每个 Task 恰好一条实现 commit + 一条 chore 记账 commit」的形态（如 `24a8a177b` + `6faae0864`、`3a0038a2e` + `e8eb33f22`），没有任何 reviewer 产出的中间产物。触发条件不是「任务太小」——本变更 23 文件 / +1695 行并不小——而是实现路径直接走了单会话串行。
  - **How to prevent recurrence**: `CLAUDE.md trigger` —— 在 adopter 的 apply 阶段规则里加一条：**change 的 `git diff --stat` 预计超过 10 文件或 500 行时，必须在 `.superpowers/sdd/<task-id>/` 保留 implementer brief 与 reviewer 结论文件**，使 skill 使用可核验；否则 finish 阶段的 retro §4 必须按本形态记录 ✗。

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 整个 skill —— 没有独立的 code review 步骤与结论。
  - **Why this cycle**: 与上一条同源：没有 SDD 派发就没有 reviewer 会话，`verify.md` 全文最高只到「全量回归 + 残留搜索」（§6.1–6.4），没有 review 报告这一节。
  - **How to prevent recurrence**: `CLAUDE.md trigger` —— 与上一条合并落地：review 结论须落盘为 `openspec/changes/<name>/review.md`（或 `.superpowers/sdd/<task-id>/review.md`），由 verify 的 PRECHECK 检查其存在性；缺失即视为该 skill 未使用。

> **與 §6 Promote candidates 的關係**: 上述两条共享同一个 `How to prevent`（落盘证据 + PRECHECK 校验），按规则应 promote 到 §6 触发 schema 修改，不可累积成「常态」。

## 5. Surprises

- **`--show-toplevel` 不是模板里可移植的判据，`--show-prefix` 才是。** plan 与 design 都写的是 `--show-toplevel`，实现到模板层才发现绝对路径在不同 cwd / Windows 盘符下比对脆弱，`aa5c73ba6` 才改成 `--show-prefix`（返回「从 cwd 到仓库根」的相对段，判空即可）。这是一次「CLI 侧验证过的事实，搬到模板侧就不成立」的跨层失效。
- **「防止误删」的威胁面不止目录状态，还有名字本身。** plan 用 8 种目录状态覆盖了 BUG023–BUG026，但 `ensure-worktree <name>` 的 `name` 直接参与 `path.join`；路径穿越 / 元字符 / 嵌套路径这一整类风险直到 `05ab1f51b` 才被补上（+184 行实现、+155 行测试）。威胁建模漏了一个输入维度。
- **Windows 的 8.3 短路径会让「路径相等」类断言假红。** `68059911d` 与 `63a352f6a` 两条提交都只是在处理夹具层的路径规范化，不涉及产品逻辑。这说明「写一条比较路径的测试」在 Windows 上不是零成本动作。
- **删除一段"看起来冗余"的兜底，验证成本高于修复成本。** GAP008 的 `restoreGlobalShim()` 只有几十行，但为了证明它真的是 no-op 花了 7 次全量 `npm test`（verify.md §5.1，累计约 12 分钟测试时间）+ 6 组测试的隔离审计 + 一次临时探针插桩。这个成本比例是对的，但值得事先预期。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **测试证据必须回填到最终 HEAD，且「文档-only 未重跑」的声明要么追上最后一次行为改动，要么改成「上次全量跑在 commit X」** → **Promote to schema**（`superpowers-bridge-opencode` 的 verify instruction）
  > **Why**: 本 change 的 verify.md §6.1 停在 353 tests，之后 `05ab1f51b` 又加了 300 行代码与 8 个用例，最终归档会附上一份比代码旧 8 个用例的测试证据。这类滞后不会让测试变红，只会让归档的证据链说谎。
  > **How to apply**: 在 verify instruction 里加一条硬要求 —— 若 `git log <verify.md 最后一次改动>..HEAD` 非空且触及 `src/`、`test/`、`template/`，则 verify.md 的测试节必须重跑并更新，或在节首显式写「上次全量跑：<commit> @ <N> tests」并说明此后无行为改动。

- [ ] 🟡 **verify.md 必须有显式三态 Overall Decision，否则 retro 的 PRECHECK 无从判定** → **Promote to schema**（verify 模板 + retrospective PRECHECK）
  > **Why**: 本 change 的 verify.md 是「实现期证据文件」，没有 `Overall Decision` 段；retrospective 的 PRECHECK 是 `! grep -q '^- \[x\] ❌ FAIL'`，对一个不含该行的文件必然通过 —— 也就是「未验证」与「验证通过」在机器看来同义。
  > **How to apply**: verify 模板强制输出 `## Overall Decision` 与三个互斥 checkbox；PRECHECK 改为「必须命中 `^- \[x\] ✅ PASS` 或 `^- \[x\] ⚠️ PASS WITH WARNINGS`，否则 STOP」，把「缺失」从「通过」里区分出来。

- [ ] 🟡 **apply 阶段的 SDD / code-review 使用必须落盘可核验证据** → **Promote to project CLAUDE.md**（apply 阶段规则段）
  > **Why**: 本 change 23 文件 / +1695 行，规模上完全在 SDD 的适用区间内，但 `.superpowers/sdd/` 只剩一个 `.gitignore`，事后无法判断是真的并行派发过还是单会话串行。skill 是否被使用变成不可审计的。
  > **How to apply**: change 超过 10 文件或 500 行时，`.superpowers/sdd/<task-id>/` 必须保留 implementer brief 与 reviewer 结论；finish 前的 verify PRECHECK 检查其存在性。缺证据即按未使用记录进 retro §4。

- [ ] 📌 **plan.md 与 tasks.md 的进度职责需要二选一** → **Promote to schema**（writing-plans 的 plan 模板）
  > **Why**: plan.md 的 40+ 个 Step checkbox 全部空着，真正被维护的是 tasks.md（39/39）。两个文件同时存在于 change 目录，读者无法从文件形态判断哪一份是进度源。
  > **How to apply**: plan 模板要么去掉 Step 级 checkbox（明确「plan 是设计文档，进度只看 tasks.md」），要么规定 tasks.md 由 plan 的 Step 机械派生、只维护一份。不要两者并存且都可勾。

- [ ] 📌 **`chore(openspec): mark Task N tasks complete` 应并入对应实现 commit** → **One-off**（记录即可，不 promote）
  > **Why**: 本 change 21 条 commit 里 6 条是纯记账（29%），稀释了 `git log` 的可读性；但这属于个人提交习惯，不是流程缺陷，强行规定 commit 形状的收益不足以抵消约束成本。
  > **How to apply**: 下次同一人做同类 change 时，在实现 commit 里 `git add` 上 tasks.md 的勾选改动即可；不写进 schema 或 CLAUDE.md。