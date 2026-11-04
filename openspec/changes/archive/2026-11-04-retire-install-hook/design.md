## Context

本包当前用 `package.json` 的 `install` 钩子实现「装完即生效」：钩子执行 `scripts/shims-installer.mjs`，后者静态 `import { installShims } from '../dist/shims-installer.js'`。`dist/` 是 `tsc` 产物，而 `tsc` 是 devDependency，于是干净 clone 上 `npm ci` 会先跑 `install` → 需要 `dist/` → 尚未构建 → 失败。为了让 `npm ci` 能跑通，只能把 80 个编译产物提交进 git。这是循环依赖，不是设计选择。

npm 11.16+ 起带生命周期脚本的包默认锁死脚本；npm 12 默认 soft skip（装成功但脚本不跑），并输出 `install scripts blocked`。本包零 dependencies，npm 12 的其他拦截（`--allow-git` / `--allow-remote`）不涉及它，唯一暴露面就是这个 `install` 钩子。删除后包变成零生命周期脚本，npm 12 无警告。

同时，`oso init` 的 `ensureShim` 是 `BUG004` 引入的兜底：垫片未生效时自动 `installShims`，失败即 `throw` 中止。删除钩子后这条路径升格为唯一生效路径，必须重新审视它的失败语义：项目文件通常已部署，缺的只是全局垫片，不该让整次 init 失败；而垫片写的是 **openspec 自己所在的 bin 目录**，是否需要提权取决于 openspec 是怎么装的。

## Goals / Non-Goals

**Goals:**

- `package.json` 不含 `preinstall` / `install` / `postinstall`；删除 `scripts/shims-installer.mjs`。
- `prepare` 在源目录构建，tarball 仍含 `dist/`；`dist/` 不再被 git 跟踪。
- 干净 clone → `npm ci` 成功，且 `dist/cli/index.js` 存在。
- CI 同时防「产物回潮」与「构建写脏工作区」。
- `oso init` 在垫片失败时继续完成 8/8、exit 0，并给出可照抄命令与真实 binDir。
- 垫片写入原子化，避免「unlink 成功、write 失败」导致用户的 `openspec` 命令消失。
- 帮助与报错统一 `oso`，子命令 `--help` 在任何副作用之前短路。
- 删除 imp16 测试但**不丢断言覆盖**；主套件计数 318 → 317。

**Non-Goals:**

- 不改 `package.json` 的 `version`（T005）或写 `CHANGELOG.md`（T005）。
- 不删除 `scripts/run-tests.mjs` 的 `restoreGlobalShim()`（GAP008）。
- 不删除其他 V2 遗留测试；不自动提权；不做 gsudo 存在性检测。
- 不改 `openspec-superpowers-opencode` 长命令的解析路径。
- 不给 dry-run 增加垫片逻辑。

## Decisions

### D1：用 `prepare` 承载构建，而不是 `postinstall`

生命周期矩阵已实测：`prepare` 在源仓库 `npm ci` / `npm pack` / `npm publish` 时执行，但从 tarball 安装时不执行。因此 `prepare` 不会污染用户机器，也不会要求用户安装 TypeScript。`postinstall` / `install` 会在用户机器执行且 npm 12 必被 blocked，禁止使用。

### D2：`dist/` 移出 git，但 `files` 仍含 `"dist/"`

`files` 决定 tarball 内容，`prepare` 在 pack 前现编；git 只存源码。这样源码与产物是单向关系，也消除 `.worktrees/<name>/` 内 `npm ci` 经钩子改写全局垫片 `TOOL_DIR` 的污染源。

### D3：CI 两条守卫缺一不可

- `git ls-files dist | wc -l` 必须为 0：防有人把产物重新提交回去。
- `git status --porcelain` 必须为空：防构建把产物或缓存写回被跟踪的源码树。
- 不用 `git status --porcelain -- dist`：`dist/` 已进 `.gitignore`，该命令恒为空，等于没有守卫。

### D4：init 的垫片失败从「中止」改为「跳过 + 结尾 banner」

- `ensureShim` 的返回契约不变（`ok` / `repaired` / `details`）。
- `initProject` 在 `!shimResult.ok` 时设置 `shimSkipped = true`，记录 `shimResult.details` 与 `shimResult.binDir`，打印 `warn`，继续 1/8 … 8/8。
- 8/8 的 `verifyProject` 不检查垫片（只有 `oso verify` 的 `runAllChecks` 才查），因此不会二次失败。
- 8/8 成功后再输出 banner；条件为 `shimSkipped`；init 返回 `success: true`（exit 0）。
- `dryRunProject` 不调用 `ensureShim`，不添加垫片逻辑。

### D5：权限提示按平台与 binDir 可写性生成

- 提示必须含：失败原因（`details`）、实际探测到的 `binDir`、可直接照抄的命令。
- Unix：`binDir` 不可写 → `sudo <binDir>/openspec ...`？不。正确做法是 `sudo oso install-shims`（实际写 openspec bin 的是全局 oso 的 `install-shims`）。若 `binDir` 可写（nvm / 用户级 prefix）→ `oso install-shims`，并说明无需 sudo。
- Windows：`以管理员身份打开 PowerShell，然后运行 oso install-shims`；追加静态说明「若已装 gsudo，可用 `gsudo oso install-shims` 代替」；不做检测。
- 说明装好后不需要重跑 init，只需执行那一条命令。
- 程序不调用 sudo、不弹 UAC。

### D6：垫片脚本原子替换

