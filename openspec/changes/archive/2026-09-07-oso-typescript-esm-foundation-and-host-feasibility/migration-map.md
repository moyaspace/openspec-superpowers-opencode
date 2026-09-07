# 迁移映射清单（IMP-IMP-0001）

> 由 explore agent 盘点生成（3m27s，逐文件读取验证）。0B 阶段执行依据。

## 一、文件总览

| 区域 | 文件数 | 说明 |
|------|--------|------|
| `bin/` | 2 | cli.js（442 行主入口）、create-project.js（49 行别名委托） |
| `lib/` 根 | 4 | registry-utils.js、registry.js、shims-installer.js、verify.js |
| `lib/setup/` | 13 | setup 全模块（index/cli-adapter/console-reporter/context/deploy/discovery/manifest/merge/planner/process-runner/prompt/reset/verify） |
| `scripts/` | 1 | shims-installer.js（npm install 钩子） |
| `lib/shims/` | 3 | **原生脚本资产**（openspec、openspec.cmd、openspec.ps1）——不迁移为 TS，迁入 `assets/shims/` |
| `test/` | 20 | 全部 node:test CommonJS 测试 |

## 二、映射表：现有文件 → 迁移后路径 → 覆盖测试

| 现有文件 | 迁移后路径 | 覆盖测试 |
|---------|-----------|---------|
| `bin/cli.js` | `src/cli/index.ts` | `test/cli.test.js`（子进程） |
| `bin/create-project.js` | `src/cli/create-project.ts` | **无**（迁移时补委托测试） |
| `lib/registry-utils.js` | `src/registry-utils.ts` | `test/registry-utils.test.js` |
| `lib/registry.js` | `src/registry.ts` | `test/registry.test.js` |
| `lib/shims-installer.js` | `src/shims-installer.ts` | `test/shims-installer.test.js` |
| `lib/verify.js` | `src/verify.ts` | `test/verify.test.js` |
| `lib/setup/index.js` | `src/setup/index.ts` | `test/setup-api.test.js`、`test/setup-reset.test.js` |
| `lib/setup/cli-adapter.js` | `src/setup/cli-adapter.ts` | `test/setup-cli-adapter.test.js` |
| `lib/setup/console-reporter.js` | `src/setup/console-reporter.ts` | **无**（迁移时补最小测试） |
| `lib/setup/context.js` | `src/setup/context.ts` | `test/setup-context.test.js` |
| `lib/setup/deploy.js` | `src/setup/deploy.ts` | `test/setup-deploy.test.js` |
| `lib/setup/discovery.js` | `src/setup/discovery.ts` | `test/setup-discovery.test.js` |
| `lib/setup/manifest.js` | `src/setup/manifest.ts` | `test/setup-manifest.test.js` |
| `lib/setup/merge.js` | `src/setup/merge.ts` | `test/setup-marker.test.js`、`test/setup-opencode-json.test.js` |
| `lib/setup/planner.js` | `src/setup/planner.ts` | `test/setup-planner.test.js` |
| `lib/setup/process-runner.js` | `src/setup/process-runner.ts` | `test/setup-process-runner.test.js` |
| `lib/setup/prompt.js` | `src/setup/prompt.ts` | `test/setup-prompt.test.js` |
| `lib/setup/reset.js` | `src/setup/reset.ts` | `test/setup-reset.test.js`（间接） |
| `lib/setup/verify.js` | `src/setup/verify.ts` | `test/setup-workflow-verify.test.js` |
| `scripts/shims-installer.js` | `src/cli/shims-installer-hook.ts`（+ package.json install 脚本指向 dist 编译产物） | **无直接测试** |
| `lib/shims/openspec` | `assets/shims/openspec`（原生资产） | `test/shim-intercept.test.ps1`（间接） |
| `lib/shims/openspec.cmd` | `assets/shims/openspec.cmd`（原生资产） | 同上 |
| `lib/shims/openspec.ps1` | `assets/shims/openspec.ps1`（原生资产） | 同上 |

## 三、__dirname 使用点（ESM 迁移改为 import.meta.url）

