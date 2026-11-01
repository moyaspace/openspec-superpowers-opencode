## 1. 前置与顺序护栏

- [x] 1.1 确认前置（任一不符 → 停下报告，MUST NOT 在本任务内补）：`release/1.1` 顶端 ≥ `b4ba0a098`；部署版 `.opencode/commands/` 仍 13 个 `.md`；部署版 `opsx-propose.md` / `opsx-finish.md` 的操作型 `main`（`git checkout|switch|merge|rebase … main`）= 0；项目根 `git status` 干净。
- [x] 1.2 确认 base：当前分支 `release/1.1`，注册表条目 `oso-superpowers-v7` 含 `baseBranch = release/1.1`；全程 MUST NOT 触碰 `main`；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`（部署版这三条仍硬编码 main），只用 propose / finish。
- [x] 1.3 准备 hash 计算源：v7.0.1 干净 checkout（commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`）与 v6.4.2 干净 checkout（commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`）。v6.4.2 无法获取 → 按「未验」处理，MUST NOT 编造 hash。

## 2. BUG012 `selectLockFile`：先写失败测试，再改实现（TDD）

- [x] 2.1 `test/setup-discovery.test.js`：把 `selectLockFile(templateDir, '7')` 期望 `skills.lock.v5.json` 的断言改为期望 `skills.lock.v7.json`（该用例需在临时目录写入 v7 lock）。
- [x] 2.2 `test/setup-discovery.test.js`：新增「无精确匹配不回退」用例 —— 模板目录含 v5/v6/v7 清单时，major `8` 返回无可用清单；major `4` 返回无可用清单；major `null` 返回无可用清单。
- [x] 2.3 运行 `node --test test/setup-discovery.test.js` 确认 **RED**（当前实现对 `7` 仍返回 v5 lock，新用例失败）。
- [x] 2.4 `src/setup/discovery.ts`：删除 `readdirSync(...).sort()[0]` 回退分支，改为「精确匹配存在则返回，否则 `null`」；保留 `string | null` 签名。
- [x] 2.5 `src/setup/discovery.ts`：新增只读辅助 `listLockMajors(templateDir)`（按 major 数值升序返回模板中存在的锁清单 major 列表）并导出，供调用方判定「高于 / 低于 / 缺口」。
- [x] 2.6 `npm run build`，再运行 `node --test test/setup-discovery.test.js` 确认 **GREEN**。
- [x] 2.7 `src/setup/index.ts` 两处 `selectLockFile` 调用点：改为处理 `null` —— 高于最高支持 major → 「当前 Superpowers v{major} 暂不受支持，跳过完整性校验」；低于最低支持 major → 「已不受支持」；落在中间缺口 → 「未找到 v{major} 的锁清单」；三种情况均跳过完整性校验并继续 init，删除 `throw new Error('No skills lock file was found in the template')`。
- [x] 2.8 在既有 init 行为测试（`test/setup-api.test.js` 或 `test/setup-deploy.test.js`，按现有覆盖选择）补一条：模板只有 v5/v6/v7 清单、Superpowers 报 v8 时，init 不中断且输出含「不受支持」类提示。
- [x] 2.9 `npm run build` + 相关测试通过；确认 `template/skills.lock.v5.json` 未被本步改动。

## 3. BUG013 刷新 `template/skills.lock.v6.json` 到 v6.4.2

- [x] 3.1 在 v6.4.2 checkout（`8ca22dba…`）上重算 6 个条目的 SHA-256：`brainstorming/SKILL.md`、`writing-plans/SKILL.md`、`subagent-driven-development/SKILL.md`、`subagent-driven-development/implementer-prompt.md`、`subagent-driven-development/task-reviewer-prompt.md`、`test-driven-development/SKILL.md`。
- [x] 3.2 写入 `template/skills.lock.v6.json`：仅替换 `upstream.commit` 与 6 个 `sha256`；`schema` / `version` / `upstream.repo` 与条目键顺序保持不变。
- [x] 3.3 校验：`upstream.commit == 8ca22dba9a94f28898bbce59f2537ff4d87c747d`；6 个 hash 与 3.1 的重算值逐条一致；`git diff` 中不含 `template/skills.lock.v5.json`。

## 4. 必改点 1：新增 `template/skills.lock.v7.json`

- [x] 4.1 在 v7.0.1 checkout（`2ce8aa15…`）上重算同样 6 个条目的 SHA-256（不得沿用旧值）。
- [x] 4.2 把重算值与开工命令给出的 6 条参考值逐条对照；**任一不一致 → 停下报告**（先确认上游是否已换版本），MUST NOT 默默采用新值继续。
- [x] 4.3 写入 `template/skills.lock.v7.json`：`schema` / `version` / `upstream.repo` 与 v6 文件同构，`upstream.commit = 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，`skills` 恰好 6 个条目。
- [x] 4.4 校验：6 个条目键与参考结构一致；每个 `sha256` 为 64 位十六进制；与 4.1 的重算值逐条一致。

