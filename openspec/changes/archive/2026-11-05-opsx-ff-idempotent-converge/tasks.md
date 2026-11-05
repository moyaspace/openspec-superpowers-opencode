## 1. 失败测试先行（TDD RED）

- [x] 1.1 在 `test/setup-template-invariants.test.js` **新增** describe `opsx-ff.md converges from any state`，用例 `Step 4 gates creation behind test -d`：用现有 `sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a')` 取区段，断言区段含 `test -d openspec/changes/<name>`，且 `fencedCommands(section)[0]` 等于该 `test -d` 命令
- [x] 1.2 同上 describe，用例 `Step 4 does not run openspec new change unconditionally`：断言区段含 `openspec new change "<name>"`，但该命令不是 `fencedCommands(section)` 的第一条（即位于条件分支内），且其前文出现「不存在」
- [x] 1.3 同上 describe，用例 `Step 4 forbids openspec list and archive detection`：断言 Step 4 区段不含 `openspec list`，且全文不含 `openspec/changes/archive` 的存在性判断（注释说明不算，按文本断言）
- [x] 1.4 同上 describe，用例 `Step 6 guards the commit with git diff --cached --quiet`：用 `sectionOf('opsx-ff.md', content, '### Step 6', '### Output')` 取区段，断言含 `git diff --cached --quiet`，且不含 `git add -A && git commit`
- [x] 1.5 新增 describe `creating commands stop on an occupied name`，用例 `propose Step 4 and new Step 5 both test -d first`：分别取 `### Step 4`→`#### Step 4a`（propose）与 `### Step 5`→`#### Step 5a`（new），断言两段均含 `test -d openspec/changes/<name>`，且段内同时含 `/opsx-continue` 与 `/opsx-ff`
- [x] 1.6 运行 `node --test test/setup-template-invariants.test.js` 确认新增用例 **RED**（失败），且现有 `assertBaseReadStep` / `assertRegistryAddCarriesBase` / `BASE_AWARE_COMMANDS` 相关用例仍通过；记录失败输出

## 2. `template/.opencode/commands/opsx-ff.md`（必改点 1–3）

- [x] 2.1 **必改点 1**：把 `### Step 4: 在 worktree 内创建变更` 整段替换为「确保变更存在（幂等，只判断本 worktree）」：先 `test -d openspec/changes/<name>`，存在则跳过创建直接进入 Step 4a，不存在才 `openspec new change "<name>"`，失败则停下报告（不得重试、不得手工建目录）
- [x] 2.2 在 Step 4 末尾补两条 MUST NOT 注记：不得用 `openspec list` 判断存在性；`openspec/changes/archive/` 下的同名不视为冲突、不检测。**注记中不得出现 `registry add` 字面量**（避免 `assertRegistryAddCarriesBase` 的 `.find()` 误命中）
- [x] 2.3 **必改点 2**：把 Step 6 的 `git add -A && git commit -m "change: <name>"` 改为两行：`git add -A` 换行 `git diff --cached --quiet || git commit -m "change: <name>"`，并在段内说明「无变化时跳过提交，不视为失败」
- [x] 2.4 **必改点 3**：在 Output 的「已创建：`<N>` 个 artifacts」之后增加「本次跳过：`<M>` 个已完成 artifacts」，并增加「若 `<N>` 为 0：提示全部 artifacts 已就绪，可 `/opsx-apply` 或 `/opsx-archive`」
- [x] 2.5 确认未触碰 Step 2d（base 读取）、Step 3（建 worktree / 复制 schemas / codegraph）、Step 4a（注册与 verify/question 失败处理）
- [x] 2.6 **审查补齐**：Step 5 明确「只处理 `status` 不为 `done` 的 artifacts（`ready` 优先）；已 `done` 的不得重建」，并把 Output 的 `<M>` 定义为 `openspec status --change "<name>" --json` 中 `status` 为 `done` 的数量（先补一条失败断言，再改模板）
- [x] 2.7 **审查补齐**：Step 6 增加「若 `git commit` 失败 → 停下报告；`git diff --cached --quiet` 的 exit 1 表示有变化、不是失败」
- [x] 2.8 **审查补齐（5b/5c/5d）**：Step 5 改为按依赖判定排除 post-apply（`requires` 链包含 `applyRequires` 中任一 artifact），5e 的终止条件改为「没有可处理的 artifact」，避免漏补闭包外的 `design`
- [x] 2.9 **审查补齐（5e）**：Step 5 指明 `requires` 链的数据源（`openspec instructions <artifact-id> --json` 的 `dependencies` 递归展开、不含自身）、每轮重读 status、`<M>` 改为进入 Step 5 时统计；新增「Step 5 不得以 `design` 作排除项」与「排除名单恰为 `verify`/`retrospective`」两条断言
- [x] 2.10 **审查补齐（5e/5f）**：修正 `opsx-change-convergence` 需求正文的终止子句，把三处 Scenario 收窄到 non-post-apply 口径，并在 parity delta 新增同名 MODIFIED requirement 覆盖主规格的过期要求

