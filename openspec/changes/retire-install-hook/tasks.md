## 1. 删除 install 钩子并改用 prepare（必改点 1、2）

- [ ] 1.1 `package.json`：删除 `"scripts.install": "node scripts/shims-installer.mjs install"`，确认 `scripts` 不含 `preinstall` / `install` / `postinstall`。
- [ ] 1.2 删除 `scripts/shims-installer.mjs`（保留 `src/shims-installer.ts`、`src/setup/shim-check.ts`、`src/cli/index.ts` 的 `install-shims` / `uninstall-shims`）。
- [ ] 1.3 `package.json`：增加 `"scripts.prepare": "npm run build"`；MUST NOT 使用 `postinstall` 或 `install` 承载构建。
- [ ] 1.4 确认 `package.json` 的 `files` 数组仍包含 `"dist/"`，`bin` 的 `oso` / `openspec-superpowers-opencode` / `create-openspec-superpowers-opencode` 映射不变，`version` 不变。
- [ ] 1.5 确认没有其他文件引用 `scripts/shims-installer.mjs`。

## 2. dist 移出 git（必改点 3）

- [ ] 2.1 `.gitignore` 增加 `dist/`（放在手工维护区，紧邻 `node_modules/` 或独立一行）。
- [ ] 2.2 执行 `git rm -r --cached dist`，保留磁盘文件；确认 `git status` 显示的是删除跟踪（D）而非工作区文件消失。
- [ ] 2.3 确认 `git ls-files dist` 输出为空，且磁盘上的 `dist/cli/index.js` 仍存在。
- [ ] 2.4 该 commit 的 message 写明「dist/ 取消 git 跟踪（未删除源码），改由 prepare 在 pack 前构建」。

## 3. CI 守卫（必改点 4）

- [ ] 3.1 `.github/workflows/ci.yml`：在 `Run tests`（`npm test`）之后、`npm pack` 之前插入一步，`shell: bash`。
- [ ] 3.2 守卫一：`tracked=$(git ls-files dist | wc -l); [ "$tracked" -eq 0 ] || { echo "FAIL: dist/ is tracked by git ($tracked files)"; exit 1; }`。
- [ ] 3.3 守卫二：`dirty=$(git status --porcelain); [ -z "$dirty" ] || { echo "FAIL: working tree dirty after build:"; echo "$dirty"; exit 1; }`。
- [ ] 3.4 确认未使用 `git status --porcelain -- dist`（`dist/` 已 ignore，恒为空，等于无守卫）。

## 4. 垫片权限、提示与原子替换（必改点 5 第 1–5 项）

- [ ] 4.1 `src/setup/index.ts`：`ensureShim` 失败时删除 `throw`，设置 `shimSkipped = true`，保存 `shimResult.details` 与 `shimResult.binDir`。
- [ ] 4.2 失败时打印 `{ type: 'warn' }`：垫片未安装，跨 worktree 合并不可用，其余功能不受影响；继续执行 1/8 … 8/8。
- [ ] 4.3 8/8 成功后、`banner-init` 之前，若 `shimSkipped` 输出独立提示块：失败原因、实际 `binDir`、可直接照抄命令；Unix 按 `binDir` 可写性区分 `sudo oso install-shims` 与 `oso install-shims`；Windows 给「以管理员身份打开 PowerShell，然后运行 `oso install-shims`」并静态追加 gsudo 备选；说明无需重跑 init。
- [ ] 4.4 `shimSkipped` 时 `initProject` 仍返回 `success: true`（CLI exit 0）；`dryRunProject` 不增加垫片逻辑。
- [ ] 4.5 `src/shims-installer.ts`：`installShims` 捕获 `EACCES` / `EPERM` 时在 `details` 追加 `binDir` 与可照抄命令；`openspec not found` / assets 缺失保持原文案。
- [ ] 4.6 `src/shims-installer.ts`：`installShimScripts` 改为同目录临时文件 + `renameSync`；Windows rename 覆盖失败回退 `unlinkSync` + `renameSync`；`finally` 清理临时文件，确保无 `openspec.tmp-*` 残留。
- [ ] 4.7 `src/shims-installer.ts`：`setExecutable` 收集失败文件名加入 `details`；Unix 上 `openspec` 主入口 chmod 失败时 `installShims` 返回 `success: false`；Windows 分支保持直接 return。
- [ ] 4.8 确认程序不调用 sudo、不弹 UAC、不检测 gsudo。

## 5. 文档（必改点 5 文档部分）

- [ ] 5.1 `README.md` 的安装命令保持不带 `--allow-scripts`。
- [ ] 5.2 `docs/QUICKSTART.md` 的安装命令保持不带 `--allow-scripts`。
- [ ] 5.3 `docs/QUICKSTART.md` 安装小节增加「权限说明」：系统 npm（`/usr/local/bin` 需 sudo）、nvm / 用户级 prefix（无需 sudo）、Windows（需管理员），并解释**为什么**要看 `openspec` 装在哪。
- [ ] 5.4 `docs/QUICKSTART.md`「验证安装」小节补充：`oso init` 会自动检查并安装 `openspec` 垫片；装不上不会中止 init，而是提示该跑哪条命令。
- [ ] 5.5 全仓搜索 `allow-scripts`：除 `local/notes/oso/issues/oso-install-notes.md` 外，无「需要 `--allow-scripts`」类残留表述。

