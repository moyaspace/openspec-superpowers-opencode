## Context

`/opsx-ff` 与 `/opsx-propose` 由模板命令驱动，实际动作是 `ensure-worktree` → `openspec new change` → `registry add` → artifact 循环 → `git commit`。其中两处是硬失败：

1. `openspec new change <已存在>` 返回 exit 1（实测 openspec CLI 1.3.1：`Change 'x' already exists`），而 `opsx-ff.md` 的 Step 4 无条件调用它。
2. `git commit` 在无暂存内容时返回 exit 1，而 `opsx-ff.md` 的 Step 6 用 `&&` 串联 `git add -A && git commit`。

其余环节已具备幂等性：`runEnsureWorktree` 已幂等且不碰注册表（BUG020，`7db126665`）；`registry.add()` 为合并语义（保留 `createdAt`，`--base` 可选）；artifact 循环以 `applyRequires` 全 `done` 为终止条件。

约束：`src/` 零改动；只落 `release/1.1`；README 改动归 T005；部署版 `.opencode/commands/` 为旧版且 gitignored，真机验证须在临时 `oso init` 项目中进行。

## Goals / Non-Goals

**Goals:**

- `/opsx-ff` 可从任意状态（worktree 有无、change 有无、注册表有无、artifacts 完成度任意）收敛到 apply-ready，且可安全重复执行。
- 全部 artifacts 已完成时重跑 `/opsx-ff`：正常结束、不产生空提交、提示 `/opsx-apply` 或 `/opsx-archive`。
- `/opsx-propose` 与 `/opsx-new` 在名字已被占用时主动中止，输出两条继续路径，且不覆盖已有 change。
- 三个命令的存在性判据统一为 worktree 内 `test -d openspec/changes/<name>`。

**Non-Goals:**

- 不把 `/opsx-ff` 改为严格对齐官方（change 不存在时报错）。
- 不删除 `/opsx-ff`、不合并 `/opsx-ff` 与 `/opsx-propose`。
- 不检测 `openspec/changes/archive/` 下的同名归档。
- 不检测 base 分支上存在但未合入的同名 change。
- 不修改 `src/`、不改现有测试断言、不改 README、不改部署版命令文件。
- 不动 `/opsx-ff` 的 Step 2d（base 读取）、Step 3（建 worktree / 复制 schemas / codegraph）、Step 4a（注册与失败处理）。

## Decisions

**D1. 判据位置固定在 worktree 内。** `propose` / `new` 的 Step 2c 要求先处理未提交更改，`ensure-worktree` 从当前 HEAD 切分支，worktree 内看到的内容与项目根一致；在 worktree 外判断不获得额外信息，只多一处代码。

**D2. 判据命令用 `test -d`，不用 `openspec list`。** `openspec list` 返回注册表内容（`src/registry-utils.ts` 的 `handleList` → `mergeListJson`），未经注册的 change 不出现，会导致「worktree 有 change、注册表缺条目」时漏判。

**D3. `ff` 采用「跳过」而非「中止」。** 创建语义（`propose` / `new`）在撞名时 STOP；补完语义（`ff`）在撞名时继续，这是两者的唯一行为分界。

**D4. 提交用 `git diff --cached --quiet ||` 守卫。** 保持 `git add -A` 先行（artifacts 可能跨目录），再用 `--cached --quiet` 判断是否有可提交内容。`git commit` 失败在无暂存内容时是预期行为，不应视为命令失败。

**D5. `src/` 零改动。** 幂等所需能力已存在；若实施中发现必须改 `src/`（例如 `ensure-worktree` 不再幂等），说明 BUG020 修复被回退，应停下报告，不在本 change 内修。

**D6. 测试新增而不改现有。** 在 `test/setup-template-invariants.test.js` 增加用例，保持 `assertBaseReadStep` / `assertRegistryAddCarriesBase` / `BASE_AWARE_COMMANDS` 原样。注意 `assertRegistryAddCarriesBase` 用 `.find()` 取第一个含 `registry add` 的行，新增注释不得出现 `registry add` 字面量。

**D7. 状态矩阵（改后）。** 设 W=worktree 存在、C=worktree 内 change 存在、R=已注册：

| # | W | C | R | 典型成因 | `propose` / `new` | `ff` |
|---|---|---|---|---|---|---|
| 1 | ✗ | ✗ | ✗ | 全新变更 | 创建 | 建 worktree + 创建 + 补齐 |
| 2 | ✓ | ✗ | ✗ | 先跑过 `ensure-worktree` | 创建 | 创建 + 补齐 |
| 3 | ✓ | ✗ | ✓ | change 被删但注册表留着 | 创建 | 创建 + 补齐 + 合并注册 |
| 4 | ✓ | ✓ | ✗ | 注册表被 reset | STOP | 补注册 + 补齐 |
| 5 | ✓ | ✓ | ✓ | 正常续跑 / 已完成后再跑 | STOP | 只补未完成；全完成则无空提交 |
| 6 | ✗ | base 上有 | 任意 | 在主干直接建过 change | 建 wt 后 STOP | 建 wt 后跳过创建、补齐 |
| 7 | ✗ | ✗ | ✓ | worktree 被手工删 | 创建 | 建 wt + 创建 + 补齐 |

## Risks / Trade-offs

- **撞名时 `propose` / `new` 已经创建 worktree** → 可接受：该 worktree 正是 change 该待的位置；不想继续时 `/opsx-remove <name>` 会清理 worktree + 分支 + 注册表条目。
- **`test -d` 只看目录存在，不看内容完整性** → 可接受：已存在的空目录也视为「change 存在」，由 artifact 循环补齐。
- **判据字符串被测试误命中** → 缓解：新增注释不写 `registry add` 连写；沿用 `.find()` 风险规避。
- **模板与部署版脱节导致本仓库自测失真** → 缓解：AC1–AC5 在临时 `oso init` 项目验证；本仓库只做静态断言与 `npm test`。
- **README 表述可能落后于实现** → 由 T005 调整 README；本任务不改，若发现不一致则报告而非自行修改。