## 5. 必改点 2：`template/.opencode/commands/opsx-apply.md` 委托改造

- [x] 5.1 Step 4a 简化为：Read `{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md`（失败 → STOP，不得静默降级）+ 确认 `scripts/` 下 `task-brief` / `review-package` / `sdd-workspace` 三脚本存在；删除按 v6 列举文件清单的段落。
- [x] 5.2 Step 5 的 **v6 分支**替换为委托文本：按 SKILL.md 执行（含其指引的 references，v7 为 7 份），不再自编排 `task-brief` + implementer 模板 + 手工摘 TDD。
- [x] 5.3 Step 6 的 **v6 分支**替换为委托文本：实现与审查交给 SDD；OSO 只保留两条额外约束 —— report 中 `status = done` 的任务勾 `tasks.md` 对应 checkbox；不得修改 `openspec/schemas/` 与 `openspec/config.yaml`。
- [x] 5.4 委托段补三节：① bash 调用写法 —— Windows MUST 写 `bash <脚本路径>`（脚本无执行位）；② SDD → OMO 语法映射 —— `Subagent (general-purpose)` → `task(category="deep", load_skills=[])`，`model` 由 category 隐含，后台 → `run_in_background=true`，续跑 → `task_id`，`load_skills` 对 Superpowers 技能静默忽略（只能 Read 后嵌入 prompt）；③ tasks.md 勾选契约。
- [x] 5.5 **v5 分支零改动**：v5 的 Read 清单（implementer / spec-reviewer / code-quality-reviewer / TDD SKILL）与两步审查流程逐行比对，确认与原文件一致。
- [x] 5.6 校验：`grep -c 'C:\\Users' template/.opencode/commands/opsx-apply.md` = 0；`{{SUPERPOWERS_BASE_PATH}}` 仍在位；无裸 `main`；委托段含 `task(category="deep"` 与 `bash <`（或等价路径前缀写法）。

## 6. 必改点 3：`schema.yaml` 的 apply 段同步为委托口径

