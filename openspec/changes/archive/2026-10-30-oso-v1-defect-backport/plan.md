# V1 缺陷回移（1.1.2）实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task. 本仓库的 apply 阶段用 `task(category="deep", ...)` 调度，
> TDD 指令以文件内容嵌入 prompt。但本计划中 **Task 3/4** 的产物是「按 main 语义重写 V1 代码」，
> 其 RED 阶段不可行（V1 无 `.ts` 测试基建），故采用：**先 cherry-pick 语义 → 立刻用移植后的 `.js` 用例做回归** 的顺序，
> 并在 Task 5 统一把 33 条用例落地。

**Goal:** 在 `release/1.1`（base `c770dbb2f`）上回移 main 的 6 个缺陷修复语义、移植 33 条 V1 格式用例、实现 GAP002 精简部署后验证，使 1.1.2 可发布。

**Architecture:** 用 `git cherry-pick -n` 逐个取语义并在每个提交后剔除 2.0 专属面（`dist/`、`.ts` 测试、`resources/`、BUG007 测试），再逐提交单独 commit；测试用 `.js` + `import '../dist/...'` 从 main 的 `.ts` 改写；postVerify 在 `initProject` 成功返回前做两项检查，失败只报错不回滚。

**Tech Stack:** Node 24 / TypeScript 7（`tsc -p tsconfig.build.json` 产出 `dist/`）/ `node --test`（`test/*.test.js`）/ git cherry-pick。

---

## Task 1: 基线确认

- [ ] **Step 1:** 确认目录与分支：`cd /l/moyaspace/oso/oso-v1 && git rev-parse --abbrev-ref HEAD` → `release/1.1`；`git rev-parse --short HEAD` → `c770dbb2f`
- [ ] **Step 2:** `npm ci`（V1 自有 lockfile），随后 `npm run build`、`npm run typecheck` 均 exit 0
- [ ] **Step 3:** 确认 7 个对象存在：`for c in c770dbb2f e56b31bd6 2eda04db1 c592abdec a45b7bb8f daede4b28 45b2f6e51; do git cat-file -t $c; done` → 全部 `commit`
- [ ] **Step 4:** worktree 就绪：`.worktrees/oso-v1-defect-backport/` 存在；`git merge-base --is-ancestor c770dbb2f HEAD; echo $?` → `0`

## Task 2: 回移 BUG001+B2+B3+B6（`e56b31bd6`）

- [ ] **Step 1:** `git cherry-pick -n e56b31bd6`
- [ ] **Step 2:** 打开 `src/setup/index.ts`，以 `c770dbb2f` 结构为准核对：棕地分支调用 `collectBrownfieldDecisions` → `createInitPlan` → `executeOperations`
- [ ] **Step 3:** 确认四个直接写盘函数已删除：`deployOpenspec` / `deployOcodeJson` / `deployOpencodeDir` / `deployRootFile`（`grep -n "function deploy" src/setup/index.ts`）
- [ ] **Step 4:** 确认 openspec 询问已改为 `openspecHasContent` 条件；步骤 6 校验的是落盘文件（读 target 文件找 `{{SUPERPOWERS_BASE_PATH}}`）
- [ ] **Step 5:** 清理：`git checkout HEAD -- dist/`；`git status --porcelain` 中 `test/*.test.ts` 一律 `git rm -f --cached` + 删文件；`resources/` 不引入
- [ ] **Step 6:** `npm run typecheck` → exit 0；`git commit -m "backport: BUG001/B2/B3/B6 棕地统一走 init plan"`

## Task 3: 回移 BUG004 垫片自检（`2eda04db1`）

- [ ] **Step 1:** `git cherry-pick -n 2eda04db1`
- [ ] **Step 2:** init 的 0/8 段插入垫片自检；dry-run 的 0/8 段只报告不修复
- [ ] **Step 3:** 确认 import 仅指向 V1 已有模块：`src/verify.js`（`isShimScript` / `findOpenspecOrig`）、`src/shims-installer.js`（`installShims`）
- [ ] **Step 4:** 清理 `dist/` 与 `test/oso-setup-shim-check.test.ts`
- [ ] **Step 5:** `npm run typecheck` → exit 0；`git commit -m "backport: BUG004 垫片自检"`

