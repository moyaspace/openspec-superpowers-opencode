# settle-v1-residuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 V1.1.2 发布前的 7 项遗留：`ensure-worktree` 的 4 个缺陷、模板 worktree 就位校验、`restoreGlobalShim()` 冗余判定、verify PRECHECK 基准。

**Architecture:** 先以 `test/cli.test.js` 的复现用例锁定 BUG023–BUG026（RED），再把 `runEnsureWorktree` 改为「登记簿 + `--show-toplevel` 自检 + prune + 分支挂回 + 后置校验」的判定函数（GREEN）。模板与 schema 是纯文本改动，用 `test/setup-template-invariants.test.js` 锁住。GAP008 先取证后处置，不预设删除。

**Tech Stack:** TypeScript（ESM）、Node `node:test`、git worktree、YAML schema、Markdown 命令模板。

**Spec:** `openspec/changes/settle-v1-residuals/`（brainstorm.md / proposal.md / design.md / specs/）

## Global Constraints

- Node >= 22.9.0；`npm test` 入口优先；9009（cmd spawn 环境类失败）时改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差。
- 重跑（已就位）必须零副作用、零报错。
- 绝不删除用户文件；绝不删除含提交的分支；绝不抢占已被其他 worktree 检出的分支。
- 代码中 MUST NOT 再出现 `git branch -D feature/<name>`。
- 两份 `schema.yaml` 必须同步改。
- 不改 `Step 2`、`README*.md`、`.opencode/commands/`、V2.0 线、`apply.requires` 与 artifact 图。

## Review Focus

- 普通非空目录：预期中止且零删改，最容易被误删。
- 分支被别处检出：预期中止并点名路径，不允许抢占。
- 分支含未合并提交：预期挂回保 SHA，不允许 `branch -D`。
- `cd` 失败：预期立即停下，不允许进入复制重试。
- `baseBranch` 缺失：预期退化到 `origin/main` 并标注，不允许静默使用 origin/main 当主路径。

---

### Task 1: 复现用例（RED）

**Files:**
- Modify: `test/cli.test.js:99-168`（describe `ensure-worktree idempotency and branch safety`）
- Test: 同文件

**Interfaces:**
- Consumes: `runCliFrom(cwd, ...args)`、`gitRun(dir, args)`、`makeGitRepo(prefix)`（既有 helper）
- Produces: BUG023–BUG026 各自的失败用例

- [ ] **Step 1:** 在既有 describe 内新增 BUG023 空目录用例：`mkdir .worktrees/demo` → `runCliFrom(repo,'ensure-worktree','demo')` → 断言 exit 0、`gitRun(worktree,['rev-parse','--show-toplevel'])` 规范化后等于 worktree 自身路径
- [ ] **Step 2:** 新增 BUG023 非空目录/文件用例：写入文件后运行，断言非 0 退出且文件内容仍在
- [ ] **Step 3:** 新增 BUG024 用例：`worktree add` + 提交 → `worktree remove` → 记录 `feature/demo` SHA → 重跑 → 断言 SHA 不变且 worktree 重新登记
- [ ] **Step 4:** 新增 BUG025 用例：`worktree add` → 直接 `rm -rf .worktrees/demo` → 重跑 → 断言目录存在、`worktree list` 含之、exit 0
- [ ] **Step 5:** 新增 BUG026 用例：worktree 内 `checkout -b other` → 重跑 → 断言非 0 且 stdout/stderr 含 `other`；再切回 `feature/demo` → 断言复用零副作用
- [ ] **Step 6:** 更新既有用例 `skips deleting a branch checked out by another worktree`（状态 F）：`assert.strictEqual(result.code, 0)` 改为 `assert.notStrictEqual(result.code, 0)`；保留「分支 SHA 不变」「目标目录不存在」两条断言；消息断言匹配 ABORT 文案
- [ ] **Step 7:** 更新既有用例 `normal path deletes a stale branch and creates the worktree`（状态 G）：在 ensure 前记录 `feature/fresh` 的 SHA，断言改为与该 SHA 相等；保留「worktree 已创建」「exit 0」两条断言
- [ ] **Step 8:** 运行 `npm run build && node --test test/cli.test.js`，确认新用例失败、失败信息与预期一致（RED）