- [x] 6.1 `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 apply 段「Pre-flight」改为：Read `subagent-driven-development/SKILL.md` + 确认三脚本存在（失败 STOP），不再按 v6 列文件清单。
- [x] 6.2 apply 段「Executor / 审查方式」改为委托口径（实现与审查交给 SDD；OSO 两条额外约束），并补 bash 调用写法与语法映射的指路。
- [x] 6.3 校验：与 `opsx-apply.md` 的 v6+ 分支逐条对照一致；`spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md` 只出现在 v5 分支描述中。

## 7. 必改点 6：bash 检测（`src/verify.ts` + init 一行）

- [x] 7.1 先写失败测试：`verify` 在 Superpowers 主版本 ≥ 6 且 bash 不可用时，结果含 `bash` 项且状态为 `warn`、`allPass` 仍为真；主版本 < 6 时结果中无该项。
- [x] 7.2 `src/verify.ts`：新增 `detectBash(isWin)` 纯函数 —— Windows 先 `where bash`，再查 `C:\Program Files\Git\bin\bash.exe`、`C:\Program Files (x86)\Git\bin\bash.exe`、`%LOCALAPPDATA%\Programs\Git\bin\bash.exe`；类 Unix 用 `which bash`；返回 `{ available, path }`。
- [x] 7.3 `CheckResult.status` 增加 `'warn'`；`allPass` 视 `warn` 为通过；`formatResults` 为 `warn` 输出 ⚠ 与修复提示；同步既有状态断言。
- [x] 7.4 `runAllChecks` 在主版本 ≥ 6 时追加第 6 项 `bash`：可用 → `pass` + 路径；不可用 → `warn` + 安装提示（Windows 装 Git for Windows 或 WSL；其他功能不受影响）。Superpowers 版本解析 MUST 复用 setup 侧已有实现，不新增第二套探测。
- [x] 7.5 `init` 的 8/8 输出打印一行 bash 状态，复用 `detectBash`，缺 bash 不阻塞。
- [x] 7.6 `npm run build` + `node --test test/verify.test.js test/setup-verify-registry.test.js` 通过；确认新增 `warn` 未把既有断言打挂。

## 8. 必改点 7：`ci.yml` 的 tarball 清单

- [x] 8.1 `.github/workflows/ci.yml` 的 tarball 内容清单加入 `package/template/skills.lock.v7.json`（紧邻 v5 / v6 两行）。
- [x] 8.2 本地验证：`npm pack` 后 `tar -tzf *.tgz` 能列出 `package/template/skills.lock.v7.json`；清理临时 tgz。

## 9. 必改点 8：`docs/superpowers-version-compatibility.md` 扩为三版本

- [x] 9.1 覆盖 v5 / v6 / v7：各自的 SDD 文件布局、审查方式、apply 分支行为差异。
- [x] 9.2 记录三个既存问题及处置：`skills.lock.v6.json` 曾停在 v6.1.1（本 change 刷新到 v6.4.2）；`skills.lock.v5.json` 为拼凑值、不得作为 v5 准确基线（不修）；v5 分支引用的 `spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md` 自 v6 起不存在（v6+ 用户不走 v5 分支，手工指定 v5 会失败）。
- [x] 9.3 说明 v7 的 brainstorming 语义变化（体量分流 + 强制批准门），以及 OSO **明确覆盖**该分流、始终走完整 artifacts 流程。
- [x] 9.4 校验：文档中可检索到 `v7`、上述三个问题、以及「始终走完整 artifacts 流程」的表述。

## 10. 追加范围（【用户指挥】）：`finish` 措辞更正

- [x] 10.1 等用户**逐条现场给出**要改的措辞与目标表述；AI 默认只复核并报告，MUST NOT 自行发挥改写。
- [x] 10.2 用户明确说「你来做」后，只改 `template/.opencode/commands/opsx-finish.md` 中的对应措辞；部署版 `.opencode/commands/opsx-finish.md` 是否同步由用户当场单独指示，默认不动。
- [x] 10.3 不得触碰：Step 6a 的 base 判定顺序与「方向约束（MUST）」段（T003 刚验收）、`{{SUPERPOWERS_BASE_PATH}}` 占位符、Step 3b 的测试分派口径（BUG007 刚验收）。
- [x] 10.4 越界判据：若某条「措辞更正」实际改变了读者能从该段得出的结论，它不是更正是修订 → 停下报告，按 `local/oso/sprints/README.md` §3.12 判定是否立 `BUG` / `GAP`。
- [x] 10.5 校验：模板一致性测试（测试名含 `opsx template commands are base-branch agnostic` 的那一组）全绿；模板无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 在位；与用户给出的条目逐条对勾，无遗漏、无夹带。

## 11. 构建与全量测试

- [x] 11.1 `npm run typecheck` 与 `npm run build` 通过（`.js` 测试读 `dist/`）。
- [x] 11.2 `npm test` 全绿（0 fail）；若出现 `9009`（cmd spawn 环境类失败，非断言失败），改用等价全量 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差。
- [x] 11.3 确认无新增 `as any` / `@ts-ignore` / 被删除或跳过的失败测试。

## 12. 验收（逐项记录命令、输出与结论；MUST 逐项引用 F001 / BUG012 / BUG013）

### F001 Superpowers v7 支持

- [ ] 12.1 【用户指挥】AC1：安装 Superpowers v7.0.1 后 `oso init` 全绿，无 hash 警告（需真实环境；AI 不自行切换用户缓存）
- [ ] 12.2 【用户指挥】AC2：v7 下 apply —— 主会话能读到 7 份 references；任务卡住走 fix-loop（≤5 轮）；能处理 BLOCKED；能跑 final review
- [x] 12.3 AC3：`oso verify` 输出含 bash 检查项；缺 bash 为 ⚠ 而非失败
- [ ] 12.4 【用户指挥】`.superpowers/sdd/` 自动创建且不出现在 `git status`
- [ ] 12.5 【用户指挥】Windows 上三个脚本经 `bash <脚本>` 调用成功

### BUG012 `selectLockFile` 静默回退

- [x] 12.6 major=7 且存在 v7 lock → 返回 v7 lock
- [x] 12.7 major=8 且无 v8 lock → 明确报「不支持」，不回退到 v5 / v6

### BUG013 `skills.lock.v6.json` 只匹配 v6.1.1

- [x] 12.8 `template/skills.lock.v6.json` 的 `upstream.commit` = `8ca22db…`
- [ ] 12.9 【用户指挥】v6.4.2 环境下 `oso init` 无 hash 警告

### 通用

- [x] 12.10 v7 lock 的 6 个 hash 与 v7.0.1 实际文件逐条比对一致（含与参考值对照）
- [x] 12.11 `opsx-apply.md` 的 v6+ 分支已委托、v5 分支未动；委托段含 §2.5 ①②③
- [x] 12.12 `schema.yaml` 的 apply 段与 `opsx-apply.md` 口径一致
- [x] 12.13 `ci.yml` 的 tarball 清单含 `skills.lock.v7.json`
- [x] 12.14 `docs/superpowers-version-compatibility.md` 覆盖 v5 / v6 / v7
- [x] 12.15 `npm test` 全绿（0 fail；`9009` 偏差若有已记录）
- [x] 12.16 `git status` 干净；`release/1.1` 上只多出本任务的 change + archive 提交；`main` 未变
- [x] 12.17 finish 措辞更正：与用户给出的条目逐条对勾，模板一致性测试全绿、占位符在位
- [x] 12.18 落地文档 §6 的 16 条清单逐条对钩（需真实环境的项按 12.1 / 12.2 / 12.4 / 12.5 / 12.9 的约定处理，未跑 MUST 记「未验」，MUST NOT 写成通过）
