# Verification — retire-install-hook

> 验收环境：Windows（win32），Node v24.14.0，npm 11.9.0，git 2.55.0，gsudo 可用。
>
> 验收提交：`3e69954e`（worktree `.worktrees/retire-install-hook/`，分支 `feature/retire-install-hook`，base `release/1.1`）。
>
> 结论：**通过**（9 项验收全部满足或已按 R6 说明不可执行范围；执行中发现并修复 1 个真实缺陷，见「验收期修复」）。

## 计数链（R3 裁决的落地记录）

| 时点 | 主套件 | 说明 |
|------|--------|------|
| 变更前基线 | 318 | setup 阶段实测（`npm test` 全绿） |
| 删除 imp16 前（Task 7 Step 0） | 333 | 318 + 本变更新增用例 15 条 |
| 删除 imp16 后（`9ad4512`） | 332 | **333 − 1 = 332**，恰好只减 1 条，无静默少收集 |
| 补「未知子命令」用例后（`f57ce41b`） | 333 | 补回 imp16 独有的 `__no_such_command__` 断言 |
| 验收期修复 null binDir 用例后（`3e69954e`） | 334 | 验收探针发现的缺陷修复 |
| 终审修复权限提示后（`a9754725`） | **336** | 新增 2 条 sudo 方向用例，最终值 |

**R3 裁决说明**：spec 的「318 → 317」是在「本变更不新增其他用例」前提下写的绝对值；本变更在 Task 1/2/5/6/7 中新增了用例，因此绝对值必然上升。真正的不变量是**删除 imp16 恰好移除 1 条**，已由 `333 → 332` 实测证明。`verify.md` 必须同时记录三个点，否则只看 HEAD 无法复现该不变量。

## 9.1 GAP006-1 静态验收 ✅

```
node -p "Object.keys(require('./package.json').scripts).join(',')"
→ test,typecheck,build,prepare          # 无 install / postinstall / preinstall

Test-Path scripts/shims-installer.mjs
→ False

git ls-files dist | wc -l
→ 0
```

`allow-scripts` 全仓（排除 `local/`、`node_modules/`、`dist/`）扫描 → **NO HITS**。

## 9.2 GAP006-2 npm 12 安装验收 ⚠️（R6：本机不可执行）

本机 npm 为 **11.9.0**，无法复现 npm 12 的 soft-skip 行为。可验证的替代证据：

- `package.json` 的 `scripts` 键集合为 `test / typecheck / build / prepare`，**零生命周期脚本** → npm 12 的 `install scripts blocked` 无触发对象。
- tarball 自带 `package/dist/cli/index.js`（见 9.3），安装后无需任何脚本即具备可执行入口。
- `test/elevated/lifecycle-e2e.test.js` 的「npm pack produces installable tarball and oso init deploys project」在本机通过（`npm pack` → 隔离目录安装 → `oso init` → 垫片生效）。

`oso verify` 实测（本机）：

```
✓ openspec: installed at C:\Program Files\nodejs\openspec
✓ openspec-orig: found at C:\Program Files\nodejs\openspec-orig.cmd
✓ openspec (shim): is shim script
✓ oso-change-registry.json: valid (1 changes)
✓ worktrees: all present
✓ bash: found at C:\Program Files\Git\usr\bin\bash.exe
exit 0
```

即「`oso verify` 的 `openspec (shim)` 检查通过」已在本机确认。

**未在本机验证**：npm 12 下的实际安装警告文本。需在 npm 12 环境复跑 `npm i -g <tarball>` 复核。

## 9.3 / 9.14 GAP006-3 与 GAP007-14 tarball 验收 ✅

```
npm pack → 170 files
tar -tzf <tgz> | grep '^package/dist/cli/index.js$'
→ package/dist/cli/index.js            # 命中

tar -tzf <tgz> | grep -c 'imp16-tarball-equivalence'
→ 0

tar -tzf <tgz> | grep -c '^package/src/|^package/tsconfig.json$'
→ 0

tar -xzf <tgz> -O package/assets/shims/openspec.ps1 | grep -c 'Join-Path $TOOL_DIR "lib"'
→ 0
```

`test/elevated/lifecycle-e2e.test.js` 通过（见 9.9）。

## 9.4 GAP006-4 干净 clone 的 npm ci ✅

