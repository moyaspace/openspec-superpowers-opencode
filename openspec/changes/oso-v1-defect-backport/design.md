## Context

V1 线 `release/1.1` 的基线是 `c770dbb2f`（2026-09-08，TS/ESM 重构归档后的收尾提交）。它已经是完整 TypeScript（`src/setup/` 13 个文件、`src/registry*.ts`），`package.json` version `1.1.1`，**不含任何 2.0 设施**。

`main` 上同一批缺陷已修复并归档（`24dffc9ff`），但 `main` 的 `src/setup/index.ts` 已演进到 2.0 形态：含 `runPrecheck`（版本矩阵门禁，读 `resources/setup/supported-versions.json`）、`runPostVerify` / `rollbackOperations`（IMP-1002 的事务式部署后验证与回滚）、`dist/oso-core` 入口等。因此 main 的**提交无法整体搬**，只能摘语义。

关键结构差异（决定冲突处理方式）：

| 项 | `c770dbb2f`（V1） | `main`（2.0） |
| --- | --- | --- |
| 棕地决策采集 | `src/setup/index.ts:209` `collectBrownfieldDecisions` | 同函数，行号漂移 |
| openspec 无条件询问 | 采集 `:227` + 内联 `:734` | 采集 `:242` |
| `deployRootFile` | `:690-719` | `:864-899` |
| commands 部署在 `if` 内（BUG006） | `:754-776`（调用 `:769`） | 已由 IMP-1002 修复 |
| 步骤 6 假校验 | `:872-890` | `:1089-1105` |
| 8/8 验证 | `:906` | `:1122` |
| 部署后验证 | **不存在** | `runPostVerify`（含回滚） |

约束：

- `test/` 根目录**没有任何 `.ts` 测试**；`npm test` = `typecheck` + `build` + `node --test "test/*.test.js"` + `test/elevated/run.mjs`。
- 既有 `.js` 测试统一 `import '../dist/...'`（读编译产物，不读源码）。
- 不允许引入：`src/setup/supported-versions.ts`、`resources/`、`dist/oso-core`、`dist/opencode-plugin`、`runPrecheck`、`runPostVerify`、`.oso/config.yaml`、`test/run.mjs`。

## Goals / Non-Goals

**Goals:**

- 把 6 个提交（BUG001+B2+B3+B6、BUG004、BUG005、护栏加固、postVerify 测试、垫片/registry 修正）的**语义**落到 V1 的代码结构上，并逐个通过 BUG 关闭条件。
- 在 V1 上提供 33 条可执行用例（16 + 10 + 7），断言口径与 main 一致。
- 实现 GAP002 的两项部署后验证，并为其写配套用例。

**Non-Goals:**

- 不引入任何 2.0 设施（见上「不允许引入」清单）。
- 不做 BUG007 / BUG008 的模板替换（归 T003）；不改 `template/.opencode/commands/opsx-propose.md`、`opsx-finish.md`、`opsx-new.md`、`opsx-ff.md`。
- 不 bump 版本号、不 `npm publish`（归 T005）。
- 不做 Superpowers v7 支持（归 T004）。
- 不搬 IMP-1002 的 `runPostVerify` / `rollbackOperations` / 事务回滚。

## Decisions

### D1 回移方式：逐个 `cherry-pick -n` + 逐提交清理，而非 merge

**决策**：按 `e56b31bd6 → 2eda04db1 → c592abdec → a45b7bb8f → daede4b28 → 45b2f6e51` 顺序 `git cherry-pick -n`，每个提交应用后立即按四条规则清理，再单独 commit（`backport: <原 subject>`）。

**为何不用 `git merge main`**：会把 2.0 的 `resources/`、`oso-core`、`runPrecheck` 与整个 artifact 体系一起带进来，等于在补丁版里做架构迁移，回归面不可控。

**为何不用 `git rebase main`**：会把 `release/1.1` 的历史重放到 2.0 线上，属历史污染（见 F002/BUG011 的同类风险）。

**清理规则（每提交必做）**：

| 规则 | 动作 | 理由 |
| --- | --- | --- |
| (a) `dist/` | `git checkout HEAD -- dist/` | 编译产物不跨版本搬运；最后统一 `npm run build` |
| (b) `.ts` 测试 | `git rm -f --cached <path>` + 删文件 | V1 无 `.ts` 测试基建，且它们 import 了 V1 不存在的模块 |
| (c) `test/opsx-finish-test-dispatch.test.js` | 不引入 | 属 BUG007，归 T003 |
| (d) `resources/` / `supported-versions` | 不引入 | V1 无此结构 |

### D2 冲突处理以 V1 结构为准

**决策**：`src/setup/index.ts` 冲突时按 `c770dbb2f` 的结构重新落地，只取该提交的语义改动。

**判据**：能写进 V1 现有函数签名的改动直接取；依赖 main 独有符号（`runPrecheck`、`runPostVerify`、`rollbackOperations`、`supported-versions`）的改动一律**不取**，改为在 V1 结构内等价实现或跳过。

### D3 测试移植：`.js` + `import '../dist/...'`

**决策**：三份 `.ts` 测试（`oso-setup-brownfield` 16、`oso-setup-shim-check` 11→10、`oso-setup-verify-registry` 7）移植为 `test/setup-brownfield.test.js` / `setup-shim-check.test.js` / `setup-verify-registry.test.js`。

