# Verification — settle-v1-residuals

> 本文件由实现阶段按任务落盘证据；完整 verify 结论在 `/opsx-verify` 时补全。
>
> 环境：Windows（win32），Node v24.14.0，npm 11.9.0，gsudo v2.6.1。
>
> 全局垫片位置：`C:\Program Files\nodejs\openspec.cmd` / `.ps1`（`where openspec` 命中该目录，实际指向 nvm v24.14.0 全局包）。
>
> 正式安装路径（基线 TOOL_DIR）：`C:\portableApp\nvm\v24.14.0\node_modules\@moyaspace\openspec-superpowers-opencode`。

## 5. GAP008：全局垫片恢复兜底判定证据

结论：**三条证据齐备，恢复为 no-op，兜底已删除**。

### 5.1 证据 1 — 连续 `npm test`

主套件基线 351 tests / 351 pass；elevated 基线 5 tests / 5 pass；`openspec-shim-e2e` 预期收集 3 条。

| 运行 | 退出码 | 主套件 pass/fail | elevated pass/fail | 全局垫片 `TOOL_DIR` | e2e 收集数 | 全局 bin 守卫 | 耗时 |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 351 / 0 | 5 / 0 | `...\@moyaspace\openspec-superpowers-opencode`（前=后） | 3 | ✓ 7 个文件未变 | 105.4s |
| 2 | 0 | 351 / 0 | 5 / 0 | 同上（前=后，SHA 一致） | 3 | ✓ 7 个文件未变 | 105.6s |
| 3 | 0 | 351 / 0 | 5 / 0 | 同上（前=后，SHA 一致） | 3 | ✓ 7 个文件未变 | 109.8s |
| 4 | 0 | 351 / 0 | 5 / 0 | 同上（前=后，SHA 一致） | 3 | ✓ 7 个文件未变 | 103.0s |
| 5 | 0 | 351 / 0 | 5 / 0 | 同上（前=后，SHA 一致） | 3 | ✓ 7 个文件未变 | 98.8s |
| 6（加 no-op 探针） | 0 | 351 / 0 | 5 / 0 | 同上（前=后，SHA 一致） | 3 | ✓ 7 个文件未变 | 99.2s |
| 7（删除兜底后回归） | 0 | 351 / 0 | 5 / 0 | 同上（前=后） | 3 | ✓ 7 个文件未变 | 115.6s |

- 每次 `assert-global-bin-unchanged` 均报告 `[guard] ✓ 全局 bin 未被修改（7 个文件）`。
- 每次 `openspec shim end-to-end [real CLI]` 的三个用例均被收集并通过（`--version`、`list` 拦截、`validate --help` 透传）。
- 局限：本机仅 Windows；CI 的 ubuntu/macos 未在本任务内执行，需 CI 首跑复核（不影响本机三证据判定）。

### 5.2 证据 2 — 调用 `installShims()` 的测试隔离审计

| 测试 | 隔离点 | 结论 |
|---|---|---|
| `test/create-project.behavior.test.js` | `makeIsolatedBin()`（:25-31）创建临时 bin 并写入 dummy `openspec`/`.cmd`/`.ps1`；第二个用例在 spawn 时 `PATH: bin + delimiter + PATH`（:55-59），随后清理（:65-67）。第一个用例（:33-45）只跑 `--help`，不触发 `init`/`installShims`。 | 已隔离 |
| `test/elevated/lifecycle-e2e.test.js` | `makeIsolatedBin()`（:37-57）复制真实 `openspec*` 到临时 bin；`isolatedBin` 于 :59 创建；`npm install`（:71-73）与 `oso init`（:77-86）均注入 `PATH: isolatedBin + delimiter + PATH`。`npm pack`（:65）不触发垫片安装。 | 已隔离 |
| `test/shims-installer.test.js` | `installShims()` 集成段（:249-379）用 `t.mock.method(child_process, 'execSync', ...)` 把 `findOpenspecBinDir` 的 `where/which` 结果指向临时 `binDir`（如 :267、:284、:309、:323、:332、:344、:357、:369）；所有写入均在 `mkdtempSync` 临时目录（:10-12、:250-260）。 | 已隔离（替身级） |
| `test/cli.test.js` | `install-shims --help` 用例使用 `runCliIsolated(tmp, bin, ...)`（:401-411），仅验证帮助文本、无副作用。 | 已隔离 |
| `test/setup-api.test.js`、`setup-brownfield.test.js`、`setup-post-verify.test.js`、`setup-verify-registry.test.js`、`setup-shim-check.test.js` | 均通过 `shimDeps: ACTIVE_SHIM` 桩（如 `setup-brownfield.test.js:20-26`、`setup-post-verify.test.js:26`、`setup-verify-registry.test.js:22`）替换垫片探测/安装，不触达真实 bin。 | 已隔离（桩级） |

未发现仍在写全局 bin 的测试；7 次运行的全局 bin 守卫全部为「未变」也佐证这一点。

### 5.3 证据 3 — 恢复点 no-op 日志

在 `scripts/run-tests.mjs` 的 `finally` 中、调用 `restoreGlobalShim()` 前后临时打印全局 `openspec*` 的 SHA-256 与 `TOOL_DIR`，跑第 6 次 `npm test`：

