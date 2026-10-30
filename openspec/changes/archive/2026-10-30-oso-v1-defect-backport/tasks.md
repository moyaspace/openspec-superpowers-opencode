## 1. 环境与基线确认

- [x] 1.1 在 V1 目录 `/l/moyaspace/oso/oso-v1` 执行 `npm ci`，确认 V1 自有 devDependencies 安装成功
- [x] 1.2 执行 `npm run build` 与 `npm run typecheck`，确认基线 `c770dbb2f` 可编译
- [x] 1.3 完成 Step 2z 统一验证：分支 `release/1.1`、HEAD `c770dbb2f`、命令 13 个、无 `oso-*`、无 `SUPERPOWERS_BASE_PATH`、7 个提交对象全部存在
- [x] 1.4 确认 worktree `.worktrees/oso-v1-defect-backport/` 存在，分支 `feature/oso-v1-defect-backport`，`git merge-base --is-ancestor c770dbb2f HEAD` 返回 0

## 2. 回移 BUG001 + BUG002 + BUG003 + BUG006（棕地统一走 init plan）

- [x] 2.1 `git cherry-pick -n e56b31bd6`
- [x] 2.2 `src/setup/index.ts` 冲突按 `c770dbb2f` 结构重新落地：棕地统一走 `collectBrownfieldDecisions` → `createInitPlan` → `executeOperations`，删除 `deployOpenspec` / `deployOcodeJson` / `deployOpencodeDir` / `deployRootFile`
- [x] 2.3 openspec 询问改为「仅目标已有内容时询问」；步骤 6 改为校验**落盘文件**的占位符
- [x] 2.4 清理：`git checkout HEAD -- dist/`；删除本提交带入的 `test/oso-setup-brownfield.test.ts` 等 `.ts` 测试；不引入 `resources/`
- [x] 2.5 `npm run typecheck` 通过后单独提交 `backport: BUG001/B2/B3/B6 棕地统一走 init plan`

## 3. 回移 BUG004（垫片自检）

- [x] 3.1 `git cherry-pick -n 2eda04db1`
- [x] 3.2 冲突按 V1 结构落地：init 与 dry-run 两个 0/8 段插入垫片自检（复用 `isShimScript` / `findOpenspecOrig` / `installShims`），dry-run 只报告不修复
- [x] 3.3 清理 `dist/` 与本提交带入的 `.ts` 测试（`test/oso-setup-shim-check.test.ts`）
- [x] 3.4 单独提交 `backport: BUG004 垫片自检`

## 4. 回移 BUG005（8/8 补注册与清理）

- [x] 4.1 `git cherry-pick -n c592abdec`
- [x] 4.2 冲突按 V1 结构落地：注册表创建提前到 8/8 之前；8/8 补 `registry add`；`finally` 中 `registry remove` + 删目录
- [x] 4.3 清理 `dist/` 与本提交带入的 `.ts` 测试（`test/oso-setup-verify-registry.test.ts`）
- [x] 4.4 单独提交 `backport: BUG005 8/8 补注册与清理`

## 5. 回移护栏加固与垫片/registry 修正

- [x] 5.1 `git cherry-pick -n a45b7bb8f`，取语义改动；剔除 `test/opsx-finish-test-dispatch.test.js`（属 BUG007 → T003）与本提交带入的 `.ts` 测试
- [x] 5.2 清理后单独提交 `backport: 护栏加固`
- [x] 5.3 `git cherry-pick -n daede4b28`，只保留可在 V1 落地的语义；`postVerify` 相关 `.ts` 测试一律剔除
- [x] 5.4 清理后单独提交 `backport: 补 postVerify 测试`
- [x] 5.5 `git cherry-pick -n 45b2f6e51`，按 V1 结构落地垫片/registry 修正
- [x] 5.6 清理后单独提交 `backport: 垫片/registry 修正`

## 6. 移植 33 条用例到 V1 写法

- [x] 6.1 新建 `test/setup-brownfield.test.js`，移植 `oso-setup-brownfield.test.ts` 全部 **16** 条，`import '../dist/...'`
- [x] 6.2 新建 `test/setup-shim-check.test.js`，移植 `oso-setup-shim-check.test.ts` **10** 条（剔除「版本组合不受支持时必须在修复垫片前中止」1 条），去掉 `supported-versions` / `componentVersions`
- [x] 6.3 新建 `test/setup-verify-registry.test.js`，移植 `oso-setup-verify-registry.test.ts` 全部 **7** 条
- [x] 6.4 `npm run build` 后局部执行 `node --test test/setup-brownfield.test.js test/setup-shim-check.test.js test/setup-verify-registry.test.js`，确认 33 条**实际执行**且全部 pass
- [x] 6.5 提交 `backport: 移植 33 条 setup 用例到 V1 写法`

## 7. 实现精简部署后验证（GAP002）

- [x] 7.1 在 `src/setup/index.ts` 的 `initProject` 成功返回前实现检查 1：模板 `template/.opencode/commands/**/*.md` 每个文件在 `<targetDir>/.opencode/commands/` 存在
- [x] 7.2 实现检查 2：`dist/cli/index.js` 存在且可被动态 `import()`（不是 `dist/oso-core/index.js`）
- [x] 7.3 任一失败打印具体缺失项并返回 `{ success: false }`；不回滚
- [x] 7.4 新建 `test/setup-post-verify.test.js`：删除任一命令文件 → init 失败且错误含文件名；删除 `dist/cli/index.js` → init 失败；正常 → init 通过
- [x] 7.5 提交 `backport: 实现精简部署后验证（GAP002）`

## 8. 全量测试与验收

- [x] 8.1 执行 `npm run build`（`.js` 测试读 `dist/`，不 build 会拿旧产物）
- [x] 8.2 执行 `npm test`，确认 typecheck + build + `test/*.test.js` + elevated 全绿；elevated 若因 gsudo 权限失败，记录为环境类失败
- [x] 8.3 逐条核对 BUG001–BUG006 的关闭条件，记录命令与输出
- [x] 8.4 逐文件核对用例数 16 / 10 / 7 = 33，且在测试输出中可见 pass 计数
- [x] 8.5 确认主仓库目录仍在 `main` 且 `git status` 为空，全程未出现 `git checkout main` / `git switch main`
- [ ] 8.6 执行 `/opsx-finish`，base 确认为 `release/1.1`（MUST NOT 推断为 `main`），合并 `feature/oso-v1-defect-backport → release/1.1`，归档 change 并同步 specs 到 V1 `openspec/specs/`
