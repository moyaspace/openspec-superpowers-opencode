## Why

Superpowers 已发布 v7.0.1，但 V1 线（1.1.2）对 v7 的支持是残缺的：`template/` 只有 v5 / v6 两份 lock，`selectLockFile` 在无精确匹配时静默回退到字典序第一个（`skills.lock.v5.json`），v7 用户 `oso init` 会看到 5 个 hash 不匹配 + 2 个文件不存在的假警告，且无从得知根因；v6.2+ 用户（`skills.lock.v6.json` 仍停在 v6.1.1）也在持续报假警告。更严重的是 `/opsx-apply` 只借了 subagent-driven-development 的「皮」——它用了 SDD 的两个 prompt 模板与两个脚本，却用自研简化版重跑 Step 5/6，从未执行 SDD 的控制器逻辑（preflight、fix-loop、BLOCKED 处理、final review、resuming、ledger 全缺），交付的是阉割版能力。本 change 把 v7 支持一次补齐：新增 v7 lock、把 v6+ 的 apply 整体委托上游 SDD、修掉 lock 选择的静默回退、刷新 v6 lock，并补 bash 检测、分发清单与三版本文档。

## What Changes

**Lock 选择（BUG012，代码）**
- From: `selectLockFile(templateDir, major)` 精确匹配失败后，用 `readdirSync(...).sort()[0]` 回退到字典序第一个 lock —— v7 用户永远拿到 v5 清单。
- To: 精确匹配优先；无匹配时按 major 高于/低于支持范围分别明确提示「暂不受支持 / 已不受支持」，**跳过**完整性校验而非中止 init；绝不跨 major 复用清单。
- Reason: 跨 major 校验本身无意义，错误清单掩盖真实根因。
- Impact: 非破坏性；`selectLockFile` 在无匹配时返回 `null`，调用方改为输出可读提示。

**v7 lock（F001）**
- From: `template/` 下只有 `skills.lock.v5.json` / `skills.lock.v6.json`。
- To: 新增 `template/skills.lock.v7.json`，`upstream.commit = 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`（v7.0.1），6 条目（brainstorming / writing-plans / subagent-driven-development 的 SKILL.md + implementer-prompt + task-reviewer-prompt / test-driven-development）；hash 在 v7.0.1 实际文件上重算并与参考值逐条核对。
- Reason: 没有 v7 lock，v7 用户无法通过完整性校验。
- Impact: 新增文件；`npm pack` 需纳入清单。

**v6 lock 刷新（BUG013）**
- From: `upstream.commit = d884ae04…`（= v6.1.1），v6.4.2 下 6 个文件全部 hash 不匹配。
- To: 刷新到 v6.4.2（commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`）。
- Reason: v6.2+ 用户持续看到假警告，掩盖真实问题。
- Impact: 仅该 lock 文件；v5 lock 不动（决策：不修）。

**`opsx-apply` 委托 SDD（F001，模板）**
- From: Step 4a 按版本列举要 Read 的 v6 文件清单；Step 5/6 的 v6 分支自编排（`task-brief` + implementer 模板 + 手工摘 TDD + `review-package` + task-reviewer + 单次 oracle 审查）。
- To: Step 4 = Read `subagent-driven-development/SKILL.md`（失败 STOP）+ 确认 `scripts/` 下 `task-brief` / `review-package` / `sdd-workspace` 三脚本存在；之后严格按 SKILL.md 执行（v7 含 7 份 references）；Step 5–6 交给 SDD，OSO 只留两条额外约束（status=done → 勾 `tasks.md`；不得改 `openspec/schemas/` 与 `openspec/config.yaml`）；补 **bash 调用写法**、**SDD→OMO 语法映射**、**tasks.md 勾选契约**三节。**v5 分支原样保留**。
- Reason: 不复刻控制器逻辑，能力由上游 SDD 提供（preflight / fix-loop ≤5 轮 / BLOCKED / final review / resuming 全在）。
- Impact: `oso init` 后所有 v6+ 用户的 apply 流程变化；v5 用户不回归。

**schema 口径同步（F001，模板）**
- From: `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 apply 段仍描述 v5 / v6 两套自编排。
- To: apply 段（pre-flight + 审查方式）改为委托口径，与 `opsx-apply.md` 一致。
- Reason: 主会话会读 schema 的 apply 指令；两处口径不一致会把 AI 引回自编排。
- Impact: 仅模板 schema 文件。

