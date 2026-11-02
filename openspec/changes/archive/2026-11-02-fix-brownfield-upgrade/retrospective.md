# Retrospective: fix-brownfield-upgrade

> Written: 2026-11-03 (after verify passed)
> Commit range: `70d022967..d817b444b` (18 commits)
> Worktree: `.worktrees/fix-brownfield-upgrade` (branch `feature/fix-brownfield-upgrade`)

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用，避免每行重复 [evidence: ...]。
> 冷写场景（retro 写于 cycle 结束之后一段时间），只用 `git log` + `tasks.md` + commit messages 也应能重建本节。

- **Commit range**: `70d022967..d817b444b` (18 commits)
- **Diff size**: +1588 / −96 lines across 23 files
- **Tasks done**: 45/45（`grep -c '^\s*- \[x\]' tasks.md` → 45；`- [ ]` → 0）
- **Active hours**: ≈4h（首 commit `24783fa43` 2026-11-02 23:54 → 末 commit `d817b444b` 2026-11-03 03:51，连续时段无跨日空档）
- **Subagent dispatches**: n/a（commit chain 与 artifact 中无子代理调度痕迹）
- **New external dependencies**: none（`package.json` devDependencies 未变）
- **Bugs encountered post-merge**: none（尚未合并）
- **OpenSpec validate state at archive**: pass（`openspec validate --all --json` → 15/15 valid；唯一 issue 为 `multi-branch-base` 的 2 条 INFO 级长文本提示，非本变更引入）
- **Test coverage signal**: `node:test` 主套件 318 tests + elevated 5 tests，共 323 pass / 0 fail（`npm test` 全绿，含 typecheck + build）

Commit chain（时序）：

```
70d022967 chore(change): archive oso-superpowers-v7        ← base
24783fa43 change: fix-brownfield-upgrade                   ← artifacts
e8a02e161 change(fix-brownfield-upgrade): keep override switches, default-refresh, report all updated files
b1c7ad376 test(setup): make brownfield fake runner fail on missing schema
ee655ff2b test(setup): add installed-project fixture and red upgrade cases
080778f5b fix(setup): stop preserving missing openspec product assets (BUG021)
7fa1dda06 fix(setup): refresh commands and skills by default, keep override switches (BUG022)
1bea85787 feat(setup): report refreshed files during brownfield init
397f401e0 fix(setup): keep opencode.json merge visible in upgrade output
1e4ddddd0 test(setup): align brownfield tests with default-refresh semantics
06c44aa3a test(setup): cover ask-mode accept path for commands
d2faa4b1c docs: document default-refresh behavior for BROWN_OVERRIDE_COMMANDS/SKILLS
0f9f5a705 chore(build): rebuild dist for brownfield upgrade fixes
c6d60ac28 docs: correct BROWN_OVERRIDE_OPENSPEC scope in feature table
028c43a34 fix(setup): make merge-path refreshes visible and harden override gating
786dd59fe chore: rebuild dist and sync docs for default-refresh semantics
1ccca3b71 fix-brownfield-upgrade: mark tasks complete after implementation
44e43fddf docs: correct file-ownership table and brownfield decision defaults
d817b444b docs: use plain wording instead of vague refresh for overwrite behavior  ← head
```

---

## 1. Wins

- **先修测试基座再修 bug，反证链完整** — `b1c7ad376` 让假 runner 在 `schema.yaml` 缺失时真的返回 `code 1`，`ee655ff2b` 随后引入 v1.1.1 夹具与 RED 用例。这使得 BUG021 的修复（`080778f5b`）有「修复前必红、修复后必绿」的双向证据，而不是靠测试恒绿蒙混。
- **硬约束「三档开关零损失」有专门回归用例** — `test/setup-brownfield.test.js` 中「保留功能：`BROWN_OVERRIDE_COMMANDS=no` → 命令文件字节不变」与「ask 功能：全部答 n → 命令文件字节不变」（`06c44aa3a` 补 ask 接受路径）把 design D4 的「保留全部原功能」落成断言，而不是只写在文档里。
- **产权分类从「路径前缀 + 决策变量」收敛为 4 个只读谓词** — `src/setup/planner.ts:96-99` 的 `isOpenSpecData` / `isOpenSpecSchema` / `isCommand` / `isSkill` 让「① 类无条件刷新、②③④ 类语义不变」这条全局约束变成可 grep 的单点判据，`planner.ts:133-147` 的三分支与该谓词一一对应。
- **「已更新」计数断言稳定** — 夹具（`test/setup-brownfield.test.js:135` `seedInstalledProject`）刻意让 `config.yaml` 走 preserve、4 个受管根文件内容与模板一致、`openspec/schemas/` 为空走新建，使「恰好 10 条」不受换行/tag 内容影响，`d2faa4b1c` 的语义文档因此可以放心发布。
- **全量回归真绿而非局部绿** — `npm test` 覆盖 typecheck + build + 318 主套件 + 5 elevated，两次 `[guard] ✓ 全局 bin 未被修改（7 个文件）` 说明测试隔离护栏在本次 cycle 中确实生效。