```
git clone --branch feature/retire-install-hook <worktree> <tmp>
Test-Path <tmp>/dist/cli/index.js → False        # dist 已不被 git 跟踪
cd <tmp> && npm ci → exit 0
Test-Path <tmp>/dist/cli/index.js → True         # 由 prepare 构建生成
```

这是本次变更的核心目标：干净 clone 不再需要 `dist/` 入库即可 `npm ci` 成功。

## 9.5 GAP006-5 CI 三平台与守卫有效性 ⚠️（R6：本机不可执行 CI）

本机无法运行 GitHub Actions 三平台矩阵。可验证的替代证据：

- 守卫一语义自测：`bash -c 'tracked=$(git ls-files dist | wc -l); [ "$tracked" -eq 0 ] || exit 1'` → `guard1 OK tracked=0`。
- 守卫二语义自测：`dirty=$(git status --porcelain)` 在当前树能检测到脏文件（`guard2 detects dirt: ...`）；CI 中 checkout 为干净树，故为有效闸门。
- 迁移断言的反向自测（Task 3 报告）：用合成 tarball 分别注入「ps1 含 `Join-Path $TOOL_DIR "lib"`」「tarlist 含 `package/tsconfig.json`」「tarlist 含 `package/src/`」，三条断言均能触发 `exit 1`（非「永远通过」）。
- YAML 结构：无 TAB 缩进，PyYAML 解析通过。

**未在本机验证**：三平台实际绿灯。需推送后观察。

## 9.6 GAP006-6 文档 ✅

- `README.md` 与 `docs/QUICKSTART.md` 均无 `allow-scripts`（全仓扫描无命中）。
- `docs/QUICKSTART.md`「权限说明」：系统 npm / nvm-用户级 prefix / Windows 三情形，并解释「为什么取决于 `openspec` 装在哪」（垫片写在 openspec 命令所在 bin 目录），附 `which`/`where` + `ls -ld`（Unix）/`Get-Acl`（Windows）确认法。
- `docs/QUICKSTART.md`「验证安装」：说明 `oso init` 自动检查并安装垫片、装不上**不中止**、装好后**无需重跑 init**。
- `README.md`：一段（渲染约 2 行）说明同样事实 + `No need to re-run init afterwards.`

## 9.7 权限提示 ✅（部分 platform 受限）

用临时探针直接调用 `dist/setup/index.js` 的 `initProject`（注入 `shimDeps`），捕获结尾 banner 的实际文本：

**Windows 分支**（`isWin: true`，安装返回 `binDir: C:\Program Files\nodejs`，`details: ['EACCES: permission denied']`）：

```
[warn] openspec shim is not installed
[info]   Open PowerShell as Administrator, then run: oso install-shims   (bin dir: C:\Program Files\nodejs)
[info]   If gsudo is installed, you can use: gsudo oso install-shims
[info] No need to re-run init after this — just run that one command
=== success=true ===
```

**Unix + openspec 不在 PATH**（`binDir: null`，`details: ['openspec CLI not found in PATH']`）：

```
[warn] openspec shim is not installed
[info]   openspec CLI not found in PATH — install it first: npm i -g @fission-ai/openspec
[info]   then run: oso install-shims
[info] No need to re-run init after this — just run that one command
=== success=true ===
```

**Unix 不可写 / 可写分支**：由 `test/setup-shim-check.test.js` 的注入式用例覆盖（`/fake/bin` 不存在 → `sudo oso install-shims`；`mkdtempSync` 真实可写目录 → `oso install-shims` 且不含 sudo），13/13 通过。

**未在本机验证**：Unix 上 `chmod a-w` 真实目录下的端到端 `oso init`（本机为 Windows）。需在 Unix 复跑。

## 9.8 原子替换 ✅

`node --test --test-name-pattern "temp files" test/shims-installer.test.js` → 1/1 pass（`leaves original intact and no temp files when write fails`）。

补充说明（审查记录 M1）：该用例的注入点在 `writeFileSync(tmp)`，tmp 尚未创建即抛出，因此「tmp 已写、rename 失败 → 清理」这一路径未被直接覆盖；实现层面由 `finally` 无条件 `unlinkSync` 保证。Unix 上「临时目录只读」的真实场景未在本机复跑。

## 9.9 回归 ✅

```
npm test（完整链路：typecheck → build → 主套件 → elevated → 恢复全局垫片）
主套件：tests 336 / pass 336 / fail 0 / suites 60
elevated：tests 5 / pass 5 / fail 0 / suites 2
guard：✓ 全局 bin 未被修改（7 个文件）
[shim] ✓ 全局垫片已恢复为正式安装版本
```