## 6. 测试（GAP006 + F003 用例，必改点 6）

- [ ] 6.1 新增用例：断言 `package.json` 不含 `preinstall` / `install` / `postinstall`，且 `scripts/shims-installer.mjs` 不存在。
- [ ] 6.2 新增用例：断言 `.gitignore` 含 `dist/`，且 `git ls-files dist` 为空（用 `child_process` 调 git）。
- [ ] 6.3 更新 `test/setup-shim-check.test.js`：原「垫片未生效且修复失败 → 中止」用例改为「不中止、走完 8/8、exit success、输出 warn 与 banner；banner 含 binDir 与可照抄命令」。
- [ ] 6.4 更新 `test/elevated/lifecycle-e2e.test.js:26-32` 的 `makeIsolatedBin()` 注释：删除「`npm install <tarball>` 的 postinstall」表述，只保留「`oso init` 的 `ensureShim` 会执行 `installShims`」；隔离夹具本身保留不动。
- [ ] 6.5 核对 `test/create-project.behavior.test.js:18` 附近注释：若提到 npm 安装钩子则更正；隔离夹具保留。
- [ ] 6.6 执行 `grep -rn "postinstall" test/ src/ scripts/`，确认所有命中属实（本包不应有 postinstall）。
- [ ] 6.7 `test/cli.test.js` 新增 F003 用例：中英 `--help` 中 `openspec-superpowers-opencode` 精确匹配计数为 0（排除 `create-openspec-superpowers-opencode`）。
- [ ] 6.8 `test/cli.test.js` 新增 F003 用例：`oso install-shims --help` / `oso registry --help` 在隔离环境执行后，bin 目录与工作区内容前后一致。
- [ ] 6.9 `test/cli.test.js` 新增 F003 用例：`openspec-superpowers-opencode --version` 正常返回且与 `oso --version` 一致。
- [ ] 6.10 新增守卫测试：读取 `src/setup/manifest.ts` / `planner.ts` / `reset.ts` 的关键字符串（`project: 'openspec-superpowers-opencode'`、四个 marker），防止未来全仓替换。
- [ ] 6.11 保留 `test/shims-installer.test.js`（非 elevated，使用 `tmpDir` 夹具），不得因名字相似而删除。
- [ ] 6.12 回归：`test/elevated/lifecycle-e2e.test.js`、`test/elevated/shims-installer.elevated.test.js`、`test/setup-shim-check.test.js` 全部通过。

## 7. GAP007 删除与迁移（必改点 7）

- [ ] 7.1 删除 `test/imp16-tarball-equivalence.test.js`（143 行）。
- [ ] 7.2 `ci.yml` 的 `Verify tarball contents` 步骤：在 `tar -tzf "$PACKAGE" > /tmp/tarlist.txt` 之后加入 ps1 检查——`tar -xzf "$PACKAGE" -O package/assets/shims/openspec.ps1 | grep -q 'Join-Path \$TOOL_DIR "lib"'` 命中即 `exit 1`。
- [ ] 7.3 同步骤加入：`grep -qxF "package/tsconfig.json" /tmp/tarlist.txt` 命中即失败；`grep -q "^package/src/" /tmp/tarlist.txt` 命中即失败。
- [ ] 7.4 逐条核对覆盖未丢：CLI 三入口 → `ci.yml` CLI 步骤；registry/setup 导出面 → `test/registry.test.js`、`test/setup-api.test.js`；shim 三件套 → `ci.yml` 既有断言；未知命令非零退出 → `test/cli.test.js`；「装了能跑」→ `test/elevated/lifecycle-e2e.test.js`。
- [ ] 7.5 记录删除前/后主套件计数（预期 318 → 317）到 `verify.md`；若减少更多，排查是否静默少收集。
- [ ] 7.6 确认打出的 tarball 不含 `package/test/imp16-tarball-equivalence.test.js`。

## 8. 帮助与报错统一 oso + 子命令 --help（F003 / 必改点 8）