---

## 2. Misses

- 🟡 **[painful | evidence: `openspec/changes/fix-brownfield-upgrade/plan.md` 32 个 `- [ ]` / 0 个 `- [x]`] plan.md 与 tasks.md 形成双真源，且 plan 侧完全未回勾**。tasks.md 45/45 已完成，但 plan.md 的 353 行里 32 个 Step checkbox 全部停留在 `- [ ]`。任何按 plan.md 审计进度的人会误判本变更「几乎没开始」。收尾时（`1ccca3b71` 只勾了 tasks.md）没有同步 plan.md。
- 🟡 **[painful | evidence: commit chain 无 review 记录，对比前一变更 `oso-superpowers-v7` 的 `chore(change): record finish-wording review`] 代码审查（requesting-code-review）缺可审计痕迹**。本 cycle 的 18 个 commit 里没有任何 review 产出的记录；无法从 git 历史区分「审了但没记录」与「没审」。
- 📌 **[nit | evidence: `0f9f5a705`、`786dd59fe`] `dist/` 在 cycle 内被重复重建两次**，产生两个纯产物 commit，与其他语义 commit 交织，`git log -- dist` 出现 2 条噪声。
- 📌 **[nit | evidence: `test/setup-brownfield.test.js:143`] plan Task 1.4 描述的 `git show v1.1.1:template/.opencode/commands/<name>` 回退链未实现**，实现直接使用确定性占位 `OLD v1.1.1 ${name}`。功能上更稳（不依赖 tag/换行），但与 plan 文字不符，见 §3。

---

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.4 `seedInstalledProject(t)` | 未实现 `git show v1.1.1:...` 主路径 + 失败回退；直接写 `OLD v1.1.1 <name>` 占位（`test/setup-brownfield.test.js:143`） | design.md D7 第 2 条已明确「写入占位以保证与模板不同、且不依赖 git 可用性」。确定性占位比 tag 读取更稳，属 design 对 plan 文字的收窄，非偏离设计 |
| 6.2「检查 DEPLOYMENT.md / README.md 是否描述旧行为」 | 改动落在 `docs/features.md` 与文件所有权/决策默认值文档（`d2faa4b1c`、`c6d60ac28`、`44e43fddf`），未在 DEPLOYMENT/README 找到需改处 | 旧行为描述集中在 features 表格与决策表，DEPLOYMENT/README 未描述 commands 询问语义，无内容需同步 |

---

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（`brainstorm.md` 含方案 A/B/C 对比与 Agreed Approach） |
| superpowers:writing-plans                        | ✓（`plan.md` 353 行，含 Global Constraints / Review Focus / 逐 Task 接口） |
| superpowers:using-git-worktrees                  | ✓（`.worktrees/fix-brownfield-upgrade` + `feature/fix-brownfield-upgrade`） |
| superpowers:subagent-driven-development          | ✗（见下） |
| (transitive) superpowers:test-driven-development | ✓（`b1c7ad376` 先让假 runner 能失败，`ee655ff2b` 引入 RED 用例，`080778f5b` 修复转 GREEN） |
| (transitive) superpowers:requesting-code-review  | ✗（见下） |
| superpowers:finishing-a-development-branch       | ✓（本次 `/opsx-finish` 执行中） |

> **Default expectation**：全部 ✓。每个 skill 都是 schema 设计的一部分，
> 跳过属于异常情境。任一项 ✗ 都必须在下方
> `### Deliberately Skipped Skills` subsection 提出原因与预防方案。

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 整个 skill 的调度形态 — 18 个 commit 全部呈线性个人提交序列，无子代理分支/汇总痕迹。
  - **Why this cycle**: 证据不足以判定是「主动跳过」还是「以 executing-plans 内联执行」。可观察到的实际 trigger 是：本 cycle 的 task 集合（`tasks.md` 1–7 节）内部耦合度高（测试基座 → BUG021 → BUG022 → 可见性 → 既有用例改写，后一步强依赖前一步产物），无法切成可并行的独立单元；而 schema 的 apply 指令允许 `subagent-driven-development (recommended) or executing-plans` 二选一。
  - **How to prevent recurrence**: `skill description tightening` — 在 apply instruction 里明确二元选择判据（「任务间存在产物依赖链 → executing-plans 内联；任务可独立并行 → subagent-driven」），并要求在 retrospective §4 记录选择了哪一侧及理由，避免每次靠 hindsight 猜。