**bash 检测（F001，代码）**
- From: `runAllChecks` 共 5 项，无 bash 检查。
- To: 增第 6 项「bash 可用」；仅在 Superpowers major ≥ 6 时检查；不可用 → ⚠ + 安装提示（Windows 查 PATH + Git for Windows 三个默认路径），不判失败；init 的 8/8 输出可打印一行，复用同一检测函数。
- Reason: SDD 三个脚本都是 bash 脚本，Windows 缺 bash 会让逐任务实现全挂。
- Impact: 只报告不持久化（V1 无 `.oso/config.yaml`）。

**分发清单与文档（F001）**
- From: `ci.yml` 的 tarball 清单只含 v5 / v6 lock；兼容文档只覆盖 v5 / v6。
- To: 清单加入 `package/template/skills.lock.v7.json`；`docs/superpowers-dual-version-compatibility.md` 扩为 v5 / v6 / v7，记录三个既存问题（v6 lock 过期、v5 lock 拼凑、v5 分支引用的 reviewer prompt 自 v6 起不存在），说明 v7 的 brainstorming 体量分流 + 强制批准门，以及 OSO 明确覆盖该分流（始终走完整 artifacts 流程）。
- Reason: 分发缺文件会导致已发布包在 v7 环境下找不到 lock；文档不覆盖 v7 会让人按旧路径操作。
- Impact: CI 与文档。

**`finish` 措辞更正（追加范围，未编号，【用户指挥】）**
- From: `template/.opencode/commands/opsx-finish.md` 中由用户指出的措辞问题。
- To: 按用户逐条给出的目标表述更正。
- Reason: 措辞不准确会误导读者。
- Impact: 仅模板命令文本；AI 默认只复核与报告，用户明确指派后才执行。

## Capabilities

### New Capabilities

- `superpowers-v7-support`: v7 lock 基线与完整性校验、v6+ 的 apply 委托上游 SDD（含委托段三件补）、schema apply 口径一致、`oso verify` 的 bash 可用性检查、分发清单完整性、v5/v6/v7 三版本兼容文档。
- `skill-lock-selection`: lock 选择的确定性契约 —— 精确匹配优先、无匹配时按支持范围明确提示、绝不跨 major 复用清单，以及与之同步的测试断言。
- `v6-lock-refresh`: `skills.lock.v6.json` 的基线刷新到 v6.4.2，使 v6.2+ 用户不再看到假警告，同时明确 v5 lock 不作为准确基线。

### Modified Capabilities

<!-- 无既有 capability 的需求被修改；openspec/specs/ 当前为空。 -->

## Impact

- 代码：`src/setup/discovery.ts`（`selectLockFile`）、`src/setup/index.ts`（两个调用点的「不支持」提示）、`src/verify.ts`（`runAllChecks` 第 6 项 + bash 检测函数）。
- 模板：`template/skills.lock.v7.json`（新增）、`template/skills.lock.v6.json`（刷新）、`template/.opencode/commands/opsx-apply.md`（v6+ 委托）、`template/openspec/schemas/superpowers-bridge-opencode/schema.yaml`（apply 段）、`template/.opencode/commands/opsx-finish.md`（用户指挥的措辞）。
- 测试：`test/setup-discovery.test.js`（断言改为 v7 lock + 新增「超出支持范围不回退」用例）、`test/verify.test.js` 或 `test/setup-verify-registry.test.js`（bash 检测项）、模板一致性测试（v6+ 委托段与三件补、v5 分支未动）。
- CI / 文档：`.github/workflows/ci.yml`（tarball 清单）、`docs/superpowers-dual-version-compatibility.md`（三版本）。
- 不触碰：`main`（V2.0 线）、`template/skills.lock.v5.json`（决策：不修）、部署版 `.opencode/commands/`（gitignored，除非用户当场指示）、版本号 / `npm publish` / dist-tag（T005）、2.0 设施（oso-core、插件、`supported-versions`、`.oso/config.yaml`）。