```text
[noop-probe] restore 前: dir=C:\Program Files\nodejs openspec#bdae39090f37 openspec.cmd#71442b3c91b1(TOOL_DIR=C:\portableApp\nvm\v24.14.0\node_modules\@moyaspace\openspec-superpowers-opencode) openspec.ps1#cd313fa5047e(TOOL_DIR=C:\portableApp\nvm\v24.14.0\node_modules\@moyaspace\openspec-superpowers-opencode) openspec-orig.cmd#c4050e91396c
[shim] 恢复全局垫片 → oso install-shims
[noop-probe] restore 后: dir=C:\Program Files\nodejs openspec#bdae39090f37 openspec.cmd#71442b3c91b1(TOOL_DIR=C:\portableApp\nvm\v24.14.0\node_modules\@moyaspace\openspec-superpowers-opencode) openspec.ps1#cd313fa5047e(TOOL_DIR=C:\portableApp\nvm\v24.14.0\node_modules\@moyaspace\openspec-superpowers-opencode) openspec-orig.cmd#c4050e91396c
```

前后哈希与 `TOOL_DIR` 完全一致 → 恢复为 no-op。临时探针已从工作树移除（最终提交不含调试日志）。

### 5.4 处置与回归

- 删除：`findGlobalOso()`、`restoreGlobalShim()`、`OSO_SKIP_SHIM_RESTORE` 分支、`finally` 调用、恢复失败返回 1 的退出码逻辑。
- 同步文档：`docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md`（新增 §4 说明移除及依据）、`docs/testing.md`（删除「收尾恢复」描述）。
- 删除后第 7 次 `npm test`：351 主套件 + 5 elevated 全绿，e2e 收集 3 条，全局 bin 守卫通过，TOOL_DIR 指向正式安装版；用例数不低于基线（342 + 5）。

## 6. 全量回归（Task 6）

执行时间：2026-11-06，worktree `feature/settle-v1-residuals`，Node v24.14.0。

### 6.1 `npm test`

```text
ℹ tests 353
ℹ suites 64
ℹ pass 353
ℹ fail 0
ℹ skipped 0
[guard] ✓ 全局 bin 未被修改（7 个文件）
ELEVATED: running 2 elevated test file(s) via gsudo ...
ℹ tests 5
ℹ suites 2
ℹ pass 5
ℹ fail 0
ℹ skipped 0
[guard] ✓ 全局 bin 未被修改（7 个文件）
```

- 主套件：353 tests / 353 pass / 0 fail（基线 342，§5.1 记录 351，本次 353，均满足「不少于基线」）。
- elevated：5 tests / 5 pass / 0 fail。
- 两次全局 bin 守卫均报告「未被修改（7 个文件）」，与 §5 GAP008 的判定一致。

### 6.2 残留搜索（排除 `node_modules`、`.worktrees`、`dist`、`.superpowers`、`.git`）

`git branch -D`：

- `src/cli/index.ts:700` —— 仅存在于 `runRemoveWorktree()`（显式 `remove-worktree` 命令），按预审计裁决不在本变更范围，未删除。
- `docs/WORKTREE-CREATION.md:88` —— 原描述旧版 `ensure-worktree` 防御性清理的文档段落，**已在 `f06a2321a` 修复**：该节改写为「分支与目录状态处理」，伪代码同步为新判据；`git grep -n "git branch -D" -- docs/WORKTREE-CREATION.md` 为 **0 处**。
- `docs/tasks.md:403,406` —— 描述 `remove-worktree` 的 `git worktree remove --force` + `git branch -D` 组合，属另一命令语义，按裁决保留。
- `template/.opencode/commands/opsx-finish.md:358` —— `/opsx-finish`「丢弃」选项的显式清理步骤，属 finish 语义，非 ensure-worktree 路径。
- 其余命中均为本变更的文档/规格/计划（`CHANGELOG.md`、`openspec/changes/settle-v1-residuals/**`），描述「不再使用该命令」。
- **结论：`runEnsureWorktree()`（`src/cli/index.ts:616-681`）不含 `git branch -D`**，无阻断项。

verify PRECHECK 的旧主路径 `git merge-base HEAD origin/main`：

- `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 与 `openspec/schemas/superpowers-bridge-opencode/schema.yaml`：无 `merge-base HEAD origin/main`；`origin/main` 仅作为 `baseBranch` 缺失时的 fallback 出现（:199-203）。
- `test/setup-template-invariants.test.js:629-631` 为「必须不出现」的断言。
- 其余命中为 change artifacts（提案/回顾）中对旧行为的描述。
- **结论：0 处旧主路径残留。**

### 6.3 Git 状态（最终，含文档修复后）

- `git status --short`：**空**（`f06a2321a` 文档修复与本次证据更新提交后均无脏文件）。
- 最终 HEAD：**本证据更新提交**（`docs(verify): refresh Task 6 evidence after doc fix`）；其父提交 `f06a2321a`（`docs: align worktree creation doc with ensure-worktree behavior`），再上一提交 `c20feaab8`（`docs(changelog): record 1.1.2 residual fixes`）。以 `git rev-parse HEAD` 为准。
- `git rev-parse main` = `7416976a9017f0a6dabac4be331c3e6fcbff58a7`，与开工前一致（未触碰 `main`）。
- 当前分支：`feature/settle-v1-residuals`（未 rebase/push/切换）。
- 测试：**文档-only 变更（`docs/WORKTREE-CREATION.md`、本 `verify.md`），未重跑**；上次全量回归见 §6.1（commit `c20feaab8`）：主套件 353 / 353 pass / 0 fail，elevated 5 / 5 pass / 0 fail。
