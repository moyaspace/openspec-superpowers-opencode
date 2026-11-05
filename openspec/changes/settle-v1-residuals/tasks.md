## 1. 复现测试（RED，先于实现）

- [x]  在 `test/cli.test.js` 的 describe `ensure-worktree idempotency and branch safety` 内新增 BUG023 用例：普通空目录 → 被清理并创建真 worktree，断言 `git -C .worktrees/<name> rev-parse --show-toplevel` 等于该目录本身
- [x]  新增 BUG023 用例：普通非空目录 → 非 0 退出且目录内容零删改；文件占用 → 非 0 退出
- [x]  新增 BUG024 用例：`git worktree remove` 后重跑 → 分支被挂回，`git rev-parse feature/<name>` 与删除前一致
- [x]  新增 BUG025 用例：手工删除 `.worktrees/<name>` 后重跑 → prune 生效、实际创建 worktree、exit 0
- [x]  新增 BUG026 用例：worktree 处于错误分支 → 非 0 退出并打印当前分支；正确分支 → 复用零副作用
- [x]  更新既有用例 `skips deleting a branch checked out by another worktree`（状态 F）：按决策文档改为断言非 0 退出（`code === 0` → `code !== 0`），保留「分支 SHA 不变」「目标目录不存在」两条断言
- [x]  更新既有用例 `normal path deletes a stale branch and creates the worktree`（状态 G）：先记录 `feature/<name>` 删除前 SHA，断言改为「SHA 与删除前一致」，保留「worktree 已创建」「exit 0」断言
- [x]  确认 1.1–1.7 在未改实现时失败（RED），记录失败输出

## 2. ensure-worktree 判定重写（BUG023 / BUG024 / BUG025 / BUG026）

- [x]  在 `src/cli/index.ts` 抽出 `decideWorktreeAction(entries, targetDir, branch, fsFacts)` 纯函数，返回 `reuse | create | abort` 与原因；覆盖文档 §4 的 8 种状态
- [x]  重写 `runEnsureWorktree`：以 `readWorktreeEntries` 为唯一登记源；删除 `fs.existsSync` 作为存在性判据的分支
- [x]  实现状态 E：登记有目标但目录不存在 → `git worktree prune` → 重读登记 → 重新判定
- [x]  实现状态 D：普通空目录删除后继续；非空目录/文件 `ABORT`，零删改
- [x]  实现状态 F：分支被其他 worktree 检出 → `ABORT` 并点名路径
- [x]  实现状态 G/H：分支存在未被检出 → `git worktree add <dir> feature/<name>` 挂回；分支不存在 → `worktree add <dir> -b feature/<name>`
- [x]  删除 `git branch -D feature/<name>` 代码路径；全仓搜索确认不再出现该命令
- [x]  实现状态 C：复用前读取 `--abbrev-ref HEAD`，不等于 `feature/<name>` 时非 0 退出并打印当前分支
- [x]  实现 D3 后置校验（`--show-toplevel`、`--abbrev-ref HEAD`、`--git-common-dir`），失败指明失败项
- [x]  保持既有正常路径输出文案（创建/复用/已在该 worktree 内）不回归
- [x]  运行 `npm run typecheck` 与 `npm run build`，确认 `lsp_diagnostics` 对 `src/cli/index.ts` 干净

## 3. 模板侧 worktree 就位校验（GAP010）

- [x]  `template/.opencode/commands/opsx-propose.md` Step 3a：加 `cd` 失败分支、`--show-toplevel` 与 `--abbrev-ref HEAD` 两项只读校验、复制重试上限 1 次
- [x]  `template/.opencode/commands/opsx-ff.md` Step 3a：同上
- [x]  `template/.opencode/commands/opsx-new.md` Step 4a：同上，编号用 4a-1…4a-6
- [x]  `test/setup-template-invariants.test.js` 新增断言：三份模板 Step 3/4 区段包含两条校验命令、`cd` 失败分支、复制重试上限
- [x]  确认三份模板不触碰 T009 已完成的 Step 4/5/6/Output 区段

## 4. GAP008 restoreGlobalShim 冗余判定（先验证后处置）

- [x]  连续运行 `npm test` ≥5 次（本机 Windows），每次记录全局垫片 `TOOL_DIR` 与 `openspec-shim-e2e` 收集数
- [x]  逐个核对会调用 `installShims()` 的测试（`create-project.behavior`、`elevated/lifecycle-e2e`、`shims-installer`），确认 bin 定位已隔离
- [x]  在 `scripts/run-tests.mjs` 恢复处临时加日志，记录恢复前后状态，证明 no-op；保留日志输出到 verify.md
- [x]  若三条证据齐备：删除 `restoreGlobalShim()`、`findGlobalOso()`、`OSO_SKIP_SHIM_RESTORE`、`finally` 调用与失败退出码逻辑；同步 `docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md` 的相关描述
- [x]  若发现仍在污染：定位并修复污染源（让测试真正隔离），保留兜底作为临时缓解，tasks/spec 状态按「部分完成」记录
- [x]  把三条验证证据（运行次数、隔离核对、no-op 日志）写入本 change 的 `verify.md`

## 5. verify PRECHECK 基准（GAP011）

- [ ] 5.1 `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 verify PRECHECK 改为 `openspec list --json` 取 `baseBranch` 为主路径，缺失退回 `origin/main` 并要求 verify.md §5 标注基准
- [ ] 5.2 `openspec/schemas/superpowers-bridge-opencode/schema.yaml` 同步改为相同口径
- [ ] 5.3 `test/setup-template-invariants.test.js` 新增断言：`template/.../schema.yaml` 的 verify PRECHECK 引用 `openspec list --json` 与 `baseBranch`、不以 `origin/main` merge-base 为主路径；仓库根 `openspec/schemas/.../schema.yaml`（gitignored，CI 可能不存在）在存在时做同样断言
- [ ] 5.4 以 `release/1.1` 为 base 实跑一次 verify，确认 commit 数与 `git log release/1.1..HEAD` 一致

## 6. 文档与回归

- [ ] 6.1 `CHANGELOG.md` 的 `## [1.1.2]` → `### Fixed` 补 BUG023、BUG024、BUG025、BUG026、GAP008、GAP010、GAP011 条目
- [ ] 6.2 运行 `npm test`，确认全绿且用例数不少于基线（342 主套件 + 5 elevated）；记录实际用例数
- [ ] 6.3 检查 `git status` 干净；`git rev-parse main` 与开工前一致（`7416976a9017f0a6dabac4be331c3e6fcbff58a7`）
- [ ] 6.4 全仓搜索确认无残留 `git branch -D feature/<name>`、无 `origin/main` 作为 verify 主路径
- [ ] 6.5 若 GAP008 以保留兜底收尾，在 verify.md 与 CHANGELOG 中明确记录「部分完成」及原因
