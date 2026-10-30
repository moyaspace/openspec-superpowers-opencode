# oso-template-base-branch Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> BUG007（Task 5）与 BUG008（Task 6）是【用户指挥】步骤：AI 默认只复核与报告，等用户指挥后再执行。

**Goal:** 让 V1 模板的 opsx 命令以「当前/原分支」为 base（F002），同时完成 BUG007（finish Step 3b 对齐实战版）与 BUG008（propose/new/ff 三块同步），只落 `release/1.1`。

**Architecture:** 代码侧 A1（`registry.ts` 加 `baseBranch` + `add()` 合并语义）+ B2（`ensure-worktree` 写入 base、`add --base`）同时落地；文本侧把模板 5 条命令的硬编码 `main` 改为原分支/当前分支，finish 的 Step 6a 读注册表而非推断。base 由代码在 `ensure-worktree` 的「切出」观察点写入，命令文本不传 `--base`。

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

## Task 2: B2 — cli/index.ts ensure-worktree 写入 base + add --base

- [ ] **Step 1:** `runEnsureWorktree`：`git worktree add` 成功后（`console.log('...Worktree created')` 之后、`process.exit(0)` 之前）加：
  ```ts
  const baseBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();
  registry.add(getChangeRegistryPath(cwd) as string, name, `.worktrees/${name}`, baseBranch);
  ```
  确认 `registry`（`import * as registry`）与 `getChangeRegistryPath`、`execSync` 已导入（均已存在）。
- [ ] **Step 2:** `handleRegistry` 的 `add` 分支：解析可选 `--base <branch>`（显式覆盖）。在 `name/worktree` 取值后扫描 `registryArgs` 找 `--base` 及其后值；有则传给 `registry.add(..., baseBranch)`。
- [ ] **Step 3:** 用法文案中英各一处补 `[--base <branch>]`（`registry add <name> <worktree> [--base <branch>]` 与英文同）。
- [ ] **Step 4:** 确认幂等：worktree 已存在时 `runEnsureWorktree` 早返回、不重写 base；`add()` 合并语义保证重复调用不破坏已有 `baseBranch`。

## Task 3: Build + typecheck

- [ ] **Step 1:** `npm run typecheck`（0 error）。
- [ ] **Step 2:** `npm run build`（0 error；.js 测试读 dist/）。
- [ ] **Step 3:** 快速手验：临时项目 `node dist/cli/index.js ensure-worktree <tmp>` 后检查注册表含 `baseBranch`。

## Task 4: 注册表测试（方案 §3.7 前 6 条）

- [ ] **Step 1:** `test/registry.test.js`（或 `test/registry-utils.test.js`）新增：`add` 新建不带 --base → JSON 无 `baseBranch` 键。
- [ ] **Step 2:** 同名不带 --base、已有 baseBranch → baseBranch 保留（A1 生死线）。
- [ ] **Step 3:** 同名、旧条目有自定义字段（如 `foo`）→ `foo` 保留。
- [ ] **Step 4:** 带 `--base release/1.1` → `baseBranch === 'release/1.1'`。
- [ ] **Step 5:** ensure-worktree 之后 → `baseBranch` === 创建时当前分支名。
- [ ] **Step 6:** `remove` 后条目消失。
- [ ] **Step 7:** 运行 `node --test test/registry.test.js`（或全量）确认新增用例 pass 且无既有断言被打挂。

## Task 5: BUG007 — 整文件替换 template opsx-finish（用户指挥）

- [ ] **Step 1:** 【用户指挥】用 V1 实战版 `.opencode/commands/opsx-finish.md` 整文件替换 `template/.opencode/commands/opsx-finish.md`（AI 默认不动手）。
- [ ] **Step 2:** 替换后把 `C:\Users\...\.cache\...\finishing-a-development-branch/SKILL.md` 还原为 `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md`。
- [ ] **Step 3:** 校验 Step 3b 含「自带入口优先 / 候选冲突询问 / 环境类先甄别 / 语言兜底」；`grep 'C:\Users' template/.opencode/commands/opsx-finish.md` = 0；`{{SUPERPOWERS_BASE_PATH}}` 在位。

## Task 6: BUG008 — 同步 propose/new/ff 三块（用户指挥）

