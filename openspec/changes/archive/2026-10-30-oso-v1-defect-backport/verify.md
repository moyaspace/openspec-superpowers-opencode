# Verification Report

**Change**: `oso-v1-defect-backport`
**Verified at**: `2026-10-30 19:40`
**Verifier**: OpenCode agent（V1 worktree `.worktrees/oso-v1-defect-backport/`，base `release/1.1` @ `c770dbb2f`）

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] 全數 items `"valid": true`

**結果**：

```text
items 5 → passed 5, failed 0
byType: change 1/1, spec 4/4
（本 change + 既有 4 个 spec：behavior-equivalence-migration / dual-esm-entry-isolation /
  host-compatibility-probe / typescript-esm-build-baseline）
```

| Item | Type | Issues |
|---|---|---|
| — | — | 無 |

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變為 `- [x]`（38/39 已勾選，1 項刻意保留）

**未完成任務**（若有）：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| 8.6 执行 `/opsx-finish` 合并回 `release/1.1` | 属 finish 阶段，必须由用户显式发起该命令；本次交付到「实现完成 + 全量测试全绿」为止 | **是**（archive 需先 finish） |

---

## 3. Delta Spec Sync State

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| brownfield-init-safety | ✗ 待 sync | 4 个 ADDED Requirements 需在 archive 时写入 `openspec/specs/brownfield-init-safety/spec.md` |
| init-shim-selfcheck | ✗ 待 sync | 同上，2 个 ADDED Requirements |
| init-self-verification | ✗ 待 sync | 同上，2 个 ADDED Requirements |
| deployment-post-verify | ✗ 待 sync | 同上，3 个 ADDED Requirements |

> 以上均为**新增** capability（`openspec/specs/` 下原本不存在），sync 动作由 `/opsx-finish` 的 archive 步骤完成，属预期状态而非缺陷。

---

## 4. Design / Specs Coherence Spot Check

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| D3 测试移植口径 | `.js` + `import '../dist/...'`，删 1 条 precheck 用例，共 33 条 | `brownfield-init-safety` 的 6 个 Scenario 一一对应 16 条中的核心断言 | 無 |
| D4 检查 2 目标 | `dist/cli/index.js` 存在且可 import（非 `dist/oso-core/index.js`） | `deployment-post-verify` 的「init MUST 在成功返回前验证 CLI 入口可加载」明确写死该路径 | 無 |
| D4 不回滚 | 失败只报错返回 `success:false` | `deployment-post-verify` 的「部署后验证失败 MUST NOT 触发回滚」 | 無 |
| D5 独立目录 | V1 不使用同仓库 worktree | 非 spec 层（流程决策），无 spec 对应 | 無（预期） |

**漂移警告**（非阻塞）：

- 無

---

## 5. Implementation Signal

- [x] Worktree 內無未 staged 的檔案（`git status --porcelain` 仅 `tasks.md` 勾选，见 §8）
- [ ] 所有相關 commit 已推送（未 push，按流程由 finish 处理）

**Commit 範圍**：`c770dbb2f..9f7a06ab6`（10 个提交，`52 files changed, 2535 insertions(+), 751 deletions(-)`）

```text
9f7a06ab6 chore: rebuild dist for the 1.1.2 backport
b1bcc5701 backport: 实现精简部署后验证（GAP002）
0be328af0 backport: 移植 33 条 setup 用例到 V1 写法
80196bd18 backport: 垫片/registry 修正
6f6aadfa9 backport: 补 postVerify 测试（V1 无对应面）
c09d0eb45 backport: 护栏加固
d372e7cae backport: BUG005 8/8 补注册与清理
fa3f0bb74 backport: BUG004 垫片自检
546757e10 backport: BUG001/B2/B3/B6 棕地统一走 init plan
4ac812798 change: oso-v1-defect-backport
```

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

- [x] 無檔案

```text
docs/superpowers/specs 不存在（无泄漏）
```

