## Context

`ensure-worktree` 用 `git worktree add ".worktrees/<name>" -b "feature/<name>"`（**无 commit-ish**）从**当前 HEAD** 切出，所以 base 在机制上是「跟着当前分支走」的正确值。但这条信息**从未落盘**：propose 文本把它写成 `main`（硬编码），finish 的 Step 6a 只能靠「通常是 main 或 master」猜。结果：机制支持任意 base，但文本不告诉 AI，且 base 事后不可追溯。

本 change 在 `release/1.1` 上工作，base 固定为 `release/1.1`，`main`（2.0.0 线）的同源改动归 BUG014，不在本次范围。

`template/.opencode/commands/` 是 `oso init` 的发布源（入库）；`.opencode/commands/` 是本机部署版（gitignored，T006 已改好，本 change 不再动）。修复发布源才会影响所有用户。

## Goals / Non-Goals

**Goals:**
- base 可配置：propose（2d→4a）、ff（2d→4a）、new（3d→5a）都在切 worktree 前读出 base、在 `registry add --base` 时写入 `baseBranch`；finish 经 `openspec list --json` 读回 base 而非默认 `main`。
- 代码 A1（`RegistryEntry.baseBranch` + `add()` 合并语义）+ B2（`registry add --base` 解析；`ensure-worktree` 不读不写 base）同时落地，杜绝 base 被静默抹掉。
- 模板 5 条命令（propose/finish/ff/new/continue）文本以「原分支/当前分支」为 base，无裸 `main`、无操作型 `git checkout/switch/merge/rebase … main`。
- BUG007：template 的 `opsx-finish` Step 3b 与实战版一致，模板无本机绝对路径、保留 `{{SUPERPOWERS_BASE_PATH}}`。
- BUG008：template 的 `opsx-propose` 三块（Step 5 循环 / Output 计数 / Guidelines）与实战版一致；`opsx-ff` 本已一致，`opsx-new` 保持脚手架定位、不移植三块。

**Non-Goals:**
- `main`（2.0.0 线）的 template 同源改动（→ BUG014）。
- 部署版 `.opencode/commands/`（→ T006，已定稿）。
- 版本号 bump / npm publish / dist-tag（→ T005）。
- Superpowers v7 支持（→ T004）。
- BUG007 的「Go + `//go:embed` 真实仓库实跑」（用户自行决定，不纳入验收）。

## Decisions

**D1 — base 记在注册表条目 `baseBranch`（R1 主记录）+ `openspec list --json` 读回（D8）+ 询问（Q 兜底）。**
（原 R2「`proposal.md` 抬头 `> Base:`」已弃用，见 D9。）
理由见 brainstorm 备选方案 A/B/C：注册表由 oso 独占读写、生命周期匹配；git 推断（G）不可靠（reflog 只记 `Created from HEAD`，merge-base 在同提交时无法区分），已排除。

**D2 — `add()` 必须合并语义，不能整条替换。**
入口形态：`add(registryPath, name, worktree, baseBranch?)`，条目 `{ ...(idx>=0 ? data.changes[idx] : {}), name, worktree: normalizedWt, createdAt, ...(baseBranch !== undefined ? { baseBranch } : {}) }`。
- 用条件展开而非 `baseBranch: undefined`，避免写空键。
- propose 只在 Step 4a 写一次：`registry add <name> .worktrees/<name> --base <BASE_BRANCH>`（值来自 2d 的只读结果）；2d 本身不写。若之后再有 `registry add` 不带 `--base`（如重跑 4a），合并语义保证已有 `baseBranch` 不被抹掉——**这是 A1 的生死线**。

**D3 — base 在「创建 worktree 之前」（项目根）读出，在各命令自己的 `registry add` 步骤写入。**
propose 2d / ff 2d / new 3d 时 cwd 是项目根、worktree 尚未创建，`git rev-parse --abbrev-ref HEAD` 即真 base；到注册步骤时已 `cd .worktrees/<name>`，HEAD 是 `feature/<name>`，**必然错**，所以不能现读，只能把之前读到的值当变量带过去写入（propose 4a / ff 4a / new 5a）。写入点唯一：命令文本里的 `registry add --base`；`ensure-worktree` **不再**读或写 base（早返回路径更不会写）。