## Task 4: 回移 BUG005 8/8 补注册（`c592abdec`）

- [ ] **Step 1:** `git cherry-pick -n c592abdec`
- [ ] **Step 2:** 注册表创建提前到 8/8 之前；8/8 建 change 后 `registry add`；`finally` 中 `registry remove` + 删目录
- [ ] **Step 3:** 清理 `dist/` 与 `test/oso-setup-verify-registry.test.ts`
- [ ] **Step 4:** `npm run typecheck` → exit 0；`git commit -m "backport: BUG005 8/8 补注册与清理"`

## Task 5: 回移护栏加固 / postVerify 测试 / 垫片 registry 修正（3 个提交）

- [ ] **Step 1:** `git cherry-pick -n a45b7bb8f`；剔除 `test/opsx-finish-test-dispatch.test.js`（BUG007 → T003）与 `.ts` 测试；清理 `dist/`；`git commit -m "backport: 护栏加固"`
- [ ] **Step 2:** `git cherry-pick -n daede4b28`；保留可在 V1 落地的语义，postVerify 相关 `.ts` 测试剔除；清理 `dist/`；`git commit -m "backport: 补 postVerify 测试"`
- [ ] **Step 3:** `git cherry-pick -n 45b2f6e51`；按 V1 结构落地垫片/registry 修正；清理 `dist/` 与 `.ts` 测试；`git commit -m "backport: 垫片/registry 修正"`
- [ ] **Step 4:** 逐提交确认 `git log --oneline c770dbb2f..HEAD` 有 6 条 `backport:` 提交

## Task 6: 移植 33 条用例

- [ ] **Step 1:** 读 `main` 的 `test/oso-setup-brownfield.test.ts`（只读），改写为 `test/setup-brownfield.test.js`：`../src/` → `../dist/`、去类型、去 `supported-versions` → **16 条**
- [ ] **Step 2:** 同上改写 `test/oso-setup-shim-check.test.ts` → `test/setup-shim-check.test.js`，删除「版本组合不受支持时必须在修复垫片前中止」→ **10 条**
- [ ] **Step 3:** 同上改写 `test/oso-setup-verify-registry.test.ts` → `test/setup-verify-registry.test.js` → **7 条**
- [ ] **Step 4:** `npm run build` 后 `node --test test/setup-brownfield.test.js test/setup-shim-check.test.js test/setup-verify-registry.test.js`，确认 `pass 33`、`fail 0`、`skipped 0`
- [ ] **Step 5:** `git commit -m "backport: 移植 33 条 setup 用例到 V1 写法"`

## Task 7: GAP002 精简部署后验证

- [ ] **Step 1:** 在 `src/setup/index.ts` 的 `initProject` 内、成功返回前加检查 1（枚举模板命令 `.md` 与目标目录比对）
- [ ] **Step 2:** 加检查 2（`dist/cli/index.js` 存在且 `await import()` 成功）
- [ ] **Step 3:** 失败路径：收集缺失项 → `console.error` 打印 → `return { success: false, ... }`（不回滚）
- [ ] **Step 4:** 新建 `test/setup-post-verify.test.js`：3 条（删命令文件 → 失败且含文件名；删 `dist/cli/index.js` → 失败；正常 → 通过）
- [ ] **Step 5:** `npm run build` + 局部 `node --test test/setup-post-verify.test.js` → `pass 3`
- [ ] **Step 6:** `git commit -m "backport: 实现精简部署后验证（GAP002）"`

## Task 8: 全量测试与收尾

- [ ] **Step 1:** `npm run build`
- [ ] **Step 2:** `npm test`（typecheck + build + `test/*.test.js` + `test/elevated/run.mjs`）→ 全绿；elevated 若因 gsudo 失败，标注为环境类失败并记录原始输出
- [ ] **Step 3:** 逐条核对 BUG001–BUG006 关闭条件并记录命令/输出
- [ ] **Step 4:** 核对 33 条用例实际执行（16/10/7）
- [ ] **Step 5:** 确认主仓库目录仍在 `main` 且 `git status` 为空（在 V2 目录执行）
- [ ] **Step 6:** `/opsx-finish`，base 填 `release/1.1`，合并 → 归档 → specs 同步
