# oso-template-base-branch Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> BUG007（Task 5）与 BUG008（Task 6）是【用户指挥】步骤：AI 默认只复核与报告，等用户指挥后再执行。

**Goal:** 让 V1 模板的 opsx 命令以「当前/原分支」为 base（F002），同时完成 BUG007（finish Step 3b 对齐实战版）与 BUG008（propose 三块同步；`opsx-ff` 本已一致，`opsx-new` 保持脚手架），只落 `release/1.1`。

**Architecture:** 代码侧 A1（`registry.ts` 加 `baseBranch` + `add()` 合并语义）+ B2（`registry add --base` 解析；`ensure-worktree` 不读不写 base）+ C1（`mergeListJson` 注入 `baseBranch`，供 finish 读取）同批落地；文本侧把模板 5 条命令的硬编码 `main` 改为原分支/当前分支，propose/ff/new 各自在切 worktree 前只读 base、在注册步用 `--base` 写入，finish 的 Step 6a 经 `openspec list --json` 读取。

**Tech Stack:** TypeScript（ESM，`node --test`）、node:test、PowerShell/pwsh。测试入口 `npm test`（= typecheck + build + `node --test "test/*.test.js"` + elevated）；本机若 9009（spawn 环境类失败）改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差。

---

## Task 1: A1 — registry.ts baseBranch + 合并语义

- [ ] **Step 1:** 打开 `src/registry.ts`，在 `RegistryEntry` 接口 `createdAt?` 之后加 `baseBranch?: string | undefined;`（保留 `[key: string]: unknown;`）。
- [ ] **Step 2:** 改写 `add()` 为合并语义：
  ```ts
  function add(registryPath: string, name: string, worktree: string, baseBranch?: string): void {
      const data = read(registryPath);
      const idx = data.changes.findIndex(c => c.name === name);
      const normalizedWt = worktree.replace(/\\/g, '/');
      const entry: RegistryEntry = {
          ...(idx >= 0 ? data.changes[idx] : {}),
          name,
          worktree: normalizedWt,
          createdAt: new Date().toISOString(),
          ...(baseBranch !== undefined ? { baseBranch } : {}),
      };
      if (idx >= 0) { data.changes[idx] = entry; } else { data.changes.push(entry); }
      write(registryPath, data);
  }
  ```
- [ ] **Step 3:** 确认不写 `baseBranch: undefined` 空键（用条件展开）；确认同名已有 `baseBranch` 被保留。

## Task 2: B2 — cli/index.ts：registry add --base（base 的唯一写入点）

- [ ] **Step 1:** 删除 `runEnsureWorktree` 成功路径里的 base 读取与 `registry.add(...)`（旧方案已落地，本次回退），使该命令只负责建 worktree，早返回路径同样不碰注册表。
- [ ] **Step 2:** `handleRegistry` 的 `add` 分支：解析可选 `--base <branch>`（显式覆盖）。在 `name/worktree` 取值后扫描 `registryArgs` 找 `--base` 及其后值；有则传给 `registry.add(..., baseBranch)`。
- [ ] **Step 3:** 用法文案中英各一处补 `[--base <branch>]`（中文 `registry add <name> <worktree> [--base <branch>]`，英文同）。
- [ ] **Step 4:** 确认合并语义：同名条目已带 `baseBranch` 时，不带 `--base` 的 `registry add` 必须保留它。

## Task 3: Build + typecheck

- [ ] **Step 1:** `npm run typecheck`（0 error）。
- [ ] **Step 2:** `npm run build`（0 error；.js 测试读 dist/）。
- [ ] **Step 3:** 快速手验：临时项目 `node dist/cli/index.js ensure-worktree <tmp>` 后检查注册表含 `baseBranch`。

## Task 3b: C1 — registry-utils.ts mergeListJson 注入 baseBranch（新增，须在 Task 7 之前完成）

- [ ] **Step 1:** `src/registry-utils.ts` 的 `MergedChange` 加 `baseBranch?: string`。
- [ ] **Step 2:** `mergeListJson()` 命中 registry 条目时注入 `baseBranch`（`entry.baseBranch !== undefined` 才写，不写空键）；worktree 缺失的条目同理；项目根中无 registry 条目的 change 不注入。
- [ ] **Step 3:** `test/registry-utils.test.js` 的 `mergeListJson()` 新增 2 条断言：有 `baseBranch` 时输出含该键；无 `baseBranch` 时输出不含该键。
- [ ] **Step 4:** `npm run build` + 全量测试通过；实跑 `openspec list --json` 确认输出含 `baseBranch`。

## Task 4: 注册表测试（方案 §3.7 前 6 条）

- [ ] **Step 1:** `test/registry.test.js`（或 `test/registry-utils.test.js`）新增：`add` 新建不带 --base → JSON 无 `baseBranch` 键。
- [ ] **Step 2:** 同名不带 --base、已有 baseBranch → baseBranch 保留（A1 生死线）。
- [ ] **Step 3:** 同名、旧条目有自定义字段（如 `foo`）→ `foo` 保留。
- [ ] **Step 4:** 带 `--base release/1.1` → `baseBranch === 'release/1.1'`。
- [ ] **Step 5:** ~~ensure-worktree 之后 `baseBranch` === 创建时当前分支名~~ —— 方案变更为「由 4a 的 `registry add --base` 写入」，该用例删除（见 Task 2 Step 1）。
- [ ] **Step 6:** `remove` 后条目消失。
- [ ] **Step 7:** 运行 `node --test test/registry.test.js`（或全量）确认新增用例 pass 且无既有断言被打挂。

## Task 5: BUG007 — 整文件替换 template opsx-finish（用户指挥）