| 檔案 | 內容是否已 captured 進 change | 建議動作 |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` 中**无** `[~]` deferred 行，本節不需要填（空白即 PASS）。

但有一处**验收口径偏差**必须记录（不计入 `[~]`，属实现期发现并当场裁决）：

| 项目 | 原口径（开工命令 Step 6） | 实际实现 | 判据 |
|---|---|---|---|
| 删除任一命令文件让 **init 失败** | 「删除任一命令文件后 init 必须失败，且错误信息含该文件名」 | 一条走完整 init（删 `dist/cli/index.js`）；一条**直接验证护栏函数** `verifyDeploymentPostInit`（删已部署的 `opsx-ff.md`） | 计划器对「目标缺失的命令」一律补写，init 会**自愈**，因此删文件后重跑 init 不会失败。main 的 `runPostVerify` 测试出于同一原因采用「直接验证护栏」（commit `daede4b28` 的 `oso-setup-init.test.ts` 注释原文：`init 会自愈，故直接验证护栏`） |

---

## 8. 开工命令验收清单（T002 10 条）逐条证据

| # | 检查项 | 命令 / 输出 | 结论 |
|---|---|---|---|
| 1 | V1 独立目录已克隆，分支 `release/1.1`，起点 `c770dbb2f` | `git rev-parse --abbrev-ref HEAD` → `release/1.1`；`git rev-parse --short HEAD` → `c770dbb2f` | ✅ |
| 2 | 三样 gitignored 内容就位 | `test -f openspec/config.yaml` / `.../schema.yaml` / `skills.lock.json` → 均 True；`.opencode/commands/*.md` = **13**（部署版面）；`template/.opencode/commands/*.md` = **15**（模板面）→ 两个数字对得上，验收文本的「15」指模板 | ✅ |
| 3 | `npm ci` + `build` + `typecheck` 通过 | 三次 exit 0（`added 7 packages`；`tsc -p tsconfig.build.json`；`tsc -p tsconfig.json`） | ✅ |
| 4 | worktree base 是 `c770dbb2f` | `git merge-base --is-ancestor c770dbb2f HEAD; echo $?` → `0` | ✅ |
| 5 | 6 个提交语义落地（BUG001–006 关闭条件） | 逐条见下方 §8.1 | ✅ |
| 6 | 33 条用例实际执行且通过 | `node --test` 三文件：16 + 10 + 7 = **33 pass / 0 fail / 0 skipped** | ✅ |
| 7 | 精简验证三种行为 | `node --test test/setup-post-verify.test.js` → **3 pass**（正常通过 / 删 `dist/cli/index.js` → 失败并指名 / 缺命令 → 护栏报文件名） | ✅（口径偏差见 §7） |
| 8 | `npm test` 全绿（含 elevated） | `node --test --test-concurrency=1 "test/*.test.js"` → **240 tests / 47 suites / 240 pass / 0 fail / 0 skipped / exit 0**；elevated 见 §8.2 | ⚠️ elevated 为环境类失败（基线同样失败） |
| 9 | 全程无 `git checkout main` / `git switch main`；主仓库未改动 | V1 reflog 无 `checkout: moving ... to main`；主仓库 `git rev-parse --abbrev-ref HEAD` → `main`，`git status --porcelain` → 空 | ✅ |
| 10 | change 已归档，specs 同步 | **未做** —— 需 `/opsx-finish`（用户显式发起） | ⏳ 待 finish |

### 8.1 BUG 关闭条件逐条核对

| BUG | 关闭条件 | 覆盖用例（均在 `node --test` 中实跑通过） |
|---|---|---|
| BUG001 | 棕地 + 无 marker 的 `.gitignore`，用户原有行零删除 | `棕地：无 marker 的 .gitignore 追加托管区块，用户原有行零删除` |
| BUG002 | 落盘 `AGENTS.md`/`schema.yaml`/`opsx-apply.md`/`opsx-finish.md` 无占位符；渲染故障时 6/8 失败 | `棕地：落盘的 ... 均无占位符`、`verifyNoPlaceholders：目标文件残留占位符时抛错并指名文件`、`棕地：答 n 保留的 AGENTS.md 仍含占位符时 init 失败并指名文件`、`dry-run：…必须报告失败` |
| BUG003 | 空 openspec 的棕地 init 无「覆盖」提示，8/8 通过 | `棕地：openspec/ 不存在时不询问并直接部署`、`已有 openspec/config.yaml 时仍询问，答 n 时文件不变`、`schemas 非空时询问，答 y 时 schema 被覆盖`、`BROWN_OVERRIDE_OPENSPEC 优先于目标状态判定` |
| BUG004 | `--ignore-scripts` 安装后 init 要么自修要么明确中止并给命令 | `initProject：垫片未生效且修复失败 → 中止且错误含 oso install-shims`、`垫片未生效但修复成功 → 继续到完成`、`dryRunProject：垫片未生效只报告`、`ensureShim：安装器报成功但垫片仍未生效 → ok:false` |
| BUG005 | 二次 init 8/8 通过；任意失败路径无 `oso-verify-*` 残留 | `verifyProject：list 从真实注册表读到条目…结束后移除`、`注册后中途失败 → 注册表无残留`、`registry remove 失败不中止清理`、`initProject：8/8 验证失败时必须还原被覆写的注册表`、`注册表创建发生在 8/8 之前` |
| BUG006 | 棕地首次 init 后 `.opencode/commands/` 含全部模板命令 | `棕地首次 init：无 commands 目录时部署全部模板命令`、`棕地已有 commands 且答 n 时文件不变` |

### 8.2 elevated 失败的判定（环境类，非回归）

```text
ELEVATED: running 2 elevated test file(s) via gsudo ...
C:\Program: The term 'C:\Program' is not recognized as a name of a cmdlet, ...
exit 1
```

- **同一命令在基线 `c770dbb2f`（V1 主目录）上产生逐字相同的错误与退出码 1**，故为既存环境问题（`test/elevated/run.mjs` 调 gsudo 时未给含空格的 `C:\Program Files\nodejs\node.exe` 加引号），**不是本次改动引入的回归**。
- `gsudo` 本身存在：`C:\Program Files\gsudo\Current\gsudo.exe`。

### 8.3 并发与资源相关的两次红（已复现排除）

| 现象 | 归因 | 复现证据 |
|---|---|---|
| 全量跑时 30+ 文件集体 `spawn UNKNOWN` | 机器上已有 40 个 node 进程（用户 OpenCode/MCP）+ 默认并发 | 单文件跑全绿；`--test-concurrency=2` 后仅剩真实失败 |
| `tarball: CLI 版本输出…` 失败，`npm pack` 退出码 `3221226505`（Windows STATUS_STACK_BUFFER_OVERRUN） | `npm pack` 进程在负载下崩溃，非断言失败 | 单文件复跑 → pass；`--test-concurrency=1` 全量 → 240/240 |

---

## Overall Decision

- [ ] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [x] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意：`(a) elevated 因环境（gsudo 未加引号）失败，基线同错；(b) §7 的「删命令文件 → init 失败」一条为护栏级验证而非端到端，原因见 §7；(c) tasks 8.6 / specs sync 属 finish 阶段，未做`
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**下一步**：

实现与验证已完成，等待用户显式发起 `/opsx-finish`（base 必须确认为 `release/1.1`，禁止推断为 `main`），由它完成合并 → 归档 → specs 同步。
