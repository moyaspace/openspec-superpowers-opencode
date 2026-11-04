# Retrospective: retire-install-hook

> Written: 2026-11-04（verify 通过后）
>
> Commit range: `1f3a67751..66dba5fc8`（19 commits）
>
> Worktree: `.worktrees/retire-install-hook`（`feature/retire-install-hook`，base `release/1.1`）

---

## 0. Evidence

- **Commit range**: `1f3a67751..66dba5fc8`（19 commits）
- **Diff size**: +2205 / -4606 lines across 112 files
- **Tasks done**: 75/75（`grep -cE '^\s*- \[x\]' tasks.md` → 75；未勾选 0）
- **Active hours**: ≈2 小时（首个提交 01:41，末个提交 03:34，同日连续；artifacts 自 01:34 起写入）
- **Subagent dispatches**: n/a（本 cycle 未留存派遣计数）
- **New external dependencies**: none（`devDependencies` 三项版本未变；`package.json` 仅删 `scripts.install`、加 `scripts.prepare`）
- **Bugs encountered post-merge**: n/a（尚未合并）
- **OpenSpec validate state at archive**: pass（`openspec validate --all --json` → items 15 / passed 15 / failed 0）
- **Test coverage signal**: `npm test` → 主套件 `tests 336 / pass 336 / fail 0 / suites 60`；elevated `tests 5 / pass 5 / fail 0 / suites 2`

Commit chain（时序）：

```
1f3a67751 (base) release/1.1
7706d28ee change: retire-install-hook
138db7c15 build: retire npm install hook, build via prepare
84115256d build: untrack dist/ (files kept, rebuilt by prepare before pack)
67d952bb7 build: anchor dist/ ignore to repo root
3d8e0b367 ci: guard tracked artifacts and migrate tarball assertions
9c513f7cd fix(shims): atomic replacement and visible permission failures
858e4ce89 fix(init): continue when shim install fails and print actionable banner
0aeb582c9 fix(init): clarify shim banner wording and cover platform branches
f3c4f3103 feat(cli): use oso in help/errors and add subcommand --help
f30da6268 test(cli): tighten subcommand help assertions to unique usage strings
9ad451220 test: remove obsolete imp16 tarball equivalence test
7a8604c61 docs(test): drop stale postinstall mention from lifecycle e2e comment
f57ce41b0 test(cli): restore unknown-subcommand exit assertion; fix stale run-tests comment
ef4bb6a15 docs: document shim permissions and remove allow-scripts requirement
2cc36330b docs: refine shim permission guidance accuracy
3e69954ea fix(init): do not suggest sudo when openspec is missing from PATH
350e6305d test: verify retire-install-hook acceptance
a97547254 fix: surface sudo hint for unwritable shim bin dir and make CI guard reachable
66dba5fc8 docs(verify): record final suite count after permission-hint fix
```

---

## 1. Wins

- `package.json` 现为零生命周期脚本（无 `preinstall`/`install`/`postinstall`），构建由 `scripts.prepare` 在源目录承载——npm 12 的脚本拦截风险从根上消除（`138db7c15`，`git diff … -- package.json` 显示净删除 `install` 一行、新增 `prepare` 一行）。
- `dist/` 取消 git 跟踪但保留 `files` 条目，产物由 `prepare` 现编，源码 → 构建 → tarball 恢复单向关系（`84115256d`、`67d952bb7`）。
- CI 新增两条守卫（`git ls-files dist` 计数为 0、build 后工作区干净），并把 imp16 的两条独有断言迁移进 tarball 检查，覆盖从「一次性测试」转成「每次流水线都跑」（`3d8e0b367`）。
- 垫片写入改为「同目录临时文件 + 原子替换」，执行位随 inode 生效，避免 chmod 失败留下不可执行文件（`9c513f7cd`）。
- `oso init` 在垫片失败时不再中止，改为记录 `shimSkipped`、走完 8/8、结尾输出含实际 binDir 与可照抄命令的 banner，且仍 exit 0（`858e4ce89`、`0aeb582c9`）。
- 验收探针发现真实实现缺陷（`shimBinDir === null` 时仍打印 `sudo oso install-shims`），按 TDD 修复并补用例：RED 失败于 `/sudo/` 断言 → GREEN 通过（`3e69954ea`）。
- 终审（whole-branch review）抓到 2 项 Important 并修复：Unix 不可写时不给出 `sudo oso install-shims`（spec Scenario 的 MUST 未满足）、CI 守卫在 ubuntu/macOS 不可达；均补了针对性用例与平台注释更正（`a97547254`）。
- 全量验证三连通过：`npm run typecheck` exit 0、`npm run build` exit 0、`npm test` 336/336 + 5/5、fail 0（`66dba5fc8` 记录）。

