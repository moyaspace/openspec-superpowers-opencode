## Design Summary

在 V1 线（`release/1.1`，基线 `c770dbb2f`）上回移 main 已完成的 6 个缺陷修复提交，补齐 V1 可执行的测试，并实现一个精简的部署后验证（GAP002）。目标是把 1.1.2 发版所需的行为修复落到 V1 代码结构上，不引入任何 2.0 设施。

已确认的设计要点：

- **V1 用独立目录 + 独立 clone**（`/l/moyaspace/oso/oso-v1`），不使用同一仓库的 git worktree。理由已核对代码：`src/registry-utils.ts` 的 `findProjectRoot` 基于 `git rev-parse --git-common-dir`，对任何链接工作树都返回主仓库根，导致 V1/V2 两条线共用同一个注册表；且注册表条目存相对路径 `.worktrees/<name>`，读取时拼在 projectRoot 上，V1 目录里的 worktree 会被解析到主仓库下，结果恒为 `(no worktree)`。独立 clone 后 projectRoot = V1 目录本身，两处都自然正确。
- **回移方式是 `git cherry-pick -n` + 逐提交清理 + 逐提交单独 commit**，不做整分支合并。6 个提交在 V1 上各有需要剔除的面：`dist/` 应当丢弃并统一 build；`.ts` 测试一律不引入；`test/opsx-finish-test-dispatch.test.js` 属 BUG007（归 T003）；`resources/` 与 `supported-versions` 相关不引入。
- **测试移植走 `.js` + `import '../dist/...'`**（V1 既有惯例），不建 `.ts` 测试基建。
- **精简部署后验证只做两项检查**（命令齐全 + CLI 入口可动态 import），失败只报错不回滚。

## Alternatives Considered

### 方案 A：把 main 的整套 2.0 设施一起回移（含 runPostVerify / rollbackOperations / supported-versions / resources）

- **做法**：直接 `git merge main` 或 cherry-pick 全部相关提交，把 IMP-1002 的完整 postVerify、版本矩阵、资源目录一起搬进 `release/1.1`。
- **优点**：一步到位，V1/V2 代码结构趋同，后续同步成本低。
- **缺点**：IMP-1002 的 postVerify 依赖 `resources/setup/supported-versions.json`、`runPrecheck`、`rollbackOperations` 等 2.0 基础设施，V1 基线一个都没有；引入它们等于在 1.1.x 补丁版里做一次架构迁移，回归面无法在一轮内收敛。而且 1.1.2 的目标是**发版**，不是补基建。
- **为何未采用**：与 1.1.2 的范围裁决直接冲突（实施方案 §0「1.1.2 明确不做」）。

### 方案 B：在同一仓库里用 git worktree 建 V1 工作区

- **做法**：在 `openspec-superpowers-opencode` 里 `git worktree add .worktrees/v1 c770dbb2f`，V1/V2 共用同一 `.git`。
- **优点**：不需要额外克隆，磁盘占用小，切换成本低。
- **缺点**：致命。`findProjectRoot` 用 `--git-common-dir`，对链接工作树返回主仓库根 → 两条线共用 `openspec/oso-change-registry.json`；注册表条目存的 `.worktrees/<name>` 会被解析到主仓库下，V1 侧恒为 `(no worktree)`。
- **为何未采用**：会把两条线的变更注册表互相污染，且 `registry add`/`ensure-worktree` 在 V1 侧行为直接失效。

### 方案 C：只回移代码、不补测试

- **做法**：6 个提交 cherry-pick 后只做手工端到端验证，不移植 33 条用例。
- **优点**：工作量最小，1.1.2 最快可发。
- **缺点**：GAP001 的关闭条件未被满足；main 上已用这 33 条用例证明过修复语义，V1 没有等价覆盖就等于把「已验证」退化成「手工试过」，后续任何触碰 setup 的改动都没有回归网。
- **为何未采用**：GAP001 明确要求「以 V1 写法落地并在 V1 `npm test` 中实际执行且通过」。

## Agreed Approach

采用 **方案（A 的克制版）+ B 的替代（独立 clone）+ C 的补足**：

1. V1 独立目录 + 独立 clone（来源必须是本地路径，因为 `c770dbb2f` 不在任何远端分支上）。
2. 在 `release/1.1` 上按 `e56b31bd6 → 2eda04db1 → c592abdec → a45b7bb8f → daede4b28 → 45b2f6e51` 顺序 `cherry-pick -n`，每个提交按四条清理规则剔除 V2 专属面后单独 commit（`backport:` 前缀保留原 subject）。
3. 把 main 的三份 `.ts` 测试按四条改写规则移植为 V1 的 `test/setup-*.test.js`，合计 33 条。
4. 在 `src/setup/index.ts` 的 `initProject` 成功返回前加两项检查（GAP002），配套 `test/setup-post-verify.test.js`。
5. 全量 `npm test` 必须全绿，随后 `/opsx-finish` 合并回 `release/1.1`（不触碰 `main`）。

为何胜出：它把「回移语义」与「剔除 2.0 面」拆成两个独立可控的动作——cherry-pick 提供语义，清理规则提供边界；测试用移植而非新建，保证断言口径与 main 一致；postVerify 只取最小两项，不引入任何 2.0 依赖。

## Key Decisions

- **基线与分支**：base = `release/1.1` @ `c770dbb2f`。全程不执行 `git checkout main` / `git switch main`；主仓库目录（V2）全程留在 `main` 且不被改动。
- **只看代码不复制代码**：main 上的 `.ts` 测试只读，`test/opsx-finish-test-dispatch.test.js` 与 `resources/**` 一律不引入。
- **冲突以 V1 结构为准**：`src/setup/index.ts` 在 main 上含 `runPostVerify` / `rollbackOperations` / `runPrecheck`，cherry-pick 冲突时以 `c770dbb2f` 的结构重新落地，只取该提交的语义改动。
- **postVerify 的检查 2 指 `dist/cli/index.js`**：实施方案 §3 原文写的是 `dist/oso-core/index.js`，但 V1 无 `oso-core`，按 GAP002 的更正取 `dist/cli/index.js`。
- **不回滚**：postVerify 失败只打印缺失项并返回 `success: false`，不搬 IMP-1002 的事务式回滚。
- **base 可追溯**：本 Sprint 内 `ensure-worktree` 仍是旧代码（注册表无 `baseBranch` 字段），故在 `proposal.md` 抬头写 `> Base: release/1.1` 作为长期可追溯记录；`/opsx-finish` 的 base 由用户确认为 `release/1.1`，MUST NOT 默认推断为 `main`。

## Open Questions

- V1 模板 `template/.opencode/commands/` 下当前 15 个 `.md`（不含 skills 相关），与部署版面 13 个 opsx 命令不一致——postVerify 的检查 1 以**模板**为准枚举，因此实际校验的是 15 个文件名在目标目录存在；若某模板命令未随 init 部署，init 会按设计失败。
- `npm test` 含 `test/elevated/run.mjs`（需 gsudo）。若在本机因权限失败，按「环境类失败不算回归」处理，但必须在验收记录中写明。