## 9.10 typecheck / build ✅

```
npm run typecheck → exit 0
npm run build     → exit 0，dist/cli/index.js 存在
```

## 9.11 install-shims / uninstall-shims 不回归 ✅

`node --test test/setup-shim-check.test.js test/shims-installer.test.js` → **51/51 pass**（新增 null-binDir 用例单跑 1/1；`setup-shim-check` 单文件 13/13）。

## 9.12 GAP007-12 删除与计数 ✅

`test/imp16-tarball-equivalence.test.js` 已删除（`git show --stat 9ad4512` = `143 deletions`）。计数链见本文开头。

## 9.13 GAP007-13 迁移断言 ✅

`ci.yml` 的 `Verify tarball contents` 含三条迁移断言（`:82-88`）；反向自测通过（见 9.5）。

## 9.14 GAP007-14 ✅

见 9.3。

## 9.15 F003-AC1 help 长名精确匹配 ✅

```
node dist/cli/index.js --help                        → 精确匹配计数 0
node dist/cli/index.js --help --lang zh-CN           → 精确匹配计数 0
（正则 /(?<!create-)openspec-superpowers-opencode/）
两者均含 "oso init"：各 2 处
```

## 9.16 F003-AC2 报错不含长名 ✅

| 命令 | 长名计数 | 退出码 |
|------|----------|--------|
| `oso ensure-worktree` | 0 | 1 |
| `oso remove-worktree` | 0 | 1 |
| `oso registry` | 0 | 1 |
| `oso __no_such__` | 0 | 1 |

`oso verify` 的 5 处 `fix` 由 `src/verify.ts` 静态确认已改为 `oso ...`（`:254`、`:277`、`:312`、`:313`、`:340`）。

## 9.17 F003-AC3 长命令版本一致性 ✅

```
node dist/cli/index.js --version  → 1.1.1   （bin 映射 openspec-superpowers-opencode → dist/cli/index.js）
oso --version                     → 1.1.1
相等：True，退出码 0
```

## 9.18 F003-AC4 create-project 帮助 ✅

```
Usage:
  create-openspec-superpowers-opencode <target-dir>

Equivalent to:
  oso init <target-dir>
```

## 9.19 F003-AC5 标识符无改动 ✅

```
git diff --stat 1f3a67751..HEAD -- src/setup/manifest.ts src/setup/planner.ts src/setup/reset.ts
→ 空
src/setup/manifest.ts:108 → project: 'openspec-superpowers-opencode'
```

`test/cli.test.js` 的 `identifier files keep the long project name` 守卫测试断言四个 marker 与 `project` 字段仍为长名。

## 9.20 F003-AC6 子命令 --help 无副作用 ✅

隔离 bin 目录（放入 dummy `openspec` / `.cmd` / `.ps1` 并前置 PATH）：

```
oso install-shims --help  → exit 0，bin 目录前后哈希一致（True），含 sudo/PowerShell/gsudo 权限说明（3 处命中）
oso registry --help       → exit 0，bin 目录前后哈希一致（True），输出含 add / list
```

## 验收期修复（重要）

验收探针发现一处**实现缺陷**（非文档问题）：`shimBinDir === null`（openspec 不在 PATH）时，banner 仍打印 `sudo oso install-shims`——属「非权限类失败硬套提权提示」，违反 `specs/shim-install-safety/spec.md` 与 init 规格的「不得自动提权」精神。

已按 TDD 修复（commit `3e69954e`）：

- 新增 `binDir === null` 独立分支：提示 `npm i -g @fission-ai/openspec`，再 `oso install-shims`，**不再出现 sudo**。
- 新增用例 `initProject：openspec 不在 PATH（binDir 为 null）→ 不得建议 sudo，应先装 openspec`：RED 失败于 `/sudo/` 断言，GREEN 通过。
- 修复后复审通过（分支顺序 `null → isWin → unix` 合理；TS 窄化成立；原有三分支未回退）。

## 计划偏差记录