## 2. Misses

- 🟡 [painful | `brainstorm.md` Key Decisions #9 vs `verify.md` §计划偏差 R3] 计划书写的「测试计数 318 → 317」在本变更自身新增用例的前提下不可能成立，最终改写为「删除恰好减 1 条」。计划阶段用绝对值描述计数，等于把一个必然漂移的量写成验收条件。
- 🟡 [painful | `67d952bb7`、`verify.md` R8] 按计划字面写 `.gitignore: dist/` 会遮蔽已跟踪的 `test/host-probe/dist/**`（30 个文件），未来新增文件被静默忽略；必须改用锚定的 `/dist/`。计划里对「未锚定模式」的风险没有任何提示。
- 🟡 [painful | `f30da6268`、`verify.md` R12–R15] CLI help 断言最初可被全局 `--help` 输满足，形成假绿；需用失效实验（故意回归能不能被捕获）证明断言有效后才算完成。
- 🟡 [painful | `3e69954ea`] 「openspec 不在 PATH（binDir 为 null）」这条失败路径直到验收期才被发现，plan 的失败分支只覆盖了 EACCES/EPERM 与 Windows 两类。
- 🟡 [painful | `a97547254`] `specs/shim-install-safety/spec.md` 的 MUST（`install-shims` 在不可写时输出含 `sudo oso install-shims` 形态的命令）在实现期未被逐条对照，直到终审才发现 `copyOpenspecToOrig` 的 catch 完全没有权限提示。
- 📌 [nit | `a97547254`] `test/elevated/run.mjs:47-50` 在非 Windows 直接运行 elevated，而 CI 未安装 `openspec` CLI，导致 `npm test` 失败、其后置的守卫步骤被跳过；`ci.yml` 原注释还与实际行为相反。
- 📌 [nit | `a97547254`、`350e6305d`] 文档陈旧项集中在同一处：`docs/testing.md:41` 仍指向已删除的 `test/imp16-tarball-equivalence.test.js`，`docs/QUICKSTART.md` 仍说「安装后 setup 脚本会自动检测」。删代码的变更没有同步扫一遍文档引用。

## 3. Plan deviations

（与 `verify.md` 「计划偏差记录」一致，此处按 task 归位）

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 2（`.gitignore` 加 `dist/`） | 写 `/dist/` 而非字面 `dist/`（R8） | 未锚定模式会遮蔽已跟踪的 `test/host-probe/dist/**`（30 文件） |
| Task 7（计数 318 → 317） | 改为「删除恰好减 1 条」并记三点计数链（R3） | 本变更自身新增用例，绝对计数不可能同时成立 |
| Task 4 / Task 5（权限文案） | Unix 不可写分支文案改条件式（R9） | 原文案在「不可写」语境下自相矛盾、可能让用户放弃 sudo |
| Task 6（CLI help 断言） | 收紧为唯一 usage 串 + 补失效实验（R12–R15） | 原断言可被全局 help 满足，属假绿 |
| （计划外）Task 5 新增分支 | 新增 `binDir === null` 分支 + 1 条用例 | 验收发现真实缺陷（`3e69954ea`） |
| （计划外）Task 4 新增 helper | 新增 `permissionHint(binDir, isWin)`，两处 catch 统一使用 | 终审发现 spec MUST 未满足（`a97547254`） |
| （计划外）Task 3 | CI 增加 `npm i -g @fission-ai/openspec` | 守卫在 ubuntu/macOS 上原本不可达（`a97547254`） |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review  | ✓ |
| superpowers:finishing-a-development-branch       | ✓ |

> 证据基础：`brainstorm.md` 含方案 A/B/C 对比与用户裁决记录；`plan.md` 为 9 个 Task × 微步骤结构；`.worktrees/retire-install-hook` 存在且分支为 `feature/retire-install-hook`；提交粒度与 Task 一一对应；`3e69954ea` 的 RED→GREEN 记录与 `verify.md`「终审（whole-branch review）」小节分别对应 TDD 与 code review。
>
> 注：本 cycle 未留存子 Agent 派遣计数（§0），`subagent-driven-development` 的 ✓ 属产物级推断，非派遣日志核验。

### Deliberately Skipped Skills

（无。全部适用 skill 均有产物证据。）

## 5. Surprises

- **计划用绝对值写验收条件会自我否定。** 「318 → 317」在同一个变更里既删用例又加用例时必然不成立——第一版计划的作者没有把「本变更自身会改动计数」纳入等式。
- **`.gitignore` 的未锚定模式会静默遮蔽已跟踪路径。** `dist/` 在根目录语义正确，但会连带匹配 `test/host-probe/dist/`；这种「写法看起来完全等价」的偏差只有跑 `git status` 才显形。
- **测试断言可以被更宽泛的输出满足。** CLI help 断言最初绿得毫无意义（全局 help 就含该串），必须靠「故意回归能否失败」的失效实验才能证伪。
- **spec 的 MUST 与实现不是自动对齐的。** `shim-install-safety` 里「不可写时输出 sudo 命令」是显式 Scenario，但实现只覆盖了一半；说明「按 tasks.md 逐条勾」不等于「按 spec 逐条核」。
- **CI 里的平台分支假设可能整体失效。** 非 Windows 不走 gsudo 的这一条，实际把 elevated 测试变成了 `npm test` 的硬依赖，进而让后置守卫步骤永远轮不到执行。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **验收条件禁止写绝对值计数，改写「相对增量 + 计数链」** → **Promote to project CLAUDE.md**（`AGENTS.md` 的「需求与实施」段附近）
  > **Why**: 本 cycle 的 `brainstorm.md` Key Decisions #9 写死「318 → 317」，而同一变更又新增用例，导致该验收条件自我矛盾（`verify.md` R3 被迫改写）。
  > **How to apply**: 写计划/验收 / 定义测试计数期望时，只有在「本变更不新增任何用例」的前提下才允许写绝对数字；否则写成「删除 N 条 → 恰好减 N」并记录计数链三点（起点、删减、新增）。

- [ ] 🟡 **改 `.gitignore` 的目录模式必须验证锚定，并跑 `git ls-files <pattern>` 确认未误伤已跟踪文件** → **Promote to project CLAUDE.md**（测试/构建相关段）
  > **Why**: `67d952bb7` 前按计划字面写 `dist/` 会遮蔽已跟踪的 `test/host-probe/dist/**` 共 30 个文件，属静默忽略而非报错。
  > **How to apply**: 任何 `.gitignore` 新增目录模式的 commit，提交前执行 `git ls-files <pattern>`，输出必须为空；若不为空，改用根锚定形式 `/pattern/`。

- [ ] 🟡 **新增/收紧断言后必须做失效实验：故意回归一次，确认测试变红** → **Promote to skill**（`test-driven-development` 的 verification checklist）
  > **Why**: `f30da6268`、`verify.md` R12–R15 记录的假绿——原断言可被全局 `--help` 满足，不失效实验就永远发现不了。
  > **How to apply**: 每当断言的对象是「输出文本包含某串」，写完立即构造一个能产生该串的错误场景，确认新断言失败；失败不了就说明断言太宽。

- [ ] 🟡 **实现完成后需按 spec Scenario 逐条对照，而不只勾 tasks.md** → **Promote to schema**（`superpowers-bridge-opencode` 的 apply instruction，Task 完成后的自检步骤）
  > **Why**: `a97547254` 修的是 `shim-install-safety` 里一条显式 Scenario 的 MUST 未满足；tasks.md 全绿并不覆盖它。
  > **How to apply**: apply 阶段每个 Task 收尾时，额外执行一次「本 Task 触及的 spec 文件 → 所有 `#### Scenario`」对照；缺任何一条即视为该 Task 未完成。

- [ ] 📌 **删除文件/代码的变更必须同步扫文档引用（`grep` 被删文件名）** → **Promote to project CLAUDE.md**（文档维护段）
  > **Why**: `a97547254` 同轮修了 `docs/testing.md:41` 指向已删除测试、`docs/QUICKSTART.md` 的安装期脚本表述等 5 处陈旧引用。
  > **How to apply**: 变更中出现 `git rm` 或删除公开行为时，收尾前对每个被删文件名/行为执行一次全仓 `grep`，命中文档即修。
