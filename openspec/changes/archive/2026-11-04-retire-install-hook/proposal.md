## Why

`install` 生命周期钩子静态 import `dist/`，形成「`dist/` 必须入库」的循环依赖；同时 npm 12 默认拦截带生命周期脚本的包，桥接会静默失效。继续保留等于要求每个用户记住 `--allow-scripts`，忘记则 openspec 仍是官方原版。删除钩子并把 `dist/` 移出 git，可以让包变成零生命周期脚本、让源码与产物恢复单向关系，并让 `oso init` 成为垫片安装的唯一生效路径。另外，V2 迁移遗留的 `imp16-tarball-equivalence.test.js` 已失去意义且污染 V1 发版线；帮助与报错中的长命令也应统一为可直接照抄的 `oso`。

## What Changes

**npm 生命周期与构建产物**
- From: `package.json` 有 `"install": "node scripts/shims-installer.mjs install"`；`scripts/shims-installer.mjs` 静态 import `../dist/shims-installer.js`；`dist/` 的 80 个文件被 git 跟踪。
- To: 删除 `install` 钩子与 `scripts/shims-installer.mjs`；新增 `"prepare": "npm run build"`；`.gitignore` 加 `dist/` 并 `git rm -r --cached dist`；`files` 仍保留 `"dist/"`。
- Reason: 消除循环依赖与 npm 12 拦截；构建只在源目录发生。
- Impact: 非破坏性 CLI 行为，但安装后不再自动装垫片，需 `oso init` 兜底。

**CI 守卫**
- From: 无守卫；`dist/` 可被重新 `git add`，构建也可能写脏工作区。
- To: 在 `npm test` 之后、`npm pack` 之前增加 `git ls-files dist` 为空与 `git status --porcelain` 为空两条检查。

**`oso init` 垫片失败处理**
- From: `ensureShim` 失败时 `throw`，init 中止。
- To: 记录 `shimSkipped`，打印 `warn`，继续走完 8/8 并 exit 0；结尾输出独立 banner，含失败原因、实际 binDir 与按平台/权限区分的可照抄命令。
- Reason: 项目文件已部署完成，缺的只是全局垫片；不应让整次 init 失败。
- Impact: 取代 `BUG004` 关闭条件中「失败即明确中止」的表述；`BUG004` 核心结论不变。

**垫片安装安全性**
- From: `unlinkSync` 后 `writeFileSync`（写入失败会让用户 `openspec` 命令消失）；`setExecutable` 静默吞错。
- To: 同目录临时文件 + `renameSync` 原子替换（Windows 回退 unlink + rename）；`EACCES` / `EPERM` 时 details 追加 binDir 与可照抄命令；chmod 失败进入 details，Unix 主入口失败判 `success: false`。

**V2 迁移遗留测试**
- From: `test/imp16-tarball-equivalence.test.js` 随包发布，写死 `1.1.1`，与 `lifecycle-e2e` 重叠。
- To: 删除该文件；两条独有断言迁入 `ci.yml` 的 tarball 内容检查；主套件计数 318 → 317。

**CLI 命令指引**
- From: 帮助与报错大量使用 `openspec-superpowers-opencode`；子命令 `--help` 会直接执行动作。
- To: 用户可见命令指引统一为 `oso ...`；`create-openspec-superpowers-opencode` 帮助保留自身用法行但「等同于」改为 `oso init <target-dir>`；新增子命令级 `--help` 并在副作用前短路。`manifest.ts` / `planner.ts` / `reset.ts` 的标识符与 marker 不动，长命令解析路径不动。

## Capabilities

### New Capabilities

- `package-lifecycle`: 零生命周期脚本、`prepare` 构建、`dist/` 移出 git、干净 clone 可 `npm ci`、tarball 含现编产物、CI 防回潮守卫。
- `shim-install-safety`: 垫片写入的原子替换、权限失败的可执行提示、chmod 失败不再静默成功。
- `cli-command-guidance`: 帮助与报错的 `oso` 命令指引、子命令 `--help` 无副作用短路、标识符与长命令解析不回归。
- `release-tarball-verification`: 删除 V2 迁移遗留测试并把独有断言迁入 CI，保持覆盖等价。

### Modified Capabilities

- `init-shim-selfcheck`: 垫片自动修复失败时不再中止 init，改为 warn + 跳过 + 结尾 banner，init 仍成功。

## Impact

- 打包与发布：`package.json`（scripts、files 不变、bin 不变、version 不变）、`.gitignore`、`dist/` 跟踪状态、`.github/workflows/ci.yml`。
- 安装器：`src/shims-installer.ts`（`installShimScripts`、`setExecutable`、`installShims` 的失败详情）。
- 初始化：`src/setup/index.ts`（垫片失败分支与结尾 banner）、`src/setup/shim-check.ts`（契约不变）。
- CLI：`src/cli/index.ts`、`src/cli/create-project.ts`、`src/verify.ts`。
- 测试：删除 `test/imp16-tarball-equivalence.test.js`；更新 `test/setup-shim-check.test.js` 的「失败即中止」用例；新增 `test/package-lifecycle.test.js`、`test/cli.test.js` 用例；更新过时注释。
- 文档：`README.md`、`docs/QUICKSTART.md`。
- 不涉及：`version`、`CHANGELOG.md`、`scripts/run-tests.mjs`、其他 V2 遗留测试、`manifest.ts` / `planner.ts` / `reset.ts` 的标识符。
