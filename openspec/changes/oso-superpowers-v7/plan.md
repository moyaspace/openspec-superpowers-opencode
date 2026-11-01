# oso-superpowers-v7 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> 本计划的 #10（`finish` 措辞更正）是【用户指挥】步骤：AI 默认只复核与报告，等用户逐条给出后再执行。
> 全程 base = `release/1.1`（`b4ba0a098`）；MUST NOT 触碰 `main`；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`。

**Goal:** 让 V1 线（1.1.2）在 Superpowers v7 下 `oso init` 无警告、`/opsx-apply` 拿到完整 SDD 能力；同时修掉 `selectLockFile` 的跨 major 静默回退（BUG012）与 v6 锁清单过期（BUG013），v5 能力不回归。

**Architecture:** 三层改动同批落地 —— ① 数据层：三份锁清单（新增 v7、刷新 v6、v5 不动）；② 代码层：`selectLockFile` 只做精确匹配、调用方负责「不支持」提示，`verify` 增 bash 检查（新 `warn` 状态）；③ 文本层：`opsx-apply.md` 的 v6+ 分支整体委托上游 SDD（v5 不动）+ `schema.yaml` 的 apply 段同口径 + 三版本文档 + CI 清单。

**Tech Stack:** TypeScript（ESM，`node --test`）、node:test、PowerShell / Git Bash。测试入口 `npm test`（= typecheck + build + `node --test "test/*.test.js"` + elevated）；本机若 `9009`（spawn 环境类失败）改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差。`.js` 测试 import `../dist/...`，故改 `src/` 后必须先 `npm run build`。

---

## Task 1: 准备 hash 计算源（v7.0.1 / v6.4.2）

- [ ] **Step 1:** 确认 v7.0.1 干净 checkout 可用（commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，本地参照 `%TEMP%\opencode\sp-v7`）。
- [ ] **Step 2:** 获取 v6.4.2 干净 checkout（commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`），例如 `git clone --filter=blob:none https://github.com/obra/superpowers %TEMP%\opencode\sp-v6.4.2` 后 `git -C … checkout 8ca22dba`。
- [ ] **Step 3:** 若拿不到 v6.4.2 → 停下，把 BUG013 的 hash 项标记为「未验」并报告；**不得**用参考值或 v6.1.1 的旧值充数。
- [ ] **Step 4:** 记录 6 个目标文件相对路径：`brainstorming/SKILL.md`、`writing-plans/SKILL.md`、`subagent-driven-development/SKILL.md`、`subagent-driven-development/implementer-prompt.md`、`subagent-driven-development/task-reviewer-prompt.md`、`test-driven-development/SKILL.md`。

## Task 2: BUG012 — 测试先行（RED）

- [ ] **Step 1:** 打开 `test/setup-discovery.test.js`，定位「selects the matching lock and otherwise falls back deterministically」用例。
- [ ] **Step 2:** 用例改为：临时目录写入 `skills.lock.v5.json`、`skills.lock.v6.json`、`skills.lock.v7.json`；断言 `selectLockFile(templateDir, '6')` → v6、`selectLockFile(templateDir, '7')` → **v7**；用例名去掉 "falls back deterministically"（改为 "selects the exact major lock"）。
- [ ] **Step 3:** 新增用例「returns no lock when the major is unsupported」：同一临时目录下断言 `selectLockFile(templateDir, '8')` 为 `null`、`selectLockFile(templateDir, '4')` 为 `null`、`selectLockFile(templateDir, null)` 为 `null`。
- [ ] **Step 4:** 运行 `node --test test/setup-discovery.test.js`，确认 **RED**（'7' 仍返回 v5 lock）并保存输出。
- [ ] **Step 5:** Commit：`test: forbid cross-major lock fallback (RED)`

## Task 3: BUG012 — `selectLockFile` 只做精确匹配（GREEN）

- [ ] **Step 1:** `src/setup/discovery.ts` 删除 `readdirSync(...).sort()[0]` 回退分支，函数体收敛为「有精确匹配则返回该路径，否则 `null`」。
- [ ] **Step 2:** 同文件新增并导出 `listLockMajors(templateDir: string): string[]` —— 读取 `skills.lock.v<major>.json`，提取 major 后按数值升序返回；目录不存在或无私锁清单时返回空数组。
- [ ] **Step 3:** `npm run build`（0 error）。
- [ ] **Step 4:** `node --test test/setup-discovery.test.js` → **GREEN**。
- [ ] **Step 5:** Commit：`fix(discovery): select lock file by exact major only (BUG012)`

## Task 4: BUG012 — 调用方输出可读的「不支持」并跳过校验