- 现状：`unlinkSync(dest)` → `writeFileSync(dest)`。unlink 成功而 write 失败时，`openspec` 命令消失。
- 改为：在 `dest` 同目录写 `openspec.tmp-<pid>-<rand>` → `renameSync(tmp, dest)`。
- POSIX 上 `rename` 只需目录写权限，不需要目标文件写权限；「目录可写、文件属 root」也安全。
- Windows 上 `renameSync` 覆盖已存在文件会失败 → 回退 `unlinkSync(dest)` + `renameSync(tmp, dest)`；此时内容已在临时位置，窗口极小。
- 无论成功失败，`finally` 清理临时文件；不得留下 `openspec.tmp-*`。

### D7：`setExecutable` 失败不再静默

- 收集失败文件名加入 `details`。
- Unix 上 `openspec`（主入口）chmod 失败 → `success: false`。
- Windows 直接 return，不受影响。

### D8：F003 只改字符串，不改标识符与解析

- 改的范围：`src/cli/index.ts` 中英 `helpText`、各 Usage 报错、未知子命令列表；`src/cli/create-project.ts` 的「等同于 / Equivalent to」；`src/verify.ts` 的 5 处用户可见 `fix` 与 1 处注释；`src/shims-installer.ts` 注释；`src/setup/index.ts` 提示文案。
- 不改：`src/setup/manifest.ts:108` 的 `project` 字段、`src/setup/planner.ts:15-18` 的四个 marker、`src/setup/reset.ts:88-89` 的项目名校验、任何已部署的 `.opencode/install-manifest.json`。
- 子命令 `--help`：在 `runCli()` 分发之前判断「`subcommand` 是已知子命令且 `args` 含 `--help` / `-h`」，打印该子命令说明并 `exit 0`。必须早于 `runInstallShims()` 等任何副作用。

### D9：GAP007 删除与迁移

- 删除 `test/imp16-tarball-equivalence.test.js`。
- 在 `ci.yml` 的 `Verify tarball contents` 步骤（已 `shell: bash`）中，在已有 `tar -tzf "$PACKAGE" > /tmp/tarlist.txt` 之后加入：
  - `tar -xzf "$PACKAGE" -O package/assets/shims/openspec.ps1 | grep -q 'Join-Path \$TOOL_DIR "lib"'` → 命中即失败。
  - `grep -qxF "package/tsconfig.json" /tmp/tarlist.txt` → 命中即失败。
  - `grep -q "^package/src/" /tmp/tarlist.txt` → 命中即失败。
- 其余断言由既有测试覆盖（见 tasks.md 的覆盖对照）。

## Risks / Trade-offs

- **删除钩子后用户忘记 `oso init`** → 垫片不生效。缓解：文档明确「安装 → `oso init`」，且 `oso verify` 会报 `openspec (shim)` 失败并给出修复命令。
- **Unix 系统 npm 的 `/usr/local/bin` 不可写** → 首次暴露提权问题。缓解：D5 的可照抄提示 + 原子替换 + `setExecutable` 显式失败。
- **`prepare` 在 `npm ci` 时构建** → 开发机需要 devDependencies（本来就需要）。CI 与开发机一致；用户从 tarball 安装不触发。
- **删除 imp16 后覆盖缺口** → 已逐条核对：CLI 系列在 `ci.yml`；registry/setup 导出面在单测；shim 三件套在 ci 既有断言；未知命令在 `test/cli.test.js`；「装了能跑」在 `lifecycle-e2e`。
- **主套件计数异常** → 预期 318 → 317；若减少更多，按 `openspec-shim-e2e` 静默少收集的既有陷阱排查，不得当作通过。
- **Windows rename 覆盖失败** → 回退路径仍有极小窗口；通过 finally 清理临时文件把风险限制在「短窗口 + 可恢复」。

## Migration Plan

1. 先改 `package.json`（删 `install`、加 `prepare`），删除 `scripts/shims-installer.mjs`。
2. `.gitignore` 加 `dist/`；`git rm -r --cached dist`（保留磁盘文件）。
3. 改 `src/shims-installer.ts`（原子替换、权限 details、chmod 失败）。
4. 改 `src/setup/index.ts`（跳过 + banner）与相关文案。
5. 改 CLI 输出（F003）与子命令 `--help`。
6. 改 `.github/workflows/ci.yml`（守卫 + 迁移断言）。
7. 删 imp16 测试、更新 `setup-shim-check.test.js` 的旧断言、新增测试。
8. 更新文档。
9. 全量验证：`npm run typecheck`、`npm run build`、`npm test`（317 + 5 elevated）、tarball 检查、权限/原子替换手工验收。

回滚：本 change 全部在 `feature/retire-install-hook` 分支；单个 commit 可 revert，但有两组必须成套回退——`138db7c15`（退役 `install` 钩子）单独 revert 会复现「干净 clone 上 `npm ci` 需要 `dist/`」的死循环，必须与 `84115256d`（`dist/` 取消跟踪）+ `67d952bb7`（`.gitignore` 锚定）一起回退；`dist/` 取消跟踪的 commit 只改索引，不删磁盘文件，若需回滚把 `dist/` 重新 `git add` 即可。

## Open Questions

无。实现时若发现必改点 6 列出的「回归重点」与必改点 5 的新行为冲突（例如 `test/setup-shim-check.test.js` 仍断言 init 中止），按必改点 5 的新行为更新该用例，并在 verify.md 记录「旧断言 → 新断言」的对应关系。
