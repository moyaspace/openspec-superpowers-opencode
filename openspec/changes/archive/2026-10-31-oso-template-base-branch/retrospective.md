# Retrospective: oso-template-base-branch

> Written: 2026-10-31 (after verify passed)
> Commit range: `da7d93f16..229593ba7`（18 commits）
> Worktree: `.worktrees/oso-template-base-branch`

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用，避免每行重复 [evidence: ...]。

- **Commit range**: `da7d93f16..229593ba7`（18 commits）
- **Diff size**: +2043 / -152 lines across 41 files
- **Tasks done**: 37/37（`grep -c '^- \[x\]' tasks.md` → 37；`^- \[ \]` → 0；`[~]` → 0）
- **Active hours**: ~7.4 h（23:52–04:05 与 10:59–14:12 两段，按 commit 时间戳估算）
- **Subagent dispatches**: n/a（实现发生在更早的会话，dispatch 日志未留存）
- **New external dependencies**: none（`package.json` 未出现在 diff 中；新增的 `scripts/assert-global-bin-unchanged.mjs` 为内部脚本）
- **Bugs encountered post-merge**: n/a（尚未合并）
- **OpenSpec validate state at archive**: pass（`openspec validate --all --json` → 9/9 `valid:true`）
- **Test coverage signal**: `npm test` 退出码 0 — 主套件 278 tests / 54 suites 全绿，elevated 5 tests / 2 suites 全绿

Commit chain（时序）:

```
da7d93f16 (base = release/1.1 HEAD)
bcda4cc36 change: oso-template-base-branch
a3596c986 feat(registry): add baseBranch and merge semantics for add()
38710f21d test(registry): lock baseBranch override order on re-add
1754fef8f feat(cli): record base branch on ensure-worktree + registry add --base
46c34ff62 test(cli): strengthen baseBranch idempotence + zh help assertions
0ceff7ef7 fix(template): base-branch workflow across opsx commands (F002/BUG007/BUG008)
840ac57dd fix(cli): drop ensure-worktree base write; expose baseBranch in list --json
6611584a7 test(registry): lock ensure-worktree registry isolation and Phase 2 no-base injection
7c7016cfc test(template): assert base-branch invariants for five opsx commands
da4b3a3ee chore(openspec): mark oso-template-base-branch tasks complete
89a6359a2 docs: postmortem for elevated suite gsudo path quoting (pwsh-only failure)
e242b593b test(elevated): invoke node by name and run serially under gsudo
8c0024393 fix(template): make the base read purely informational in propose/ff/new
62fb1b307 fix(template): keep the read-only constraint as the original bullet
766a10cd1 fix(shims): nest Join-Path so the ps1 shim works on Windows PowerShell 5.1
9b56237ad test: isolate PATH so tests never rewrite the machine's global npm bin
3294cc0b3 docs: postmortem for global-bin test pollution (parallel-only 9009)
229593ba7 test: guard the gate against global-bin pollution
```

---

## 1. Wins

- [evidence: `a3596c986` + `38710f21d`, test `registry.test.js` — "keeps a previously stored baseBranch when re-added without one"] 合并语义用「不带 `--base` 时保留已有值」的反向断言锁定，直接命中 design D1 里点名的「生死线」，而不是只测 happy path。
- [evidence: `840ac57dd` + `6611584a7`] 把 base 的唯一写入点收敛到 `registry add --base`，并从 `ensure-worktree` 彻底移除读写；测试同时断言「创建路径」和「早返回路径」都不碰注册表，杜绝了静默抹除。
- [evidence: `7c7016cfc`, test `setup-template-invariants.test.js` — "no command contains a bare `main` token"] 模板命令的「无裸 `main`、无操作性 `git ... main`」被做成机器可校验的断言，而不是靠人眼评审。
- [evidence: `9b56237ad` + `229593ba7` + `scripts/assert-global-bin-unchanged.mjs`] 测试污染真实机器全局 npm bin 的问题被防御性地做成守卫脚本，主套件与 elevated 套件前后各校验一次（本次运行输出「全局 bin 未被修改（7 个文件）」）。
- [evidence: `89a6359a2`, `3294cc0b3`, `docs/*-POSTMORTEM.md`] 两次环境类踩坑都留下了独立 postmortem 文档，属于可复用的经验资产，而非一次性调试记录。

