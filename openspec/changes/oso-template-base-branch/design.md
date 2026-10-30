## Context

`ensure-worktree` 用 `git worktree add ".worktrees/<name>" -b "feature/<name>"`（**无 commit-ish**）从**当前 HEAD** 切出，所以 base 在机制上是「跟着当前分支走」的正确值。但这条信息**从未落盘**：propose 文本把它写成 `main`（硬编码），finish 的 Step 6a 只能靠「通常是 main 或 master」猜。结果：机制支持任意 base，但文本不告诉 AI，且 base 事后不可追溯。

本 change 在 `release/1.1` 上工作，base 固定为 `release/1.1`，`main`（2.0.0 线）的同源改动归 BUG014，不在本次范围。

`template/.opencode/commands/` 是 `oso init` 的发布源（入库）；`.opencode/commands/` 是本机部署版（gitignored，T006 已改好，本 change 不再动）。修复发布源才会影响所有用户。

## Goals / Non-Goals

**Goals:**
- base 可配置：propose 记录 base（注册表 `baseBranch` + `proposal.md` 抬头），finish 读回 base 而非默认 `main`。
- 代码 A1（`RegistryEntry.baseBranch` + `add()` 合并语义）+ B2（`ensure-worktree` 写入 base、`add --base`）同时落地，杜绝 base 被静默抹掉。
- 模板 5 条命令（propose/finish/ff/new/continue）文本以「原分支/当前分支」为 base，无裸 `main`、无操作型 `git checkout/switch/merge/rebase … main`。
- BUG007：template 的 `opsx-finish` Step 3b 与实战版一致，模板无本机绝对路径、保留 `{{SUPERPOWERS_BASE_PATH}}`。
- BUG008：template 的 propose/new/ff 三块（Step 5 循环 / Output 计数 / Guidelines）与实战版一致。

**Non-Goals:**
- `main`（2.0.0 线）的 template 同源改动（→ BUG014）。
- 部署版 `.opencode/commands/`（→ T006，已定稿）。
- 版本号 bump / npm publish / dist-tag（→ T005）。
- Superpowers v7 支持（→ T004）。
- BUG007 的「Go + `//go:embed` 真实仓库实跑」（用户自行决定，不纳入验收）。

## Decisions

**D1 — base 记在注册表条目 `baseBranch`（R1 主记录）+ `proposal.md` 抬头（R2 追溯）+ 询问（Q 兜底）。**
理由见 brainstorm 备选方案 A/B/C：注册表由 oso 独占读写、生命周期匹配；git 推断（G）不可靠（reflog 只记 `Created from HEAD`，merge-base 在同提交时无法区分），已排除。

**D2 — `add()` 必须合并语义，不能整条替换。**
入口形态：`add(registryPath, name, worktree, baseBranch?)`，条目 `{ ...(idx>=0 ? data.changes[idx] : {}), name, worktree: normalizedWt, createdAt, ...(baseBranch !== undefined ? { baseBranch } : {}) }`。
- 用条件展开而非 `baseBranch: undefined`，避免写空键。
- propose 有两次写：Step 3a（`ensure-worktree` 带 `baseBranch`）→ Step 4a（`registry add` **不带** `--base`，只更新 name/worktree/createdAt）。若整条替换，3a 写入的 `baseBranch` 会被 4a 静默抹掉、finish 读不到 base，功能失效且无报错——**这是 A1 的生死线**。

**D3 — base 的唯一正确观察点在 `runEnsureWorktree`，不是 Step 4a。**
`git worktree add` 成功后 `cwd` 仍在【项目根】，此时 `git rev-parse --abbrev-ref HEAD` = 真 base。Step 4a 时 cwd 已 `.worktrees/<name>`，读到的是 `feature/<name>`，**必然错**。故 base 由代码在 ensure-worktree 写入，命令文本**不传 `--base`**（绑在代码上不受重新部署影响）。

**D4 — `finish` 的 Step 6a 读【项目根】注册表文件，不读 `registry list`。**
`list()` / `mergeList()` 不输出 `baseBranch`；finish 时 cwd 在 worktree 内，该 worktree 无注册表文件（gitignored）。故 Step 6a 显式读 `<项目根>/openspec/oso-change-registry.json` 的 `baseBranch` → 读不到用 `question` 问 → 仍无法确定 STOP。**不再有「用户本次指定 base」这一步**（用户口头说明视为最高优先，但那是用户的话，不是 AI 去解析的步骤）。

**D5 — propose 只读不打断，finish 必须问。**
propose 的 base 就在 HEAD 上，2d 段只读 + 打印 + 带进 Output，不传 `--base`、不调 `question`；finish 的 HEAD 已是 `feature/<name>`，base 无法从环境读出，MUST 保留询问兜底。

**D6 — BUG007 整文件替换 + 还原 `{{SUPERPOWERS_BASE_PATH}}`。**
V1 实战版 `opsx-finish.md` 的 Step 3b 已含「自带入口优先 + 冲突询问 + 环境先甄别 + 语言兜底」，但其 skill 路径是 `C:\Users\...\.cache\...` 本机绝对路径，替换后 MUST 还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`，否则所有用户 `oso init` 后指错位置。

**D7 — 顺序不可颠倒：BUG007 → BUG008 → F002 模板文本。**
BUG007 整文件替换 `opsx-finish.md`、BUG008 同步 `opsx-propose.md`，而 F002 的模板面改的正是这两个文件；先做 F002 会被整文件替换覆盖。

## Risks / Trade-offs

- [A1/B2 只做一个 → base 静默丢失，无报错] → A1+B2 必须同一提交/同批落地；测试用「不带 `--base` 时保留已有 `baseBranch`」断言锁定（方案 §3.7 第 2 条）。
- [finish 时注册表条目已被删，归档后 base 不可追溯] → R2 兜底：`proposal.md` 抬头 `> Base:` 随归档永久保留，MUST 保留。
- [BUG007 整文件替换删掉模板的 V2 门禁/内容（若模板含）] → 本 change 只落 `release/1.1`；替换后逐条核对保留 Step 3b 内容、无本机绝对路径、`{{SUPERPOWERS_BASE_PATH}}` 在位、命令数仍为模板既有数量。
- [改模板文字打挂既有测试] → 已核实无测试断言「回 main」「通常是 main」，改文字不挂测试；但新增断言（§3.7）与既有全量测试须全绿。
- [base 误判污染历史] → 开工命令钉死 base = `release/1.1`；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`（部署版这三条仍硬编码 main）。
- [重新部署覆盖本机部署版] → 本 change 只改 template 发布源，不动部署版；部署版由 T006 负责且已定稿。