## 3. `template/.opencode/commands/opsx-propose.md`（必改点 4）

- [x] 3.1 **必改点 4**：把 `### Step 4: 在 worktree 内创建变更` 整段替换为「创建变更（本命令为创建语义）」：先 `test -d openspec/changes/<name>`；已存在则 **STOP** 并列出 `/opsx-continue <name>` 与 `/opsx-ff <name>` 两条继续路径，不覆盖已有 change；不存在才 `openspec new change "<name>"`，失败则停下报告
- [x] 3.2 在 Step 4 末尾补注记：不得用 `openspec list` 判断存在性；归档同名不视为冲突
- [x] 3.3 把末尾 Guideline 的「如果同名变更已存在，建议用 `/opsx-continue`」改为「同名变更已存在时由 Step 4 中止，不再继续」

## 4. `template/.opencode/commands/opsx-new.md`（必改点 4）

- [x] 4.1 **必改点 4**：把 `### Step 5: 在 worktree 内创建变更` 整段替换为「在 worktree 内创建变更骨架（本命令为创建语义）」：先 `test -d openspec/changes/<name>`；已存在则 **STOP** 并列出 `/opsx-continue <name>` 与 `/opsx-ff <name>`；不存在才 `openspec new change "<name>"`，成功后进入 Step 5a
- [x] 4.2 在 Step 5 末尾补注记：归档同名不视为冲突、不检测
- [x] 4.3 把 Guardrails 的「如果同名变更已存在，建议用 `/opsx-continue`」改为「同名变更已存在时由 Step 5 中止，不再继续」
- [x] 4.4 确认 `opsx-new.md` 仍不含 `TodoWrite` / `个 artifacts` / `Artifact Creation Guidelines`（保持 scaffold-only）

## 5. `CHANGELOG.md`

- [x] 5.1 在 `## [1.1.2]` → `### Changed` 末尾追加一条：`/opsx-ff` 可从任意状态补完 artifacts（change 已存在则跳过创建、只补齐未完成项、全完成不产生空提交）；`/opsx-propose` 与 `/opsx-new` 在名字被占用时主动中止并给出 `/opsx-continue` 逐个 / `/opsx-ff` 一次补齐
- [x] 5.2 确认未修改 `README.md` / `README.zh-CN.md`（归 T005）

## 6. 回归、静态验收与真机验证

- [x] 6.1 运行 `npm test`（Node >= 22.9.0）；若出现 9009 类 spawn 失败（非断言失败），改用 `node --test --test-concurrency=1 "test/*.test.js"` 并记录偏差；要求全绿且用例数不少于基线（336 主套件 + 新增用例）
- [x] 6.2 AC6 静态核对：三个命令文件中判断依据均为 worktree 内 `test -d openspec/changes/<name>`；任一文件都不含以 `openspec list` 作存在性判断；不检测 `openspec/changes/archive/` 同名
- [x] 6.3 模板卫生：三个命令文件不含本机绝对路径（`C:\Users` / `/Users/`），`{{SUPERPOWERS_BASE_PATH}}` 仍在位（`opsx-finish.md` 等现有断言覆盖）
- [x] 6.4 在临时 `oso init` 项目验证 AC1：建 change 后删 1 个未完成 artifact，重跑 `/opsx-ff` → 不报错、不重复创建、只补齐该 artifact；artifacts 全齐时再跑 → 正常结束并提示 `/opsx-apply` 或 `/opsx-archive`
- [x] 6.5 临时项目验证 AC2：先 `oso ensure-worktree <name>`（不建 change），再 `/opsx-ff` → 在 worktree 内创建 change 后继续生成
- [x] 6.6 临时项目验证 AC3：`oso registry reset` 后 `/opsx-ff` → 条目恢复，`baseBranch` 与首次一致
- [x] 6.7 临时项目验证 AC4：全部完成后重跑 `/opsx-ff` → `git log` 无新增提交
- [x] 6.8 临时项目验证 AC5：对已存在 change 执行 `/opsx-propose` 与 `/opsx-new` → 均主动中止，输出同时含 `/opsx-continue` 与 `/opsx-ff`，且未覆盖已有 change
- [x] 6.9 记录最终 `git status`（worktree 干净）、`release/1.1` 上仅多出本 change 的提交；用 `git rev-parse main` 确认 `main` 未变（只读，不切换、不合并到 `main`）

## 7. 交付与合并

- [ ] 7.1 在 worktree 内提交实现：`git add -A`（无变化则跳过），commit message 以 `feat(template): make opsx-ff converge from any state` 开头，正文说明三个命令的语义分工
- [ ] 7.2 `/opsx-verify` 复核后归档本 change（`/opsx-finish`），合并方向固定 `feature/opsx-ff-idempotent-converge → release/1.1`；MUST NOT 出现 `git checkout main` / `git switch main`