### Task 2: 判定函数与 `runEnsureWorktree` 重写（GREEN）

**Files:**
- Modify: `src/cli/index.ts:339-472`
- Test: `test/cli.test.js`（Task 1）

**Interfaces:**
- Consumes: `readWorktreeEntries(cwd)`、`readGitOutput(cwd, args)`、`samePath(a,b)`、`resolveRepoRoot(cwd)`
- Produces: `decideWorktreeAction(entries, targetDir, branch, facts)` → `{ action: 'reuse' | 'create'; reason?: 'attach' | 'new'; abort?: string }`（或等价结构）

- [ ] **Step 1:** 抽出 `decideWorktreeAction`，输入 `entries: WorktreeEntry[]`、`targetDir`、`branch`、`{ dirExists, dirIsEmpty, dirIsFile, showToplevel, headBranch }`，按 design.md D2 表输出动作或 abort 原因
- [ ] **Step 2:** `runEnsureWorktree` 先算 `repoRoot` / `targetDir` / `branch` / `branchRef`，读登记簿
- [ ] **Step 3:** 状态 A/B（已就位）→ REUSE，保留既有文案，`process.exit(0)`
- [ ] **Step 4:** 状态 E（登记有、目录无）→ `git worktree prune` → 重读登记 → 重新判定
- [ ] **Step 5:** 状态 C（复用但分支不对）→ 打印当前分支并 `process.exit(1)`
- [ ] **Step 6:** 状态 F（分支被别处检出）→ 打印占用路径并 `process.exit(1)`
- [ ] **Step 7:** 状态 D（路径存在但非登记 worktree）→ 文件/非空目录 abort；空目录 `fs.rmdirSync` 后继续
- [ ] **Step 8:** 状态 G（分支存在未检出）→ `git worktree add <dir> <branch>`；状态 H → `git worktree add <dir> -b <branch>`；失败 abort 并 exit 1
- [ ] **Step 9:** 删除 `git branch -D` 代码路径
- [ ] **Step 10:** 实现 design.md D3 三项后置校验，失败打印失败项并 exit 1
- [ ] **Step 11:** 运行 `npm run typecheck && npm run build && node --test test/cli.test.js`，确认全绿（GREEN）
- [ ] **Step 12:** `git add -A && git commit -m "fix: harden ensure-worktree judgment"`

### Task 3: 模板侧 worktree 就位校验（GAP010）

**Files:**
- Modify: `template/.opencode/commands/opsx-propose.md:73-99`
- Modify: `template/.opencode/commands/opsx-ff.md:73-101`
- Modify: `template/.opencode/commands/opsx-new.md:83-113`
- Test: `test/setup-template-invariants.test.js`

**Interfaces:**
- Consumes: 三份模板的既有 Step 3/4 结构
- Produces: 每份模板的 Step 3/4 含 `cd` 失败分支、两条只读校验、复制重试上限

- [ ] **Step 1:** 在 `test/setup-template-invariants.test.js` 新增断言：三份文件的 Step 3/4 区段包含 `git rev-parse --show-toplevel`、`git rev-parse --abbrev-ref HEAD`、`cd` 失败分支、复制重试上限 1 次
- [ ] **Step 2:** 运行该测试确认失败（RED）
- [ ] **Step 3:** 改三份模板，统一为 `ensure-worktree` → `cd`（带失败分支）→ 两条 `test` 校验 → 复制（重试上限 1 次）→ `test -f` 三项 → `codegraph init`
- [ ] **Step 4:** 确认不触碰 T009 已完成的 Step 4/5/6/Output 区段
- [ ] **Step 5:** 运行 `node --test test/setup-template-invariants.test.js`，确认全绿
- [ ] **Step 6:** `git add -A && git commit -m "docs(commands): validate worktree placement before copying"`