**四条改写规则**：

1. `../src/...` → `../dist/...`
2. 去掉全部 TS 类型标注与 type-only import
3. 去掉 `supported-versions` 的 import 与 `componentVersions` 参数
4. 删除 `test("initProject：版本组合不受支持时必须在修复垫片前中止")`（测的是 V2 专有 `precheck.supported` 门禁）

**为何不移植 `oso-setup-init.test.ts`（26 条）**：它 import `runPrecheck` / `runPostVerify`，两者在 V1 均不存在；逐个改写会让断言失去对象，等于新写测试。

**落点判据**：移植后的用例必须在 V1 `npm test` 中**实际执行**（`node --test` 的 `pass` 计数可见），不得用 `skip` 静默跳过。

### D4 postVerify 只做两项检查，检查 2 指 `dist/cli/index.js`

**决策**：在 `initProject` 成功返回前：

1. 枚举 `template/.opencode/commands/**/*.md`，逐个检查 `<targetDir>/.opencode/commands/<rel>` 存在；
2. 检查 `dist/cli/index.js` 存在且可 `await import()`。

任一失败 → 打印具体缺失项，返回 `{ success: false }`。**不回滚**。

**为何检查 2 不是 `dist/oso-core/index.js`**：实施方案 §3 原文如此，但 V1 无 `oso-core`；GAP002 已明确更正为 `dist/cli/index.js`（V1 的 `bin` 入口）。

**为何不回滚**：回滚需 IMP-1002 的事务设施；1.1.2 只求「不静默通过」。

### D5 V1 用独立目录，不用同仓库 worktree

**决策**：V1 工作区 = `/l/moyaspace/oso/oso-v1`（独立 clone，remote 与主仓库一致，当前分支 `release/1.1`）。

**判据（代码级）**：`src/registry-utils.ts` 的 `findProjectRoot` 基于 `git rev-parse --git-common-dir`，对链接工作树返回主仓库根 → 两条线共用注册表；注册表条目存相对路径，读取时拼在主仓库根 → V1 worktree 恒解析为 `(no worktree)`。独立 clone 后 projectRoot = V1 目录，两者自然正确。

**克隆来源必须是本地路径**：`c770dbb2f` 不在任何远端分支上（`git branch -r --contains` 为空）。

### D6 base 可追溯性

**决策**：本 Sprint 内 `ensure-worktree` 仍是旧代码，注册表条目**无** `baseBranch` 字段。因此在 `proposal.md` 抬头写 `> Base: release/1.1`，作为归档后唯一长期可追溯的 base 记录；`/opsx-finish` 的 base 由用户确认为 `release/1.1`。

**为何不能只靠注册表**：归档后条目已删；reflog 只记 `Created from HEAD`，不记分支名。

## Risks / Trade-offs

- **cherry-pick 冲突量超预期** → 冲突时以 V1 结构重写而非照搬；每提交单独 commit，出问题可只回退该提交。
- **移植后的用例「通过但没测到」**（例如断言被弱化）→ 逐文件核对 `node --test` 的用例数与 `pass` 计数（16/10/7），并保留原断言文本。
- **postVerify 让 init 对既有部署更严格**，可能把「模板有 15 个命令、部署版面 13 个」这类既有不一致暴露成 init 失败 → 这是设计意图（暴露静默不一致）；若阻断合法场景，按 D4 调整枚举范围，但 MUST 保留至少「命令齐全 + 入口可加载」两项。
- **`npm test` 的 `test/elevated/run.mjs` 需 gsudo** → 环境类失败不算回归，但必须在验收记录写明是权限/环境原因。
- **误把 V1 改动做进 V2 目录** → 所有代码改动只在 `.worktrees/oso-v1-defect-backport/` 内；主仓库目录全程留在 `main` 且 `git status` 为空。
- **全局 `openspec-superpowers-opencode` 是 V2 仓库的 junction** → 本任务一律用 V1 自己的 `node dist/cli/index.js` 驱动 worktree/registry，避免 V2 代码参与 V1 流程。

## Migration Plan

1. `release/1.1` 上 propose → 得到 `.worktrees/oso-v1-defect-backport/`（`feature/oso-v1-defect-backport`，base = `c770dbb2f`）。
2. 6 个 cherry-pick + 清理 + 单独 commit。
3. 移植 33 条用例 → 局部 `node --test` 确认执行数。
4. 实现 postVerify + 配套用例。
5. `npm run build` + `npm test` 全绿。
6. `/opsx-finish`：`feature/oso-v1-defect-backport` → `release/1.1`；归档 change；specs 同步进 V1 `openspec/specs/`。

**回滚策略**：本次是纯增量提交（6 个 backport 提交 + 测试 + postVerify），任一环节失败可 `git reset --hard c770dbb2f` 于 worktree 内重来；合并后如需撤销，`git revert` 对应提交即可，不影响 `main`。

## Open Questions

- postVerify 检查 1 的枚举口径：以 `template/.opencode/commands/` 的 15 个 `.md` 为准（模板真相），还是以部署版面 13 个为准？本设计取**模板**（GAP002 原文），差异在实现时记录到 `verify.md`。
- `initProject` 是否接受 `componentVersions` 参数：V1 签名可能不接受，移植时以实际签名为准，不为了复用 `main` 的调用形态而扩签名。