| 编号 | 偏差 | 原因 | 代价 |
|------|------|------|------|
| R8 | `.gitignore` 写 `/dist/` 而非计划字面的 `dist/` | 未锚定的 `dist/` 会遮蔽已跟踪的 `test/host-probe/dist/**`（30 个文件），未来新增文件会被静默忽略 | 一行回退 |
| R3 | 「318 → 317」改为「删除恰好减 1 条」 | 计划自身在本变更内新增了用例，绝对值不可同时成立 | 已在计数链记录三点 |
| R9 | Unix 不可写分支文案改条件式 | 原计划文案在「不可写」语境下自相矛盾、可能让用户放弃 sudo | 文案级 |
| R12–R15 | 收紧 CLI help 断言 / 夹具 chmod / 测试改名 | 原断言可被全局 help 满足（假绿），已用失效实验证明新断言能捕获回归 | 测试级 |
| — | 新增 null-binDir 分支（计划外） | 验收发现真实缺陷 | 新增 1 个分支 + 1 条用例 |

## 终审（whole-branch review）后的修复

终审发现 2 项 Important，已修复并复验：

### A. `oso install-shims` 在 Unix 不可写时不给出 sudo 命令（spec MUST 未满足）

`specs/shim-install-safety/spec.md` 的 Scenario 要求 `oso install-shims` 输出含 `sudo oso install-shims` 形态命令，但 `installShims` 只输出 `oso install-shims`；且「不可写 bin 目录」的首个失败点在 `copyOpenspecToOrig`（`copyFileSync`/`symlinkSync` 先抛 EACCES），该 catch 完全没有权限提示。

修复：
- 新增 `permissionHint(binDir, isWin)`（`src/shims-installer.ts`）：Unix 上按 `fs.accessSync(binDir, W_OK)` 区分 `sudo oso install-shims` 与 `oso install-shims`；Windows 上提示从管理员 shell 重跑。
- `copyOpenspecToOrig` 与 `installShimScripts` 两个 catch 都改用该 helper（原先只有后者、且无 sudo）。
- 新增两条用例：`unwritable binDir on unix suggests sudo install-shims`（RED → GREEN）、`writable binDir on unix does not suggest sudo`。
- 顺带：临时垫片文件改为 `writeFileSync(tmp, content, { mode: 0o755 })`，执行位随 inode 原子生效，避免 chmod 失败留下不可执行的 `openspec`。

### B. 新增 CI 守卫在 ubuntu/macOS 上不可达

`test/elevated/run.mjs:47-50` 在非 Windows 平台**直接运行** elevated（不经 gsudo），`lifecycle-e2e` 会真跑 `oso init`，需要真实 `openspec` CLI；CI 未安装它 → `npm test` 失败 → 守卫步骤被跳过（`ci.yml` 的 `Guard tracked build artifacts` 在 `npm test` 之后）。同时 `ci.yml` 原注释「非 Windows 无 gsudo 时 elevated 自动 SKIP」与实际相反。

修复：CI 在 `npm ci` 之后增加 `npm i -g @fission-ai/openspec`，并更正该注释。

### 同轮修正的文档陈旧项

- `docs/testing.md:41` 不再指向已删除的 `test/imp16-tarball-equivalence.test.js`，改为 `test/package-lifecycle.test.js`。
- `docs/testing.md` 的「测试不得写机器全局状态」「垫片恢复」两条不再把原因归给 `npm install` 的 `install` 生命周期。
- `docs/QUICKSTART.md` 的「安装后 setup 脚本会自动检测」改为「`oso init` 会检测」（本包已零安装期脚本）。
- `docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md` 增加一段「后续变化」注记，保留历史事实同时避免误读。
- `design.md` 的回滚说明明确 `138db7c15` 必须与 `84115256d` + `67d952bb7` 成套回退。

### 复验

```
npm run typecheck → exit 0
npm run build     → exit 0
npm test          → 主套件 336/336 pass、elevated 5/5 pass、fail 0
```

最终计数：**336**（334 + 2 条权限提示用例）。

## 已知未覆盖项（供后续跟进）

1. **npm 12 真机安装**（9.2）：需在 npm 12 环境复跑。
2. **CI 三平台绿灯**（9.5）：需推送后观察。
3. **Unix `chmod a-w` 端到端**（9.7）：需在 Linux/macOS 复跑。
4. **原子替换的「rename 失败」路径**（9.8）：当前用例注入点在写临时文件阶段，未覆盖「tmp 已写、rename 失败 → 清理 + 原文件不变」。
5. `README.md` 的垫片说明未列出「openspec 不在 PATH」这第四种情形（表述为「prints the exact command to run」仍成立，属简洁取舍）。