**D4 — `finish` 的 Step 6a 通过 `openspec list --json` 读 `baseBranch`，不直接读注册表文件。**
`list()` / `mergedList()` 的**文本**输出不含 `baseBranch`，但 shim 的 `mergeListJson()` 会注入它（见 D8），且 `openspec list --json` 在 worktree 内执行时 shim 会自行回到项目根找到注册表。故 Step 6a：`openspec list --json` → 取本 change 的 `baseBranch` → 读不到用 `question` 问 → 仍无法确定 STOP。**不再有「用户本次指定 base」这一步**（用户口头说明视为最高优先，但那是用户的话，不是 AI 去解析的步骤）。

**D8 — `finish` 读 base 的通道：`openspec list --json`（shim 注入 `baseBranch`）。**
`src/registry-utils.ts` 的 `MergedChange` 加 `baseBranch?: string`，`mergeListJson()` 在命中 registry 条目时注入（无值不写键）。理由：命令文本直接读 `openspec/oso-change-registry.json` 既跨平台麻烦、又把文件格式耦合进提示词；shim 已是 list 的官方出口，由它统一注入即可。**命令文本 MUST NOT 直接解析注册表文件。** propose 不走这个通道（它 2d 读、4a 写），只有 finish 需要回读。

**D9 — 弃用 `proposal.md` 抬头 `> Base:`（D1 的 R2 部分作废）；2d 保留为只读。**
注册表 + `openspec list --json` 已覆盖流程需求；跨机器/归档后追溯不在本 change 目标内，故不再写 `> Base:` 抬头。2d 保留：它在切 worktree 前从项目根 HEAD 读出 base，是 4a 写入值的唯一来源，不可跳过。

**D5 — 创建型命令只读不打断，finish 必须问。**
propose / ff / new 在各自的读取步（2d / 2d / 3d）只读并打印，把值带到注册步（4a / 4a / 5a）用 `--base` 写入，全程不调 `question`；finish 的 HEAD 已是 `feature/<name>`，base 无法从环境读出，MUST 通过 `openspec list --json` 回读，读不到再问、仍无法确定则 STOP。

**D6 — BUG007 整文件替换 + 还原 `{{SUPERPOWERS_BASE_PATH}}`。**
V1 实战版 `opsx-finish.md` 的 Step 3b 已含「自带入口优先 + 冲突询问 + 环境先甄别 + 语言兜底」，但其 skill 路径是 `C:\Users\...\.cache\...` 本机绝对路径，替换后 MUST 还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`，否则所有用户 `oso init` 后指错位置。

**D7 — 顺序不可颠倒：BUG007 → BUG008 → F002 模板文本。**
BUG007 整文件替换 `opsx-finish.md`、BUG008 同步 `opsx-propose.md`，而 F002 的模板面改的正是这两个文件；先做 F002 会被整文件替换覆盖。

## Risks / Trade-offs

- [A1/B2 只做一个 → base 静默丢失，无报错] → A1+B2 必须同一提交/同批落地；测试用「不带 `--base` 时保留已有 `baseBranch`」断言锁定（方案 §3.7 第 2 条）。
- [finish 时注册表条目已被删，归档后 base 不可追溯] → 接受：本 change 不做归档后追溯；原 R2「`proposal.md` 抬头 `> Base:`」方案已弃用（见 D9）。跨机器追溯同理不在范围。
- [BUG007 整文件替换删掉模板的 V2 门禁/内容（若模板含）] → 本 change 只落 `release/1.1`；替换后逐条核对保留 Step 3b 内容、无本机绝对路径、`{{SUPERPOWERS_BASE_PATH}}` 在位、命令数仍为模板既有数量。
- [改模板文字打挂既有测试] → 已核实无测试断言「回 main」「通常是 main」，改文字不挂测试；但新增断言（§3.7）与既有全量测试须全绿。
- [base 误判污染历史] → 开工命令钉死 base = `release/1.1`；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`（部署版这三条仍硬编码 main）。
- [重新部署覆盖本机部署版] → 本 change 只改 template 发布源，不动部署版；部署版由 T006 负责且已定稿。