- [ ] **Step 1:** `src/setup/index.ts` 第一处调用（约第 387 行）：`lockFile` 为 `null` 时，用 `listLockMajors` 判定并输出三选一提示（高于 → 「暂不受支持，跳过完整性校验」；低于 → 「已不受支持」；缺口 → 「未找到 v{major} 的锁清单」），随后**跳过**逐技能校验继续后续步骤。
- [ ] **Step 2:** 删除 `throw new Error('No skills lock file was found in the template')`（两处调用点共用同一处理逻辑，抽成小函数避免重复）。
- [ ] **Step 3:** 第二处调用（约第 603 行）改为复用同一处理逻辑。
- [ ] **Step 4:** 在既有 init 行为测试中补一条：模板只有 v5/v6/v7 清单、Superpowers 版本报 v8 → init 不抛错，输出含「不受支持」类提示。（`test/setup-api.test.js` 或 `test/setup-deploy.test.js`，按现有 init 覆盖选择，不新增重复测试文件。）
- [ ] **Step 5:** `npm run build` + 相关测试通过；`git diff --stat` 确认 `template/skills.lock.v5.json` 未被改动。
- [ ] **Step 6:** Commit：`fix(setup): report unsupported Superpowers major instead of wrong lock (BUG012)`

## Task 5: BUG013 — 刷新 `template/skills.lock.v6.json` 到 v6.4.2

- [ ] **Step 1:** 对 v6.4.2 checkout 的 6 个文件计算 SHA-256（`Get-FileHash -Algorithm SHA256` 或 `node -e` 逐文件），输出大写十六进制。
- [ ] **Step 2:** 只替换 `template/skills.lock.v6.json` 的 `upstream.commit`（→ `8ca22dba9a94f28898bbce59f2537ff4d87c747d`）与 6 个 `sha256`；结构与键顺序不动。
- [ ] **Step 3:** 复核：`upstream.commit` 正确；6 个值与 Step 1 输出逐条一致；`git diff` 只有该文件。
- [ ] **Step 4:** Commit：`chore(lock): refresh skills.lock.v6 to Superpowers v6.4.2 (BUG013)`

## Task 6: 新增 `template/skills.lock.v7.json`

