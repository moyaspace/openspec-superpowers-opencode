## Design Summary

本 change（T003）在 `release/1.1` 上交付 3 个任务项，组装成一个 change：

- **BUG007**（用户指挥）：用 V1 实战版整文件替换 `template/.opencode/commands/opsx-finish.md`，使其 Step 3b 的测试命令分派与实战版一致（自带入口优先 / 候选冲突询问 / 环境类先甄别 / 语言兜底）；替换后 MUST 把 skill 路径还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`。
- **BUG008**（用户指挥）：把实战版的三块内容（Step 5 全量 artifact 循环 + TodoWrite、Output 计数写法、Artifact Creation Guidelines）同步进 `template/.opencode/commands/` 的 `opsx-propose.md` / `opsx-new.md` / `opsx-ff.md`。同步的是内容而非整文件覆盖。
- **F002**（AI 执行）：支持多分支 base——模板面 5 条命令（propose/finish/ff/new/continue）以「当前 / 原分支」为 base；代码面 A1（`src/registry.ts` 的 `RegistryEntry.baseBranch` + `add()` 合并语义）+ B2（`src/cli/index.ts` 的 `runEnsureWorktree` 写入 base、`handleRegistry add` 解析可选 `--base`）必须同时落地。

顺序不可颠倒：BUG007 是整文件替换 `opsx-finish.md`、BUG008 同步 `opsx-propose.md`，而 F002 的模板面改的正是这两个文件——先做 F002 会被整文件替换覆盖。全流程 base 钉死为 `release/1.1`，MUST NOT 触碰 `main`。

## Alternatives Considered

### 方案 A：把 base 写进注册表条目的 `baseBranch` 字段（R1，主记录）
- **做法**：`ensure-worktree` 创建 worktree 成功后读 `git rev-parse --abbrev-ref HEAD`，写入注册表的 change 条目；`finish` 的 Step 6a 从【项目根】`openspec/oso-change-registry.json` 读该字段。
- **优点**：`oso-change-registry.json` 由 oso 自己读写，openspec CLI 完全不碰，无外部重写风险；`RegistryEntry` 已有 `[key: string]: unknown` 索引签名，扩展成本低；生命周期精确匹配（propose 建 → finish 删）；语义一致（注册表本就是「这个 change 在哪」的权威记录）。
- **缺点**：需少量代码改动（`registry.ts` + `cli/index.ts`）；finish 结束时条目被删，归档后无法再从注册表查 base。
- **为何采用**：缺点可用 R2 兜底（`proposal.md` 抬头 `> Base:` 随归档永久保留），是本设计的主记录。

### 方案 B：finish 时直接问用户（Q，兜底）
- **做法**：finish 的 Step 6a 每次都询问用户「这个 change 的 base 分支是哪个？」
- **优点**：零状态、零代码改动。
- **缺点**：每次都要问；用户可能记错；不满足「base 可追溯、不靠猜」的目标。
- **为何未采用为唯一手段**：仅作为 R1 读不到时的兜底（Q），不单独使用。

### 方案 C：用 git 自己推断（G，被排除）
- **做法**：`git merge-base` / reflog / `.git/worktrees/<name>/` 推断 base。
- **优点**：无需额外状态。
- **缺点（2026-10-30 实测，排除依据）**：`ensure-worktree` 用 `git worktree add <path> -b <branch>`（**无 commit-ish**），此时 `git reflog show feature/<name>` 只写下 `branch: Created from HEAD`，**不含 base 分支名**；分支无 upstream；`.git/worktrees/<name>/` 只有 HEAD/ORIG_HEAD/index/logs，**不含 base**。且当 `main` 与 `release/1.1` 指向同一提交时，从任一分支切出的 feature 对两者的 merge-base **完全相同**，无法区分——而选错正是本项目要防的历史污染。
- **为何未采用**：不可靠，只能作兜底，不能作主记录。

## Agreed Approach

采用 **R1 + R2 + Q**：

1. **R1 主记录**：`ensure-worktree` 创建成功后，在【项目根】（cwd 那一刻仍在项目根，是「切出 base」的唯一正确观察点）读当前分支，经 `registry.add(path, name, worktree, baseBranch)` 写入注册表条目的 `baseBranch`。
2. **R2 追溯**：propose 生成 `proposal.md` 后，在抬头插入 `> Base: <BASE_BRANCH>`，随 change 归档永久保留，供人回溯。
3. **Q 兜底**：`finish` 的 Step 6a 先读【项目根】`openspec/oso-change-registry.json` 的 `baseBranch` → 读不到用 `question` 工具问用户 → 仍无法确定 STOP；**任何情况下不默认 `main`**。
4. **A1+B2 同时落地**：`add()` 改**合并语义**（`{...旧条目, name, worktree, createdAt, ...(base ? {baseBranch} : {})}`，不写 `undefined` 空键）。只做 A1 不做 B2（或不改合并语义），Step 3a 写入的 `baseBranch` 会被 Step 4a 的 `registry add`（不带 `--base`）整条替换**静默抹掉**。
5. **模板文本**：5 条命令把硬编码 `main` 改为「原分支 / 当前分支」；propose 新增 2d（只读当前分支 + 打印，不传 `--base`）；finish 重写 Step 6a + 3 处选项注释 + 新增「方向约束（MUST）」段；占位符 `<base>` → `<base-branch>`；工具名 `AskUserQuestion` → `question`。

## Key Decisions

- **合并语义是 A1 的生死线**：`add()` 必须 `{...旧条目, ...}` 合并而非整条替换，否则 3a→4a 之间 base 静默丢失且无报错。
- **`finish` 读注册表文件，不读 `registry list`**：`list()` 只拼 `name/worktree/age` 三列，不输出 `baseBranch`；`mergeList` 同样不带；且 finish 时 cwd 在 `.worktrees/<name>` 内，该 worktree **没有**注册表文件（gitignored，不随 worktree 复制），必须显式指向【项目根】路径。
- **propose 只读不打断、finish 必须问**：propose 时 base 就在 HEAD 上，故只读不打断用户；finish 时 HEAD 已是 `feature/<name>`，base 无法从环境读出，只能来自「用户指定 → 注册表 → 询问」——MUST NOT 因 propose 不问就删掉 6a 的询问。
- **BUG007 整文件替换后必须还原 `{{SUPERPOWERS_BASE_PATH}}`**：实战版是 `C:\Users\...\.cache\...` 的本机绝对路径，直接进模板会让所有用户指错位置；模板 MUST NOT 含任何本机绝对路径。
- **范围只到 5 条模板命令**：`opsx-ff` / `opsx-new` 的「跳到 Step N」不需要改（base 记录由 `ensure-worktree` 代码完成，不必各插 2d 段）；`opsx-sync` / `opsx-archive` 等不在范围内。
- **只落 `release/1.1`**：`main`（2.0.0 线）的同源改动由 V2 线任务 BUG014 承接，本 change MUST NOT 触碰 `main`。

## Open Questions

- 无。范围、裁决、验收均已由 Sprint 1 T003 开工命令与 `2026-10-29-opsx-propose-finish-base分支修复方案.md` 固定；BUG007 / BUG008 的实现由用户在 apply 阶段指挥（AI 默认只复核与报告）。
