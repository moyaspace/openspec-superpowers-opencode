## 1. 前置与顺序护栏

- [ ] 1.1 确认前置：release/1.1 HEAD ≥ da7d93f16；部署版 opsx-propose.md 裸 main = 0、opsx-finish.md 裸 main = 0、`.opencode/commands/*.md` = 13；`openspec/config.yaml` + `openspec/schemas/superpowers-bridge-opencode/` 就位。任一不符 → 停下报告，MUST NOT 补。
- [ ] 1.2 确认 base = release/1.1，登记 BASE_COMMIT；全程 MUST NOT 触碰 main；执行期禁用 `/opsx-ff`、`/opsx-new`、`/opsx-continue`（部署版仍硬编码 main）。
- [ ] 1.3 确认步骤顺序：BUG007（整文件替换 opsx-finish）→ BUG008（同步 propose）→ F002 模板文本；先 F002 会被整文件替换覆盖。

## 2. BUG007 template opsx-finish Step 3b（用户指挥，AI 默认只复核）

- [x] 2.1 【用户指挥】用 V1 实战版整文件替换 `template/.opencode/commands/opsx-finish.md`；AI 默认不动手，等用户指挥。
- [x] 2.2 替换后把 skill 路径还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`（实战版是 `C:\Users\...\.cache\...` 本机绝对路径）。
- [x] 2.3 校验：无本机绝对路径（grep `C:\Users` = 0）、Step 3b 含「自带入口优先 / 候选冲突询问 / 环境类先甄别 / 语言兜底」、`{{SUPERPOWERS_BASE_PATH}}` 在位、模板命令文件数不因替换减少。

## 3. BUG008 同步 propose / new / ff 三块（用户指挥，AI 默认只复核）

- [ ] 3.1 【用户指挥】把实战版三块内容同步进 `template/.opencode/commands/opsx-propose.md`：Step 5 全量 artifact 循环（TodoWrite + 循环到所有 applyRequires 为 done）、Output 计数写法、Artifact Creation Guidelines。（`opsx-ff` 与实战版逐字节相同、已具备三块；`opsx-new` 定位为脚手架，**不生成** artifacts，不移植三块）
- [ ] 3.2 同步的是【内容】不是整文件覆盖（本次实际为 propose 整文件覆盖后微调）；`opsx-ff` 只核对、不改三块。
- [ ] 3.3 MUST NOT 顺手把 base 相关文字改回 main（F002 在下一步处理）；MUST NOT 覆盖 Step 0 分派等 V2 专有内容。
- [ ] 3.4 校验：propose 的 Step 5 含 TodoWrite 追踪且循环到 applyRequires 为 done；`opsx-ff` 三块与实战版一致；`opsx-new` 保持脚手架（无 TodoWrite/无 `个 artifacts`/无 Guidelines）。

## 4. F002 代码 A1 + B2（AI）

- [x] 4.1 `src/registry.ts`：`RegistryEntry` 加 `baseBranch?: string | undefined`。
- [x] 4.2 `src/registry.ts`：`add()` 改合并语义 `add(registryPath, name, worktree, baseBranch?)`，条目 `{...旧条目, name, worktree, createdAt, ...(base ? {baseBranch} : {})}`，不写 undefined 空键。
- [ ] 4.3 `src/cli/index.ts` `runEnsureWorktree`：**删除**成功路径里的 base 读取与 `registry.add(...)`（原实现已由 1754fef 落地，本次回退）——`ensure-worktree` 只管建 worktree，不读不写 base；早返回路径同样不碰注册表。
- [x] 4.4 `src/cli/index.ts` `handleRegistry` add：解析可选 `--base`（显式覆盖）+ 用法文案中英各一处补 `[--base <branch>]`。**它现在是 base 的唯一写入点。**
- [x] 4.5 `npm run build` + `npm run typecheck` 通过（V1 的 .js 测试读 dist/）。
- [ ] 4.6 回退后重新确认：`ensure-worktree` 不写 base、`registry add --base` 能写、同名不带 `--base` 时合并语义保留已有值（A1 仍是生死线）。
- [ ] 4.7 `src/registry-utils.ts`：`MergedChange` 加 `baseBranch?: string`；`mergeListJson()` 命中条目时注入 `baseBranch`（无值不写键），worktree 缺失的条目同理 —— 供 finish 读取。
- [ ] 4.8 `test/registry-utils.test.js`：`mergeListJson()` 新增 2 条断言（条目有 `baseBranch` 时输出含该键；无 `baseBranch` 时输出不含该键）。
- [ ] 4.9 `npm run build` + 全量测试通过（shim 走 dist）。

## 5. F002 模板文本 5 条命令对齐（AI）

- [ ] 5.1 `opsx-propose.md`（整文件覆盖部署版已完成）：**恢复 2d**，内容为只读 `git rev-parse --abbrev-ref HEAD` → `BASE_BRANCH`（不读 commit、不写注册表、不调 question），并把 4 处「跳到 Step 3」改回「跳到 2d」；**Step 4a** 的 `registry add` 加 `--base <BASE_BRANCH>`（base 的唯一写入点）；删除 3a 之后的「记录 base（`openspec list --json`）」段；Output 用 `- 基础分支：\`<BASE_BRANCH>\``（不带 commit）；:5 与 Step 6 标题改「退出 worktree 回项目根（不切换分支）」；`:117` 的 `question` 改为 `**question**`。`> Base:` 抬头弃用（R2 方案作废）。
- [ ] 5.2 `opsx-finish.md`：Step 6a 重写（数据源改为 `openspec list --json` 的 `baseBranch` → 读不到用 question 问 → 仍无法确定 STOP；不再读注册表文件、不再有「用户本次指定 base」）；3 处选项注释 → `<base-branch>`；新增「方向约束（MUST）」段；占位符 `<base>` → `<base-branch>`；`{{SUPERPOWERS_BASE_PATH}}` 保留。
- [ ] 5.3 `opsx-ff.md`：描述行 / 2c 提示文案 / Step 6 标题 / `不在主 main 上留痕` 共 5 处裸 main → 当前/基础分支；**新增 2d（只读 `git rev-parse --abbrev-ref HEAD` → `BASE_BRANCH`）+ 4a 的 `registry add` 加 `--base "<BASE_BRANCH>"` + Output 加「基础分支」行**；4 处跳转改指 2d。
- [ ] 5.4 `opsx-new.md`：描述行 / 3c 提示文案 / Step 7 标题 / 留痕迹句 共 5 处裸 main → 当前/基础分支；**新增 3d（只读同上）+ 5a 的 `registry add` 加 `--base` + Output 加「基础分支」行**；4 处跳转改指 3d。`opsx-new` 仍不生成 artifacts（脚手架定位不变）。
- [ ] 5.5 `opsx-continue.md`：1 处（Step 5 标题「回 main」→「回原分支」）。
- [ ] 5.6 工具名统一：`AskUserQuestion` → `question`（原件 5 处为错误写法）。
- [ ] 5.7 校验：5 文件裸 main = 0；操作型 `git checkout|switch|merge|rebase … main` = 0；模板无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 保留。