- [ ] **Step 1:** 对 v7.0.1 checkout 的同样 6 个文件计算 SHA-256。
- [ ] **Step 2:** 与开工命令的 6 条参考值逐条比对；**任一不一致 → 停下报告**（先确认上游是否已换版本），不得默默采用。
- [ ] **Step 3:** 写入 `template/skills.lock.v7.json`：`schema` / `version` / `upstream.repo` 与 v6 文件同构，`upstream.commit = 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，`skills` 6 个条目。
- [ ] **Step 4:** 复核：每个 `sha256` 为 64 位大写十六进制；条目键与格式与 v6 文件一致（便于 diff 阅读）。
- [ ] **Step 5:** Commit：`feat(lock): add skills.lock.v7 for Superpowers v7.0.1 (F001)`

## Task 7: `opsx-apply.md` 的 v6+ 分支委托改造（模板）

- [ ] **Step 1:** 先记录 v5 分支原文（Step 4a 的 4 个 v5 Read 项、Step 5 的 v5 流程、Step 6 的两步审查），作为后续「零改动」比对基线。
- [ ] **Step 2:** Step 4a 改写：Read `{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md`（失败 → STOP，不得静默降级）+ 确认 `scripts/task-brief` / `review-package` / `sdd-workspace` 存在；删除 v6 的列举式 Read 清单。
- [ ] **Step 3:** Step 5 的 v6 分支替换为委托段 —— 按 SKILL.md 执行（含其指引的 references，v7 为 7 份），不再自编排 `task-brief` + implementer 模板 + 手工摘 TDD。
- [ ] **Step 4:** Step 6 的 v6 分支替换为委托段 —— 实现与审查交给 SDD；OSO 两条额外约束（`status = done` → 勾 `tasks.md`；不得改 `openspec/schemas/` 与 `openspec/config.yaml`）。
- [ ] **Step 5:** 在 Step 4a 之后、Step 5 之前插入三节：① bash 调用写法（Windows MUST `bash <脚本路径>`，脚本无执行位）；② SDD → OMO 映射表（含 `load_skills` 对 Superpowers 技能静默忽略的说明）；③ tasks.md 勾选契约。
- [ ] **Step 6:** 比对校验：v5 分支与 Step 1 基线逐行一致；`grep -c 'C:\\Users'` = 0；`{{SUPERPOWERS_BASE_PATH}}` 在位；无裸 `main`。
- [ ] **Step 7:** Commit：`feat(template): delegate opsx-apply to upstream SDD for v6+ (F001)`

## Task 8: `schema.yaml` 的 apply 段同口径

- [ ] **Step 1:** apply 段「Pre-flight」改为 Read SKILL.md + 确认三脚本（失败 STOP）；删除按 v6 列举文件的段落。
- [ ] **Step 2:** apply 段「Executor / 审查方式」改为委托口径，并补 bash 调用写法与语法映射的指路（与 `opsx-apply.md` 措辞一致）。
- [ ] **Step 3:** 复核：`spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md` 只出现在 v5 描述中；与 `opsx-apply.md` 的 v6+ 分支逐条一致。
- [ ] **Step 4:** Commit：`docs(schema): align apply section with SDD delegation (F001)`

## Task 9: bash 检测（`src/verify.ts` + init 一行）

- [ ] **Step 1:** 先写失败测试：主版本 ≥ 6 且 bash 不可用 → 结果含 `bash` 项、状态 `warn`、`allPass` 为真；主版本 < 6 → 结果无 `bash` 项。
- [ ] **Step 2:** 运行测试确认 **RED**。
- [ ] **Step 3:** `src/verify.ts`：`CheckResult.status` 增加 `'warn'`；`allPass` 视为通过；`formatResults` 对 `warn` 输出 ⚠ 与修复提示。
- [ ] **Step 4:** 新增 `detectBash(isWin)`：Windows 先 `where bash`，再查 `C:\Program Files\Git\bin\bash.exe`、`C:\Program Files (x86)\Git\bin\bash.exe`、`%LOCALAPPDATA%\Programs\Git\bin\bash.exe`；类 Unix 用 `which bash`；返回 `{ available, path }`。
- [ ] **Step 5:** `runAllChecks` 在主版本 ≥ 6 时追加第 6 项 `bash`（版本解析复用 setup 侧实现，不新增探测）；不可用时文案含「Superpowers SDD 的脚本需要 bash」与 Windows 安装方式。
- [ ] **Step 6:** `src/setup/index.ts` 的 8/8 输出打印一行 bash 状态，复用 `detectBash`，不阻塞。
- [ ] **Step 7:** `npm run build` → `node --test test/verify.test.js test/setup-verify-registry.test.js` → **GREEN**；确认既有状态断言已同步。
- [ ] **Step 8:** Commit：`feat(verify): report bash availability for SDD scripts (F001)`

## Task 10: `finish` 措辞更正（【用户指挥】）

- [ ] **Step 1:** 【用户指挥】等用户逐条给出「要改的原文 → 目标表述」；AI 默认只复核并报告，MUST NOT 自行改写。
- [ ] **Step 2:** 用户明确说「你来做」后，只改 `template/.opencode/commands/opsx-finish.md` 的对应措辞；部署版是否同步由用户当场单独指示（默认不动）。
- [ ] **Step 3:** 不得触碰 Step 6a 的 base 判定顺序、「方向约束（MUST）」段、`{{SUPERPOWERS_BASE_PATH}}`、Step 3b 的测试分派口径。
- [ ] **Step 4:** 若某条实际改变了读者能得出的结论 → 停下报告，按 `local/oso/sprints/README.md` §3.12 判定是否立 `BUG` / `GAP`。
- [ ] **Step 5:** 校验：`node --test test/setup-template-invariants.test.js`（测试名含 `opsx template commands are base-branch agnostic` 的一组）全绿；无本机绝对路径；占位符在位。
- [ ] **Step 6:** Commit（仅在确有改动时）：`docs(template): correct opsx-finish wording`

## Task 11: CI 清单 + 三版本文档

- [ ] **Step 1:** `.github/workflows/ci.yml` 的 tarball 清单加入 `package/template/skills.lock.v7.json`。
- [ ] **Step 2:** `npm pack` 后 `tar -tzf *.tgz | grep skills.lock` 确认 v5/v6/v7 三份都在；删除临时 tgz。
- [ ] **Step 3:** `docs/superpowers-version-compatibility.md` 扩为 v5/v6/v7：补 v7 行/段（SDD 布局、7 份 references、审查方式）。
- [ ] **Step 4:** 补「三个既存问题」小节与处置（v6 曾停 v6.1.1 / v5 拼凑不可作基线 / v5 分支 reviewer prompt 自 v6 起不存在）。
- [ ] **Step 5:** 补 v7 brainstorming 语义变化（体量分流 + 强制批准门）与「OSO 明确覆盖、始终走完整 artifacts 流程」。
- [ ] **Step 6:** Commit：`docs: cover v5/v6/v7 compatibility and add v7 lock to tarball checks (F001)`

## Task 12: 全量验证与收口

- [ ] **Step 1:** `npm run typecheck` + `npm run build`（0 error）。
- [ ] **Step 2:** `npm test`（若 `9009` → `node --test --test-concurrency=1 "test/*.test.js"`，记录偏差）。
- [ ] **Step 3:** 逐项对 `tasks.md` §12 的验收：F001（AC1/AC2/AC3 + 两条真实环境项）、BUG012（2 条）、BUG013（2 条）、通用 9 条；真实环境项未跑 MUST 记「未验」。
- [ ] **Step 4:** `git status` 干净；`git log --oneline b4ba0a098..HEAD` 只含本 change 的提交；确认 `main` 未变（`git rev-parse main` 与开工前一致）。
- [ ] **Step 5:** Commit（若还有未提交改动）：`chore: finalize oso-superpowers-v7`
