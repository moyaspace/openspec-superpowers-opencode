## 1. 前置与顺序护栏

- [ ] 1.1 确认前置：release/1.1 HEAD ≥ da7d93f16；部署版 opsx-propose.md 裸 main = 0、opsx-finish.md 裸 main = 0、`.opencode/commands/*.md` = 13；`openspec/config.yaml` + `openspec/schemas/superpowers-bridge-opencode/` 就位。任一不符 → 停下报告，MUST NOT 补。
- [ ] 1.2 确认 base = release/1.1，登记 BASE_COMMIT；全程 MUST NOT 触碰 main；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`（部署版仍硬编码 main）。
- [ ] 1.3 确认步骤顺序：BUG007（整文件替换 opsx-finish）→ BUG008（同步 propose/new/ff）→ F002 模板文本；先 F002 会被整文件替换覆盖。

## 2. BUG007 template opsx-finish Step 3b（用户指挥，AI 默认只复核）

- [ ] 2.1 【用户指挥】用 V1 实战版整文件替换 `template/.opencode/commands/opsx-finish.md`；AI 默认不动手，等用户指挥。
- [ ] 2.2 替换后把 skill 路径还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`（实战版是 `C:\Users\...\.cache\...` 本机绝对路径）。
- [ ] 2.3 校验：无本机绝对路径（grep `C:\Users` = 0）、Step 3b 含「自带入口优先 / 候选冲突询问 / 环境类先甄别 / 语言兜底」、`{{SUPERPOWERS_BASE_PATH}}` 在位、模板命令文件数不因替换减少。

## 3. BUG008 同步 propose / new / ff 三块（用户指挥，AI 默认只复核）

- [ ] 3.1 【用户指挥】把实战版三块内容同步进 `template/.opencode/commands/opsx-propose.md`、`opsx-new.md`、`opsx-ff.md`：Step 5 全量 artifact 循环（TodoWrite + 循环到所有 applyRequires 为 done）、Output 计数写法、Artifact Creation Guidelines。
- [ ] 3.2 同步的是【内容】不是整文件覆盖；`opsx-ff` 已有 TodoWrite/applyRequires，核对后再补差异。
- [ ] 3.3 MUST NOT 顺手把 base 相关文字改回 main（F002 在下一步处理）；MUST NOT 覆盖 Step 0 分派等 V2 专有内容。
- [ ] 3.4 校验：propose 的 Step 5 含 TodoWrite 追踪且循环到 applyRequires 为 done；三文件三块与实战版一致。

## 4. F002 代码 A1 + B2（AI）

- [ ] 4.1 `src/registry.ts`：`RegistryEntry` 加 `baseBranch?: string | undefined`。
- [ ] 4.2 `src/registry.ts`：`add()` 改合并语义 `add(registryPath, name, worktree, baseBranch?)`，条目 `{...旧条目, name, worktree, createdAt, ...(base ? {baseBranch} : {})}`，不写 undefined 空键。
- [ ] 4.3 `src/cli/index.ts` `runEnsureWorktree`：`git worktree add` 成功后读 `git rev-parse --abbrev-ref HEAD`（cwd 仍在项目根），通过 `registry.add(..., baseBranch)` 写入。
- [ ] 4.4 `src/cli/index.ts` `handleRegistry` add：解析可选 `--base`（显式覆盖）+ 用法文案中英各一处补 `[--base <branch>]`。
- [ ] 4.5 `npm run build` + `npm run typecheck` 通过（V1 的 .js 测试读 dist/）。
- [ ] 4.6 确认 A1 与 B2 同批落地（缺一则 base 被静默抹掉）。

## 5. F002 模板文本 5 条命令对齐（AI）

- [ ] 5.1 `opsx-propose.md`：4 处 main → 原分支/当前分支；4 处「跳到 Step 3」→「跳到 2d」；新增 2d（只读当前分支 + 打印，不传 --base）；Output 加「基础分支」行；Step 5 生成 proposal.md 后抬头插入 `> Base: <BASE_BRANCH>`。
- [ ] 5.2 `opsx-finish.md`：Step 6a 重写（读【项目根】openspec/oso-change-registry.json 的 baseBranch → 读不到用 question 问 → 仍无法确定 STOP；不再有「用户本次指定 base」）；3 处选项注释 → `<base-branch>`；新增「方向约束（MUST）」段；占位符 `<base>` → `<base-branch>`；`{{SUPERPOWERS_BASE_PATH}}` 保留。
- [ ] 5.3 `opsx-ff.md`：3 处（描述行 / 2c 提示文案 / Step 6 标题）→ 原分支/当前分支；「跳到 Step N」不改。
- [ ] 5.4 `opsx-new.md`：3 处（描述行 / 提示文案 / Step 7 标题）→ 原分支/当前分支；「跳到 Step N」不改。
- [ ] 5.5 `opsx-continue.md`：1 处（Step 5 标题「回 main」→「回原分支」）。
- [ ] 5.6 工具名统一：`AskUserQuestion` → `question`（原件 5 处为错误写法）。
- [ ] 5.7 校验：5 文件裸 main = 0；操作型 `git checkout|switch|merge|rebase … main` = 0；模板无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 保留。

## 6. 测试同步（方案 §3.7）

- [ ] 6.1 `test/registry.test.js` / `test/registry-utils.test.js`：新增 6 条注册表断言（新建不带 --base 无 baseBranch 键；同名不带 --base 保留已有 baseBranch；旧条目自定义字段保留；带 --base release/1.1 覆盖；ensure-worktree 后 baseBranch = 当前分支；remove 后条目消失）。
- [ ] 6.2 `test/oso-acceptance-opsx-mapping.test.ts` / `test/setup-template-invariants.test.js`：新增模板快照断言（5 文件无裸 main；propose 2d 不传 --base；finish Step 6a 含读取 baseBranch 且不含「通常是 main 或 master」）。
- [ ] 6.3 先跑全量确认无既有断言被打挂。

## 7. 验收（逐项记录命令、输出与结论）

- [ ] 7.1 ① BUG007：finish Step 3b 与实战版一致；无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 在位。
- [ ] 7.2 ② BUG008：propose/new/ff 三块与实战版一致。
- [ ] 7.3 ③ 模板 5 文件无裸 main；操作型 main = 0。
- [ ] 7.4 ④ 真实 propose（base=release/1.1，CLI 走新代码）→ 注册表条目 baseBranch = release/1.1；proposal.md 抬头含 `> Base: release/1.1`。
- [ ] 7.5 ⑤ finish 6a 从注册表读到 baseBranch 并复述方向；移除 baseBranch 后改为询问、不默认 main。
- [ ] 7.6 ⑥ 方案 §3.7 的 9 条断言全过（含「不带 --base 时保留已有 baseBranch」）。
- [ ] 7.7 ⑦ 全量测试 pass（0 fail）；npm test 的 9009 偏差（若有）已记录。
- [ ] 7.8 ⑧ git status 干净；release/1.1 上只多出本任务的 change + archive 提交；V1 main 未变。