- [ ] **Step 1:** 【用户指挥】用 V1 实战版 `.opencode/commands/opsx-finish.md` 整文件替换 `template/.opencode/commands/opsx-finish.md`（AI 默认不动手）。
- [ ] **Step 2:** 替换后把 `C:\Users\...\.cache\...\finishing-a-development-branch/SKILL.md` 还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`。
- [ ] **Step 3:** 校验 Step 3b 含「自带入口优先 / 候选冲突询问 / 环境类先甄别 / 语言兜底」；`grep 'C:\Users' template/.opencode/commands/opsx-finish.md` = 0；`{{SUPERPOWERS_BASE_PATH}}` 在位。

## Task 6: BUG008 — 同步 propose 三块（用户指挥）

- [ ] **Step 1:** 【用户指挥】把实战版三块（Step 5 全量 artifact 循环 + TodoWrite、Output 计数、Artifact Creation Guidelines）同步进 `template/.opencode/commands/opsx-propose.md`、`opsx-new.md`、`opsx-ff.md`（按内容同步，非整文件覆盖；`opsx-ff` 已有 TodoWrite/applyRequires，核对后补差异）。
- [ ] **Step 2:** MUST NOT 把 base 相关文字改回 main；MUST NOT 覆盖 V2 专有的 Step 0 分派 / 5b 内容。
- [ ] **Step 3:** 复核：propose 的 Step 5 含 TodoWrite 追踪且循环到 `applyRequires` 为 done；`opsx-ff` 三块已与实战版一致（无需改动）；`opsx-new` 保持脚手架（无 TodoWrite / 无 `个 artifacts` / 无 Guidelines）。

## Task 7: F002 模板文本 5 命令对齐（在 BUG007/008 之后）

- [ ] **Step 1:** `opsx-propose.md`（已整文件覆盖为部署版）：恢复「2d. 记录 base（不可跳过）」段（只读 `git rev-parse --abbrev-ref HEAD` → `BASE_BRANCH`；不读 commit、不写注册表、不调 `question`），4 处「跳到 Step 3」改回「跳到 2d」；Step 4a 的 `registry add` 加 `--base <BASE_BRANCH>`；Output 改为「基础分支：`<BASE_BRANCH>`」；:5 与 Step 6 标题改「退出 worktree 回项目根（不切换分支）」；`:117` 的 `question` 加粗。`> Base:` 抬头弃用。
- [ ] **Step 2:** `opsx-finish.md`：重写 Step 6a（数据源改为 `openspec list --json` 的 `baseBranch` → 读不到用 `question` 问 → 仍无法确定 STOP；不再读注册表文件、不再有「用户本次指定 base」）；3 处选项注释 → `<base-branch>`；新增「方向约束（MUST）」段（`feature/<name> → <base-branch>`，MUST NOT 往 `main` 合并除非 base 就是 `main`）；占位符 `<base>` → `<base-branch>`；保留 `{{SUPERPOWERS_BASE_PATH}}`。
- [ ] **Step 3:** `opsx-ff.md`：5 处裸 main（描述行 / 2c 标题 / 2c 提示 / 留痕迹句 / Step 6 标题）→ 当前/基础分支；新增 **2d**（只读 `git rev-parse --abbrev-ref HEAD` → `BASE_BRANCH`）+ Step 4a 的 `registry add --base "<BASE_BRANCH>"` + Output「基础分支」行；4 处跳转改指 2d。
- [ ] **Step 4:** `opsx-new.md`：同上 5 处裸 main（3c 版本）；新增 **3d** + Step 5a 的 `--base` + Output「基础分支」行；4 处跳转改指 3d。`opsx-new` 仍保持脚手架，不生成 artifacts。
- [ ] **Step 5:** `opsx-continue.md`：1 处（Step 5 标题「回 main」→「退出 worktree 回项目根（不切换分支）」）。
- [ ] **Step 6:** 5 文件内 `AskUserQuestion` → `question`（原件 5 处为错误写法）。
- [ ] **Step 7:** 校验：5 文件裸 main = 0；操作型 `git checkout|switch|merge|rebase … main` = 0；模板无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 保留。

## Task 8: 模板快照 / 一致性测试

- [ ] **Step 1:** `test/setup-template-invariants.test.js` 新增：5 文件无裸 main；propose/ff 的 `registry add` 带 `--base "<BASE_BRANCH>"`、new 的 5a 亦同；读取步（propose 2d / ff 2d / new 3d）只含 `git rev-parse --abbrev-ref HEAD` 且不含 `--base`；finish Step 6a 含读取 `baseBranch` 且不含「通常是 main 或 master」。
- [ ] **Step 2:** 运行对应测试文件确认 pass。

## Task 9: 全量测试

- [ ] **Step 1:** `npm run build`。
- [ ] **Step 2:** `npm test`；若 9009（spawn 环境类失败，非断言失败）→ 改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差（同 T002 verify.md §8.4）。
- [ ] **Step 3:** 全绿、0 fail。

## Task 10: 验收（真实 propose + finish 6a）

- [ ] **Step 1:** 以 `release/1.1` 为 base，让 CLI 走【新代码】（`node dist/cli/index.js` 或 `npm link`，非全局 shim）跑一次真实 propose → 注册表条目 `baseBranch = release/1.1`；`openspec list --json` 输出中该 change 含 `"baseBranch": "release/1.1"`。
- [ ] **Step 2:** 模拟 finish 6a：从 `openspec list --json` 读 `baseBranch` 并复述 `feature/<name> → release/1.1`；把 `baseBranch` 移除后改为询问用户、不默认 main。
- [ ] **Step 3:** 逐条记录整份 T003 开工命令「验收」①–⑧ 的命令/输出/结论。
- [ ] **Step 4:** git status 干净；release/1.1 只多出本 change + archive 提交；V1 main 未变。