- **`superpowers:requesting-code-review`**
  - **What was skipped**: 整个 review 环节（或其产出记录）。
  - **Why this cycle**: 具体 trigger 是 commit chain 中不存在任何 review 结果 commit，而同一仓库的前一变更 `oso-superpowers-v7` 留有 `chore(change): record finish-wording review (Task 10.1)`（`ff2e88882`）作为正面样板。本 cycle 的等价 commit（`1ccca3b71` 只勾 tasks.md）不含审查结论，因此可判定该环节未执行或执行后未落盘。
  - **How to prevent recurrence**: `schema graph fix` — 在 `tasks.md` 模板中把「review 结论落盘为 commit」列为独立必勾项（而非仅在 skill 描述里建议），或在 plan.md 的 Review Focus 段末尾追加「Review 执行后 MUST 产生 `chore(change): record <scope> review` commit」。

> **与 §6 Promote candidates 的关系**：多个 cycle 同 skill 同 `How to prevent` 答案 → 该模式应 promote 到 §6，直接触发 schema / skill PR，不可累积成「常态」。

---

## 5. Surprises

- **「恰好 10 条已更新」的稳定性比预期更依赖夹具设计而非实现**。原以为只要 `reportOperations` 逻辑对就行；实际实现同步出现 `028c43a34 fix(setup): make merge-path refreshes visible` 与 `397f401e0 fix(setup): keep opencode.json merge visible` 两个补丁，说明「哪些路径会产出 `changed`」分散在模板 write、merge-marker、opencode.json merge 三处，任一处漏标都会让计数漂移。
- **`BROWN_OVERRIDE_OPENSPEC` 的作用域容易被误读**。`c6d60ac28 docs: correct BROWN_OVERRIDE_OPENSPEC scope in feature table` 与 `44e43fddf docs: correct file-ownership table` 两个纯文档纠正 commit 表明：代码语义收敛（D3 把询问条件收窄为 `config.yaml`）之后，文档里的旧表述仍会残留，且只有人工比对才能发现。
- **plan.md 的 checkbox 双真源问题在收尾时才暴露**。tasks.md 一路勾到 45/45，plan.md 却 0/32 —— 两个文件都在 change 目录下、都在描述同一批工作，但没有任何机制强制同步。

---

## 6. Promote candidates → long-term learning

- [ ] 🟡 **plan.md 的 Step checkbox 必须在收尾前回勾，或明确声明 plan.md 不承载状态** → **Promote to schema**
  > **Why**: 本 cycle 出现 tasks.md 45/45 而 plan.md 0/32 的双真源分裂（`1ccca3b71` 只同步了 tasks.md），使 plan.md 在收尾审计中成为误导源。
  > **How to apply**: 修改 `templates/` 下 plan 与 apply 的 instruction —— 要么要求「apply 完成时把 plan.md 内 Step checkbox 一并回勾」，要么在 plan.md 头部显式标注「本文件的 checkbox 仅为规划快照，进度以 tasks.md 为准」。

- [ ] 🟡 **apply 阶段的 review / 子代理调度必须留下可审计 commit，否则视为未执行** → **Promote to schema**
  > **Why**: 本 cycle 的 18 个 commit 中没有任何 review 记录，对比前一变更的 `chore(change): record finish-wording review`（`ff2e88882`）形成明显落差，导致 §4 只能标记 ✗。
  > **How to apply**: 在 schema 的 apply instruction 中规定：requesting-code-review 与 subagent-driven-development 若被使用，MUST 产生一条 `chore(change): record <scope> review|dispatch` commit；无该 commit 时 retro §4 一律记 ✗。

- [ ] 📌 **`dist/` 只在发布里程碑重建，避免 cycle 内多次产物 commit** → **Promote to project CLAUDE.md**（`AGENTS.md` Git 协作规则段）
  > **Why**: 本 cycle 出现两次纯产物 commit（`0f9f5a705`、`786dd59fe`），与语义 commit 交织，增加 `git log -- dist` 噪声，也让 rebase/冲突面变大。
  > **How to apply**: 当改动触及 `src/` 且需要跑测试（测试 import `dist/`）时，本地 `npm run build` 但不提交 dist；仅在 `/opsx-finish` 或发布前提交一次构建产物。

- [ ] 📌 **plan 文字与 design 冲突时以 design 为准，并在 §3 显式记录** → **One-off**（记录即可，不 promote）
  > **Why**: 本 cycle Task 1.4 的 `git show v1.1.1` 回退链被 design D7 的确定性占位方案取代，属合理收窄，无需制度化。
  > **How to apply**: 仅当同一次收窄涉及接口/验收口径变化时才升级为 schema 修改；单纯实现手段替换不必 promote。