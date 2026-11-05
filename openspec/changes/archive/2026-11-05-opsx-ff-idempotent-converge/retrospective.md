# Retrospective: opsx-ff-idempotent-converge

> Written: 2026-11-05 (after verify passed)
> Commit range: `b7a82ac7441cf3c9b01d12793f954bb042675ad7..b914c5e02`
> Worktree: `.worktrees/opsx-ff-idempotent-converge`（尚未合并）

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用，避免每行重复 [evidence: ...]。

- **Commit range**: `b7a82ac74..b914c5e02` (15 commits)
- **Diff size**: +1111 / -13 lines across 13 files（`git diff --shortstat release/1.1...HEAD`）
- **Tasks done**: 34/36（`grep -c '^- \[x\]' tasks.md` → 34；剩余 2 项为交付/收尾动作本身，见 §2）
- **Active hours**: ~6h（主体 2026-11-04 14:08 → 19:36，约 5.5h；2026-11-05 收尾约 0.5h）
- **Subagent dispatches**: n/a（实现期调度记录不可得；本次 retro 由 finish 阶段撰写）
- **New external dependencies**: none（`package.json` devDependencies 未变）
- **Bugs encountered post-merge**: none（尚未合并）
- **OpenSpec validate state at archive**: pass（19/19 items `valid: true`，`openspec validate --all --json`）
- **Test coverage signal**: 主套件 342 pass / 0 fail；elevated 5 pass / 0 fail；`npm test` 退出码 0，全局 bin 守卫通过

Commit chain（时序）：

```
b7a82ac74 (release/1.1 base) 
639635286 change: opsx-ff-idempotent-converge
279b7d49b test(template): pin opsx-ff idempotent convergence invariants
a85c3a476 test(template): ignore whole-line comments in fencedCommands
a73357dab feat(template): make opsx-ff converge from any state
5a2ac0383 feat(template): make opsx-ff top up only unfinished artifacts
b6706afcf feat(template): stop propose and new when the change name is taken
131608bd9 fix(template): report and stop when opsx-new cannot create the change
d2137308a fix(template): make the propose/new abort path truthful and guarded
548217e22 docs(changelog): note opsx-ff idempotent convergence
efd9440dd fix(template): stop opsx-ff before post-apply artifacts
139533c78 fix(template): exclude post-apply artifacts by dependency chain
d370de2e8 fix(template): terminate opsx-ff only when nothing is processable
c4f5592ef docs(opsx-ff): make the convergence rule executable and reconcile the specs
eea994a6b docs(spec): scope ff convergence scenarios to non-post-apply artifacts
b914c5e02 chore(change): mark opsx-ff-idempotent-converge tasks complete
```

---

## 1. Wins

- [evidence: `279b7d49b` 先于 `a73357dab`] **TDD 的 RED 阶段真的先落地了**：测试 pin 用例（`test/setup-template-invariants.test.js` 新增 `opsx-ff.md converges from any state` 与 `creating commands stop on an occupied name`）在实现提交之前单独成 commit，任务 1.6 显式要求记录 RED 输出。
- [evidence: `git diff --shortstat` → 13 files, 0 行删除于 `src/`] **`src/` 零改动得到守住**：全部 1111 行新增集中在 3 个模板命令文件、测试、CHANGELOG 与 change artifacts，符合 D5「幂等所需能力已存在」的判断。
- [evidence: `npm test` → 342 pass / 0 fail] **不改现有断言的约束被遵守**：`assertBaseReadStep` / `assertRegistryAddCarriesBase` / `BASE_AWARE_COMMANDS` 全部保持原样并通过，新增用例为纯追加（测试文件 +195 / -0）。
- [evidence: `openspec validate --all --json` → 19/19] **delta spec 与主 spec 的口径修正及时**（`eea994a6b`）：把收敛场景收窄到 non-post-apply，避免 `verify` / `retrospective` 被误生成——这是审查轮次里发现并修掉的真实语义漏洞。
- [evidence: 工作区 `git status --porcelain` 为空 + 15 个逻辑提交] **提交粒度与任务边界一致**：每个 task 一个 commit，`git bisect` / `git blame` 可直接定位到具体任务。

## 2. Misses