- [ ] 8.1 `src/cli/index.ts` 中文 `helpText`：13 条命令示例与示例段全部改为 `oso ...`。
- [ ] 8.2 `src/cli/index.ts` 英文 `helpText`：同上。
- [ ] 8.3 `src/cli/index.ts` 用法报错：`ensure-worktree`、`remove-worktree`、`registry`、不在 OpenSpec 项目的提示、未知子命令的「可用命令」列表，全部改为 `oso ...`。
- [ ] 8.4 `src/cli/create-project.ts`：用法行保留 `create-openspec-superpowers-opencode`，「等同于 / Equivalent to」改为 `oso init <target-dir>`。
- [ ] 8.5 `src/verify.ts`：`:254`、`:277`、`:312`、`:313`、`:340` 的 `fix` 改为 `oso ...`；`:15` 注释一并更正。
- [ ] 8.6 `src/shims-installer.ts:16` 注释改为 `oso install-shims`。
- [ ] 8.7 `src/setup/index.ts` 的垫片失败/提示文案改为 `oso install-shims`。
- [ ] 8.8 `src/cli/index.ts` 新增子命令级 `--help`：识别 `subcommand` + `--help` / `-h` 时打印说明并 `exit 0`，覆盖 `init` / `reset` / `dry-run` / `ensure-worktree` / `registry` / `verify` / `install-shims` / `uninstall-shims` / `remove-worktree`；`install-shims` 说明必须含权限说明。
- [ ] 8.9 确认 `--help` 分支位于 `runInstallShims()` / `runUninstallShims()` / `handleRegistry()` 等任何副作用之前。
- [ ] 8.10 确认 `openspec-superpowers-opencode` 长命令的解析路径（`package.json` 的 bin 映射与 `args[0]` 判断）未改动。
- [ ] 8.11 确认 `src/setup/manifest.ts`、`src/setup/planner.ts`、`src/setup/reset.ts` 无任何改动。

## 9. 验收（逐项记录命令、输出与结论）

- [ ] 9.1 GAP006-1：`node -p "Object.keys(require('./package.json').scripts)"` 不含 `install` / `postinstall` / `preinstall`；`scripts/shims-installer.mjs` 不存在；`git ls-files dist` 为空。
- [ ] 9.2 GAP006-2：npm 12 下 `npm i -g <tarball>` 无 `install scripts blocked` 警告；`oso init` 能装好垫片；`oso verify` 的 `openspec (shim)` 通过。
- [ ] 9.3 GAP006-3：`tar -tzf <name>.tgz | grep 'package/dist/cli/index.js'` 命中；`lifecycle-e2e` 通过。
- [ ] 9.4 GAP006-4：干净 clone → `npm ci` 成功；`dist/` 由 `prepare` 生成，`dist/cli/index.js` 存在。
- [ ] 9.5 GAP006-5：CI 三平台全绿；人为在 `dist/` 制造漂移、或人为 `git add dist` 时，新增守卫必须失败。
- [ ] 9.6 GAP006-6：`README.md` / `docs/QUICKSTART.md` 无「需要 `--allow-scripts`」；写明 `oso init` 会自检修复垫片。
- [ ] 9.7 权限：Unix 上 `chmod a-w` 临时 bin 目录后 `oso init` 不中止、走完 8/8、exit 0，结尾含实际 binDir 与可照抄命令；`oso install-shims` 单独执行给出同样提示并非零退出；Unix 提示含 sudo 形态且说明 nvm 用户无需 sudo；Windows 提示含管理员与 gsudo 备选；主入口 chmod 失败不再返回 success。
- [ ] 9.8 原子替换：人为让写入阶段失败（如临时目录只读）→ 原 `openspec` 文件仍存在且内容不变，无 `openspec.tmp-*` 残留。
- [ ] 9.9 回归：317 主套件 + 5 elevated 全绿（318 减去 GAP007 删除的 1 条）。
- [ ] 9.10 `npm run typecheck` 与 `npm run build` 通过。
- [ ] 9.11 `install-shims` / `uninstall-shims` 行为不回归（`test/setup-shim-check.test.js` 覆盖）。
- [ ] 9.12 GAP007-12：`test/imp16-tarball-equivalence.test.js` 已删除；`verify.md` 记录 318 → 317。
- [ ] 9.13 GAP007-13：两条独有断言已迁入 `ci.yml`，人为制造违规（ps1 含旧 lib 路径 / tarball 含 `src/` 或 `tsconfig.json`）时 CI 失败。
- [ ] 9.14 GAP007-14：打出的 tarball 不含 `test/imp16-tarball-equivalence.test.js`。
- [ ] 9.15 F003-AC1：`oso --help` 与 `oso --help --lang zh-CN` 中 `openspec-superpowers-opencode` 精确匹配计数为 0（排除 `create-openspec-superpowers-opencode`）。
- [ ] 9.16 F003-AC2：`oso ensure-worktree`、`oso remove-worktree`、`oso registry`、`oso __no_such__`、`oso verify` 的 fix 提示均不含长名。
- [ ] 9.17 F003-AC3：`openspec-superpowers-opencode --version` 与 `oso --version` 版本号一致，退出码均为 0。
- [ ] 9.18 F003-AC4：`create-openspec-superpowers-opencode --help` 的用法行是自己的名字，「等同于 / Equivalent to」显示 `oso init <target-dir>`。
- [ ] 9.19 F003-AC5：`git diff` 中 `src/setup/manifest.ts`、`planner.ts`、`reset.ts` 无改动；已部署夹具的 `.opencode/install-manifest.json` 的 `project` 仍为 `openspec-superpowers-opencode`。
- [ ] 9.20 F003-AC6：`oso install-shims --help` 打印说明、exit 0，隔离 bin 目录内容前后一致；`oso registry --help` 同理无副作用。