### Task 4: GAP008 `restoreGlobalShim()` 判定

**Files:**
- Modify: `scripts/run-tests.mjs:72-114,143-148`（仅在证据齐备时）
- Modify: `docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md`（仅在删除时）
- Test: `test/*.test.js`（≥5 次运行）、`verify.md`（证据）

**Interfaces:**
- Consumes: `package.json` 的 `test` 脚本、全局 `oso install-shims`
- Produces: 删除或保留的结论 + 三条证据

- [ ] **Step 1:** 连续运行 `npm test` ≥5 次，每次记录全局 `openspec` 垫片 `TOOL_DIR` 与 `openspec-shim-e2e` 收集数
- [ ] **Step 2:** 核对 `test/create-project.behavior.test.js`、`test/elevated/lifecycle-e2e.test.js`、`test/shims-installer.test.js` 的 bin 隔离
- [ ] **Step 3:** 在 `finally` 前后临时加日志，记录恢复前后 `TOOL_DIR`，证明 no-op；保存输出
- [ ] **Step 4:** 若三条齐备 → 删除 `restoreGlobalShim()`、`findGlobalOso()`、`OSO_SKIP_SHIM_RESTORE`、`finally` 调用与失败退出码逻辑，更新 postmortem
- [ ] **Step 5:** 若仍在污染 → 修对应测试隔离，保留兜底，任务状态记「部分完成」
- [ ] **Step 6:** 把三条证据写入 `verify.md`
- [ ] **Step 7:** `git add -A && git commit -m "chore(test): settle global shim restore fallback"`（或保留兜底时只提交文档/修复）

### Task 5: GAP011 verify PRECHECK 基准

**Files:**
- Modify: `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml:184-196`
- Modify: `openspec/schemas/superpowers-bridge-opencode/schema.yaml:184-196`
- Test: `test/setup-template-invariants.test.js`

**Interfaces:**
- Consumes: `openspec list --json` 的 `baseBranch`、`mergeListJson`/`withBaseBranch`
- Produces: 两份 schema 的 verify PRECHECK 新文本

- [ ] **Step 1:** 在 `test/setup-template-invariants.test.js` 新增断言：`template/.../schema.yaml` 的 verify PRECHECK 含 `openspec list --json` 与 `baseBranch`，不以 `origin/main` merge-base 为主路径；仓库根 `openspec/schemas/.../schema.yaml` 在文件存在时做同样断言（gitignored，CI 可能缺失）
- [ ] **Step 2:** 运行测试确认失败（RED）
- [ ] **Step 3:** 同步改两份 `schema.yaml` 的 PRECHECK 文本
- [ ] **Step 4:** 运行 `node --test test/setup-template-invariants.test.js`（GREEN）
- [ ] **Step 5:** 在 `release/1.1` base 下实跑一次 verify 检查，确认 commit 数与 `git log release/1.1..HEAD` 一致
- [ ] **Step 6:** `git add -A && git commit -m "docs(schema): derive verify baseline from baseBranch"`

### Task 6: 文档与全量回归

**Files:**
- Modify: `CHANGELOG.md`（`## [1.1.2]` → `### Fixed`）
- Test: 全量 `npm test`

**Interfaces:**
- Consumes: Tasks 1–5 的产物
- Produces: CHANGELOG 条目 + 回归证据

- [ ] **Step 1:** 在 `CHANGELOG.md` 的 `## [1.1.2]` `### Fixed` 补 BUG023–BUG026、GAP008、GAP010、GAP011 条目
- [ ] **Step 2:** 运行 `npm test`，记录主套件与 elevated 用例数，确认不少于 342 + 5
- [ ] **Step 3:** 全仓搜索 `git branch -D feature/` 与 verify 段 `origin/main` 主路径，确认无残留
- [ ] **Step 4:** `git status` 干净；`git rev-parse main` == `7416976a9017f0a6dabac4be331c3e6fcbff58a7`
- [ ] **Step 5:** `git add -A && git commit -m "docs(changelog): record 1.1.2 residual fixes"`