- 🟡 [evidence: `git merge-base HEAD origin/main` → `a67cf5b07`；count=176 vs 实际 15；`git merge-base --is-ancestor b7a82ac74 origin/main` → NO] **verify 的 PRECHECK 命令硬编码 `origin/main`，与 `multi-branch-base` 能力冲突**。本项目 base 为 `release/1.1` 且与 `main` 已分叉，PRECHECK 把 176 个无关提交算进「本 change 的提交证据」，放大 11 倍。仅因 PRECHECK 只判断 `> 0` 才未造成误判，但证据强度形同虚设。
- 🟡 [evidence: `verify.md` §2 记录 7.1/7.2 未勾选] **`tasks.md` 的 7.x 交付任务与 `/opsx-finish` 职责重叠**。7.1「提交实现」与 7.2「verify + archive」正是 finish 流程本身，导致任何走标准流程的 change 在 verify 时必然留有 2 个未勾选项，需要每次人工解释「不阻塞」。这是流程设计造成的噪声，不是执行瑕疵。
- 📌 [evidence: `verify.md` §5] verify 模板要求勾选「所有相关 commit 已推送」，但本地 worktree 分支在 finish 前没有 upstream，该检查项在「选项 1 本地合并」路径下永远无法满足。
- 📌 [evidence: `.worktrees/` 下 `oso-template-base-branch`、`oso-v1-defect-backport`、`retire-install-hook` 均为 `items=0`] 三个空的残留 worktree 目录（非本 change 产物），`git worktree list` 不列出它们。不影响本 change，但会让 `/opsx-finish` 的「自动检测唯一 worktree」逻辑在肉眼检查时产生歧义。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.6 / 2.7 | Step 5 增加「只处理非 done artifacts」定义、Step 6 增加 commit 失败与 `--cached --quiet` exit 1 的区分 | 审查轮次发现原方案对「无变化」与「提交失败」的边界描述不足 |
| 2.8 / 2.9 | Step 5 从「`applyRequires` 全 done 即终止」改为「按 `requires` 链排除 post-apply，无 artifact 可处理才终止」；`<M>` 统计口径与数据源明确化 | 原终止条件会漏补闭包外的 `design`，且可能生成 `verify` / `retrospective` |
| 2.10 | 反向修正 `opsx-change-convergence` 需求正文的终止子句，并在 parity delta 新增 MODIFIED requirement 覆盖主 spec 的过期要求 | 实现与 spec 出现口径漂移（`c4f5592ef` → `eea994a6b`），以 spec 为准回改 |

新增了 5 个任务（2.6–2.10）全部标注为「审查补齐」，说明 code review 在本 cycle 中确实改变过实现范围。

## 4. Skill / workflow compliance

> 注：本 retro 由 `/opsx-finish` 阶段撰写，无法直接回溯实现期会话内的 skill 调用。下表判定基于**可核查产痕**（文件、commit 顺序、tasks 标记）；若实现期实际跳过某项，应视为本表误判。

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓（`brainstorm.md` 含 Design Summary / Alternatives / Agreed Approach） |
| superpowers:writing-plans | ✓（`plan.md` 476 行 micro-task，含 Review Focus / Self-Review） |
| superpowers:using-git-worktrees | ✓（`.worktrees/opsx-ff-idempotent-converge`，分支 `feature/...`） |
| superpowers:subagent-driven-development | ✓（plan.md 第 3 行指定；逐 task 一 commit 的节奏与之相符） |
| (transitive) superpowers:test-driven-development | ✓（`279b7d49b` 测试先于 `a73357dab` 实现） |
| (transitive) superpowers:requesting-code-review | ✓（tasks 2.6–2.10「审查补齐」即 review 反馈的落地痕迹） |
| superpowers:finishing-a-development-branch | ✓（当前正在执行） |

### Deliberately Skipped Skills

（空白 — 无观察到跳过。）

## 5. Surprises

- **PRECHECK 的基准假设不成立**：schema instruction 假定 `origin/main` 是合并基准，但本项目采用 `release/1.1` 且与 `main` 分叉，同一命令的计数从 15 变成 176。这是「模板写通用命令」与「adopter 使用多 base」之间的直接碰撞。
- **「实现未完成」是假象**：34/36 的第一眼读数像是还有实现工作，实际剩余 2 项恰好就是收尾动作本身。任务进度百分比不能直接当完成度信号。
- **worktree 是干净检出**：`.worktrees/` 下没有 `node_modules`，必须显式 `npm ci` 才能跑 `npm test`；这与主工作区的开发态不同，第一次跑测试前容易误以为项目依赖已存在。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **verify 的 PRECHECK 必须用注册表的 `baseBranch`，不能硬编码 `origin/main`** → **Promote to schema**（`openspec/schemas/superpowers-bridge-opencode/` 的 verify instruction 或 templates）
  > **Why**: 本 cycle 中 `git merge-base HEAD origin/main` 返回 `a67cf5b07`，把 176 个与本变更无关的提交计入证据（实际 15 个）；`release/1.1` 不是 `origin/main` 的祖先，说明多 base 场景下该命令结构性失真。
  > **How to apply**: 修改 verify artifact 的 PRECHECK，改为先读 `openspec/oso-change-registry.json` 的 `baseBranch`（或 `openspec list --json` 的 `baseBranch`）再计算 `git log`；读不到时退回 `origin/main` 并在报告中标注基准。

- [ ] 🟡 **交付类任务（7.x）应在 `tasks.md` 中标注「由 `/opsx-finish` 执行」，verify 时自动豁免** → **Promote to schema**（apply/verify 的 tasks 解析约定）
  > **Why**: 任何遵守标准的 change 都会在 verify 时留下「提交」「verify+finish」两个恒未勾选项，每次都要人工解释不阻塞，属于流程噪声。
  > **How to apply**: 在 tasks 模板或 verify instruction 中约定：以 `交付` / `finish` 命名分组的任务由收尾流程负责，verify 的 Task Completion 检查对它们记录「pending-by-design」而非未完成。

- [ ] 📌 **「change 是否存在」的唯一判据是 worktree 内 `test -d openspec/changes/<name>`** → **One-off**（已固化为 spec 与回归断言）
  > **Why**: `openspec list` 返回注册表内容，未经注册的 change 不出现；本次变更的核心修正即统一判据。
  > **How to apply**: 已由 `opsx-change-convergence` 的 Requirement 与 `test/setup-template-invariants.test.js` 固化，后续无需额外记忆载体；仅在修改模板命令时作为不变量复核。