## 2. Misses

- 🟡 [painful | evidence: `.opencode/commands/opsx-finish.md:179-180`（gitignored 的生产副本）vs `template/.opencode/commands/opsx-finish.md:179`] 变更改好了**模板**（tracked、会随包发布），但本仓库自己部署的生产命令副本仍写着「读注册表文件」。本次 `/opsx-finish` 实际执行的就是这份旧文本，与 `multi-branch-base` 的 "Command text SHALL obtain the base through this command rather than by parsing the registry file directly" 相悖。模板正确、落地副本陈旧，属于「改了源头没刷新本地部署」。
- 🟡 [painful | evidence: `e242b593b` + `89a6359a2`] elevated 套件在不同 PowerShell 版本下 `gsudo` 的路径引号行为不一致，导致仅 pwsh 下失败；这类平台差异是事后才暴露的，plan 中未预留跨 shell 验证任务。
- 📌 [nit | evidence: `8c0024393` + `62fb1b307`] 模板措辞（base 需保持「只读且信息性」）返工了两次才定稿，说明 Task 7 的验收标准在动笔时不够可判定。
- 📌 [nit | evidence: 18 个 commit 中有 5 个是环境/测试基建修复] 计划内的 10 个 task 之外，实际有约 28% 的 commit 花在了计划外的基础设施修复上，plan 对「跑通全量测试」的成本估计偏低。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 3b（C1：`mergeListJson` 注入 `baseBranch`） | 计划中途新增，插在 Task 7 之前 | finish 需要回读 base，而文本版 `list` 不带该字段；若不新增此通道，Step 6a 只能解析注册表文件（与 design D8 冲突） |
| （计划外）`e242b593b` / `89a6359a2` | 修 elevated 套件的 `gsudo` 调用方式并补 postmortem | 在 pwsh 下路径引号被吞，elevated 套件无法稳定执行 |
| （计划外）`9b56237ad` / `229593ba7` / `3294cc0b3` | 新增全局 bin 守卫脚本 + PATH 隔离 + postmortem | 并行跑测试时会把真实机器的全局 npm bin 改写（port 9009 类症状），必须先堵住才能信任测试结果 |
| （计划外）`766a10cd1` | 修 ps1 shim 的 `Join-Path` 嵌套 | Windows PowerShell 5.1 下 shim 无法解析 |
| （计划外）`8c0024393` / `62fb1b307` | 模板 Wording 两次返工 | 保持 base 读取为「只读、信息性」，与 design D3 一致 |
| Task 10（验收：真实 propose + finish 6a） | 未在本次会话留可复查的 smoke 记录 | 相关断言已由 `setup-template-invariants` 与 `registry-utils` 测试覆盖（见 verify.md §7，无 `[~]` deferral） |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓（`brainstorm.md`：方案 A/B/C 对比 + Agreed Approach） |
| superpowers:writing-plans                        | ✓（`plan.md`：Task 1–10，含 Task 3b 插入点） |
| superpowers:using-git-worktrees                  | ✓（`.worktrees/oso-template-base-branch` + `feature/oso-template-base-branch`，注册表有条目） |
| superpowers:subagent-driven-development          | ?（无 dispatch 记录留存，无法从证据核实） |
| (transitive) superpowers:test-driven-development | ✓（feat 与对应 test commit 成对出现：`a3596c986`→`38710f21d`、`1754fef8f`→`46c34ff62`、`840ac57dd`→`6611584a7`） |
| (transitive) superpowers:requesting-code-review  | ?（未发现 review artifact 或 PR；仅有两次环境类 postmortem） |
| superpowers:finishing-a-development-branch       | ✓（本次 `/opsx-finish` Step 6 正在执行） |