## 6. 测试同步（方案 §3.7）

- [ ] 6.1 `test/registry.test.js` / `test/registry-utils.test.js`：注册表断言（新建不带 --base 无 baseBranch 键；同名不带 --base 保留已有 baseBranch；旧条目自定义字段保留；带 --base release/1.1 覆盖；remove 后条目消失）。**删除**原先的「ensure-worktree 后 baseBranch = 当前分支」用例（行为已回退），其幂等用例一并删除。
- [ ] 6.2 `test/setup-template-invariants.test.js`：新增模板快照断言（5 文件无裸 main；propose 的 4a 传 `--base`、2d 只读 `git rev-parse --abbrev-ref HEAD`；finish Step 6a 含读取 `baseBranch` 且不含「通常是 main 或 master」）。
- [ ] 6.3 先跑全量确认无既有断言被打挂。

## 7. 验收（逐项记录命令、输出与结论）

- [ ] 7.1 ① BUG007：finish Step 3b 与实战版一致；无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 在位。
- [ ] 7.2 ② BUG008：propose/ff 三块与实战版一致；`opsx-new` 保持脚手架（无三块），符合 spec「new stays scaffold-only」。
- [ ] 7.3 ③ 模板 5 文件无裸 main；操作型 main = 0。
- [ ] 7.4 ④ 真实 propose（base=release/1.1，CLI 走新代码）→ 注册表条目 baseBranch = release/1.1（由 4a 的 `registry add --base` 写入）；`openspec list --json` 输出中该 change 含 `"baseBranch": "release/1.1"`。（`> Base:` 抬头已弃用，不再断言）
- [ ] 7.5 ⑤ finish 6a 从 `openspec list --json` 读到 baseBranch 并复述方向；移除 baseBranch 后改为询问、不默认 main。
- [ ] 7.6 ⑥ 方案 §3.7 的 9 条断言全过（含「不带 --base 时保留已有 baseBranch」）。
- [ ] 7.7 ⑦ 全量测试 pass（0 fail）；npm test 的 9009 偏差（若有）已记录。
- [ ] 7.8 ⑧ git status 干净；release/1.1 上只多出本任务的 change + archive 提交；V1 main 未变。