- [ ] **Step 1:** 【用户指挥】把实战版三块（Step 5 全量 artifact 循环 + TodoWrite、Output 计数、Artifact Creation Guidelines）同步进 `template/.opencode/commands/opsx-propose.md`、`opsx-new.md`、`opsx-ff.md`（按内容同步，非整文件覆盖；`opsx-ff` 已有 TodoWrite/applyRequires，核对后补差异）。
- [ ] **Step 2:** MUST NOT 把 base 相关文字改回 main；MUST NOT 覆盖 V2 专有的 Step 0 分派 / 5b 内容。
- [ ] **Step 3:** 复核：propose 的 Step 5 含 TodoWrite 追踪且循环到 `applyRequires` 为 done；三文件三块与实战版一致。

## Task 7: F002 模板文本 5 命令对齐（在 BUG007/008 之后）

- [ ] **Step 1:** `opsx-propose.md`：4 处 main → 原分支/当前分支；4 处「跳到 Step 3」→「跳到 2d」；新增「2d. 记录 base（不可跳过）」段（`git rev-parse --abbrev-ref HEAD` → BASE_BRANCH、`git rev-parse HEAD` → BASE_COMMIT，只读+打印，不传 `--base`，不调 question）；Output 加「基础分支：`<BASE_BRANCH>`（commit `<BASE_COMMIT>`）」行；Step 5 生成 proposal.md 后抬头插入 `> Base: <BASE_BRANCH>`。
- [ ] **Step 2:** `opsx-finish.md`：重写 Step 6a（读【项目根】`openspec/oso-change-registry.json` 的 `baseBranch` → 读不到用 `question` 问 → 仍无法确定 STOP；不再有「用户本次指定 base」）；3 处选项注释 → `<base-branch>`；新增「方向约束（MUST）」段（`feature/<name> → <base-branch>`，MUST NOT 往 `main` 合并除非 base 就是 `main`）；占位符 `<base>` → `<base-branch>`；保留 `{{SUPERPOWERS_BASE_PATH}}`。
- [ ] **Step 3:** `opsx-ff.md`：描述行 / 2c 提示文案 / Step 6 标题 3 处 main → 原分支/当前分支；「跳到 Step N」不改。
- [ ] **Step 4:** `opsx-new.md`：描述行 / 提示文案 / Step 7 标题 3 处；「跳到 Step N」不改。
- [ ] **Step 5:** `opsx-continue.md`：Step 5 标题「回 main」→「回原分支」。
- [ ] **Step 6:** 5 文件内 `AskUserQuestion` → `question`（原件 5 处为错误写法）。
- [ ] **Step 7:** 校验：5 文件裸 main = 0；操作型 `git checkout|switch|merge|rebase … main` = 0；模板无本机绝对路径；`{{SUPERPOWERS_BASE_PATH}}` 保留。

## Task 8: 模板快照 / 一致性测试

- [ ] **Step 1:** `test/oso-acceptance-opsx-mapping.test.ts` / `test/setup-template-invariants.test.js` 新增：5 文件无裸 main；propose 2d 不传 `--base`；finish Step 6a 含读取 `baseBranch` 且不含「通常是 main 或 master」。
- [ ] **Step 2:** 运行对应测试文件确认 pass。

## Task 9: 全量测试

- [ ] **Step 1:** `npm run build`。
- [ ] **Step 2:** `npm test`；若 9009（spawn 环境类失败，非断言失败）→ 改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差（同 T002 verify.md §8.4）。
- [ ] **Step 3:** 全绿、0 fail。

## Task 10: 验收（真实 propose + finish 6a）

- [ ] **Step 1:** 以 `release/1.1` 为 base，让 CLI 走【新代码】（`node dist/cli/index.js` 或 `npm link`，非全局 shim）跑一次真实 propose → 注册表条目 `baseBranch = release/1.1`；proposal.md 抬头含 `> Base: release/1.1`。
- [ ] **Step 2:** 模拟 finish 6a：读注册表 `baseBranch` 复述 `feature/<name> → release/1.1`；把 `baseBranch` 移除后改为询问用户、不默认 main。
- [ ] **Step 3:** 逐条记录整份 T003 开工命令「验收」①–⑧ 的命令/输出/结论。
- [ ] **Step 4:** git status 干净；release/1.1 只多出本 change + archive 提交；V1 main 未变。