| 文件 | 代码 | 用途 | ESM 方案 |
|------|------|------|---------|
| `bin/cli.js:14` | `path.resolve(__dirname, '..')` | toolDir（安装根） | `fileURLToPath(import.meta.url)` 相对 `dist/cli/` 上两级 |
| `lib/verify.js:296` | `path.resolve(__dirname, '..')` | toolDir（runCLI 内） | 同上，相对 `dist/` 上一级 |
| `lib/setup/context.js:10` | `path.join(__dirname, '..', '..', 'template')` | 默认 templateDir | 相对 `dist/setup/` 上两级 + `resources/`（0B 按目录树决定 template 位置） |
| `scripts/shims-installer.js:15` | `path.resolve(__dirname, '..')` | toolDir | 编译后在 `dist/cli/`，相对上两级 |

## 四、require.main 守卫点（ESM 改为 pathToFileURL 比较）

| 文件 | 行号 |
|------|------|
| `lib/registry-utils.js` | 314（被 shim 以 `node <path> list` 直接调用） |
| `lib/verify.js` | 320 |

## 五、动态 require 清单（ESM 改静态 import）

| 文件 | 位置 | 动态形式 |
|------|------|---------|
| `bin/cli.js` | 15-18, 33, 295, 375, 399, 410, 428 | `require(path.join(toolDir, 'lib', ...))`、`require(package.json)` |
| `lib/verify.js` | 302, 307 | 函数内 `require('./registry-utils')`、`require('../bin/cli')` |
| `lib/setup/index.js` | 567, 624, 890 | 函数内 `require('./merge')`、`require('./reset')` |
| `scripts/shims-installer.js` | 26 | `require(path.join(toolDir, 'lib', 'shims-installer'))` |
| `lib/registry-utils.js` | 71, 182, 208 | 函数内静态 `require('child_process')`（可提升为顶层 import） |

## 六、npm install 钩子与 shim 自愈（关键风险）

- `package.json` 的 `"install": "node scripts/shims-installer.js install"`。
- npm v7+ 不运行 uninstall 钩子；卸载清理由 shim 自愈逻辑处理。
- **shim 脚本硬编码 `lib/registry-utils.js`**（sh/cmd/ps1 三份均有 `TOOL_DIR/lib/registry-utils.js` 引用）。0B 迁移后该路径变为 `dist/registry-utils.js`，**shim 资产内容必须同步更新**——这是"已批准的发布结构变化"，等价性由 shim 拦截/委托行为测试证明（脚本职责不变，仅委托目标路径更新）。
- shim 自愈检查同样依赖该路径，迁移时必须一并更新并测试。

## 七、迁移顺序（0B 执行序，按依赖风险）

1. **无状态纯函数组**：merge、prompt、discovery、manifest、planner、deploy、process-runner、console-reporter、cli-adapter、registry
2. **registry-utils**（含 require.main 守卫改造）
3. **setup/index + reset + setup/verify**（函数内动态 require 提升）
4. **shims-installer + assets/shims 迁移**（含 shim 委托路径更新）
5. **lib/verify**（动态 require + 守卫）
6. **CLI 入口**（bin/cli.js 动态 require 全部转静态 import；package.json bin/exports/install 钩子切换）
7. **删除 CommonJS 源码**（bin/、lib/ 全部 .js）

## 八、风险清单

1. 动态 require 是最大风险——全部改静态 import（CLI 启动路径无循环依赖问题；verify→cli 的 try/catch require 需重构为函数调用）。
2. shim 三份资产委托路径更新遗漏会导致拦截失效——迁移后必须跑 shim-intercept 测试。
3. `require(package.json)` 读版本——ESM 用 `createRequire` 或 fs.readFileSync+JSON.parse（规范禁止把 JSON import 依赖当默认）。
4. `bin/create-project.js`、`console-reporter.js` 无测试覆盖——迁移前先补最小行为测试（纳入 IMP-48 基线）。
5. process.exit 15+ 处——保持行为不变（形式转换），不重构为异常流。
6. 测试文件本身是 CommonJS——0B 时测试也统一迁 TS（`test/**/*.test.ts`），由显式发现入口运行。
