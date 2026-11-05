## Design Summary

`/opsx-ff` 从「无条件创建 change + 生成全部 artifacts」改为**幂等收敛**：在 worktree 内若 change 已存在则跳过创建、只补齐未完成的 artifacts；无任何变化时不产生空提交。`/opsx-propose` 与 `/opsx-new` 明确为**创建语义**，名字已被占用时主动中止，并给出 `/opsx-continue`（逐个）与 `/opsx-ff`（一次补齐）两条继续路径。

三个命令统一使用**同一个判据、同一个位置**：worktree 内 `test -d openspec/changes/<name>`。不查 `openspec list`（它返回注册表内容），不在 worktree 之外判断，不检测归档同名与跨分支同名。

本变更**零 `src/` 改动**，只改 3 个模板命令文件与 `CHANGELOG.md`。

> 本记录是对已裁决设计的整理。设计依据为 `local/docs/2026-11-04-opsx-ff幂等收敛方案.md`（该文件位于被 `.gitignore` 排除的私有仓库，不随本 change 提交）。

## Alternatives Considered

### 方案 A：严格对齐官方 OpenSpec —— ff 只在 change 已存在时工作

- **做法**：change 不存在时 `ff` 直接报错，要求用户先跑 `/opsx-new`。
- **优点**：与官方 `docs/commands.md` 的 ff 语义完全一致。
- **缺点**：破坏「从任意点开始」的目标；中断后用户必须自己判断该跑 `new` 还是 `ff`。
- **为何未采用**：与 F004 的核心诉求（可从任意状态补完）冲突。

### 方案 B：删除 ff，只保留 propose

- **做法**：用 `/opsx-propose` 承担全部创建 + 生成职责。
- **优点**：命令更少，语义无重叠。
- **缺点**：破坏已有用户习惯；且 propose 的创建语义无法覆盖「续跑」场景，撞名只能中止。
- **为何未采用**：会移除续跑入口，收益不足以抵消破坏性。

### 方案 C：用 `openspec list` 或项目根目录判断 change 是否存在

- **做法**：在 worktree 之外，或通过 `openspec list --json` 判断存在性。
- **优点**：看起来能复用现有命令。
- **缺点**：`openspec list` 返回的是**注册表**内容（`src/registry-utils.ts` 的 `handleList` → `mergeListJson`），未经 `registry add` 的 change 不出现；worktree 之外的视图与 worktree 内一致，查不到额外信息，只多一处代码。
- **为何未采用**：判据不可靠且重复。

## Agreed Approach

采用**方案 D（已裁决）**：`ff` 保留「创建 + 补齐」能力，但把创建改为条件化（`test -d` 后按需 `openspec new change`）；把提交改为守卫式（`git diff --cached --quiet || git commit`）；`propose` / `new` 在创建前做同一 `test -d` 判断，命中则 **STOP** 并列出两条继续路径。

幂等性的其余环节复用已落地实现：`ensure-worktree` 已幂等且不碰注册表（BUG020，`7db126665`）；`registry.add()` 已是合并语义（保留 `createdAt`，`--base` 可选）；artifact 循环条件 `applyRequires` 全 `done` 天然幂等。因此 `src/` 无需改动。

## Key Decisions

- **`propose` 不回退为 3 个 artifact**：`0ceff7ef7`（T003 / BUG008 同步）把 propose 改为生成全部 artifacts 是**修正**（原写法漏了 `specs/`，与官方不一致），不是失误。
- **判据唯一化**：三个命令都用 worktree 内 `test -d openspec/changes/<name>`；MUST NOT 用 `openspec list`，MUST NOT 在 worktree 外判断。
- **明确不检测的两类**：`openspec/changes/archive/` 下的同名归档；base 分支上存在但未合入的同名 change。
- **`src/` 零改动**：所有幂等前提已存在，本任务只改模板文本 + 测试 + CHANGELOG。
- **README 改动全部归 T005**：本任务 MUST NOT 修改 `README.md` / `README.zh-CN.md`。
- **base 钉死 `release/1.1`**：合并方向 `feature/opsx-ff-idempotent-converge → release/1.1`，全程不出现 `git checkout main` / `git switch main`。

## Open Questions

无。全部设计点已裁决，实施时按 `tasks.md` 执行。