### Deliberately Skipped Skills

无「刻意跳过」。表中两处 `?` 属**证据缺失**（实现发生在更早会话，dispatch / review 记录未留存），不是 design 意义上的 escape-hatch 跳过，故不适用三问模板；为避免下个 cycle 继续猜测，已在 §6 留一条 promote candidate。

## 5. Surprises

- **Windows PowerShell 5.1 与 pwsh 对 shim 的路径处理不同**：`Join-Path` 单层拼接在 5.1 下解析失败，需要嵌套调用（`766a10cd1`）。原先的假设是「写一次 shim 三平台通用」。
- **测试会污染真实机器**：并行执行时测试套件会改写全局 npm bin（`3294cc0b3` 记录的症状仅在高并发下出现）。这是「测试是纯本地的」这一假设的反例。
- **部署副本与模板会漂移**：`template/` 是唯一受版本控制的源头，但仓库自身消费的是 gitignored 的 `.opencode/commands/`。改完模板后本地不会自动更新——本次 finish 就踩到了（§2 🟡）。
- **`openspec list` 的文本输出与 JSON 输出字段不一致**：文本版不含 `baseBranch`，只有 shim 的 `--json` 注入。design D8 是对的，但直觉上容易以为两者同源。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **改模板命令后必须同步刷新本仓库的 `.opencode/commands/` 部署副本** → **Promote to project CLAUDE.md**（`AGENTS.md` 的「注意事项」段）
  > **Why**: `template/.opencode/commands/*.md` 是受 git 跟踪的发布源，而仓库自身运行的是 `.gitignore:33` 排除的 `.opencode/commands/*`。只改模板会让本仓库继续执行旧文本——本次 `opsx-finish.md:179` 就出现了「模板读 `list --json`、本地副本读注册表文件」的漂移。
  > **How to apply**: 任何修改 `template/.opencode/commands/` 或 `template/openspec/schemas/` 的变更，在 verify 阶段额外跑一次「模板 vs 本地部署副本」的 diff，或在 finish 后执行部署刷新；不一致即视为未完成的变更。

- [ ] 🟡 **跨 shell / 提权测试要在 plan 阶段就列为显式任务** → **Promote to schema**（`superpowers-bridge-opencode` 的 plan 模板）
  > **Why**: elevated 套件的 `gsudo` 引号问题（`89a6359a2`）仅在 pwsh 下失败，是交付后才暴露的；plan 的 10 个 task 里没有任何跨 shell 验证项，导致约 28% 的计划外 commit。
  > **How to apply**: 当变更触碰 `scripts/`、`test/elevated/` 或任何平台相关路径时，plan 必须包含一条「在目标 shell × 平台矩阵下执行一次」的显式 task，而不是隐含在「全量测试」里。

- [ ] 📌 **测试套件需声明对宿主环境的副作用边界** → **One-off**（记录即可，不 promote）
  > **Why**: 全局 bin 被改写是极端案例，已由 `scripts/assert-global-bin-unchanged.mjs` 守卫锁定；再泛化成通用规则成本高于收益。
  > **How to apply**: 仅当新增「会写项目目录之外」的测试时，套用现有守卫模式（执行前快照 + 执行后 diff）。

- [ ] 📌 **prompt 文本类变更的验收标准要写成可断言的字符串规则** → **Promote to memory**（type: feedback）
  > **Why**: 模板措辞返工两次（`8c0024393`、`62fb1b307`），根因是「保持只读约束」这类要求不可判定；而同批次的「无裸 `main`」因为写成了正则断言（`7c7016cfc`）就一次通过。
  > **How to apply**: 当任务产物是命令/提示词文本时，先在 plan 里把验收点转成正则或包含-排除断言（测试名里体现），再动笔改写文本。
