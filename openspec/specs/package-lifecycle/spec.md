# package-lifecycle Specification

## Purpose
TBD - created by archiving change retire-install-hook. Update Purpose after archive.
## Requirements
### Requirement: 包 MUST NOT 声明安装生命周期脚本

根 `package.json` 的 `scripts` MUST NOT 包含 `preinstall`、`install`、`postinstall` 任一键。仓库 MUST NOT 保留 `scripts/shims-installer.mjs`。垫片的安装 MUST 仅通过 `oso install-shims` 或 `oso init` 的 `ensureShim` 触发，MUST NOT 依赖 npm 安装生命周期。

#### Scenario: package.json 无安装生命周期脚本

- **WHEN** 读取根 `package.json` 的 `scripts`
- **THEN** 键集合不包含 `preinstall`、`install`、`postinstall`

#### Scenario: 安装钩子脚本已删除

- **WHEN** 检查仓库文件 `scripts/shims-installer.mjs`
- **THEN** 该文件不存在

#### Scenario: 源码安装器仍然保留

- **WHEN** 检查 `src/shims-installer.ts` 与 `src/setup/shim-check.ts`
- **THEN** 两者仍存在且可被 `install-shims` / `ensureShim` 调用

### Requirement: 构建 MUST 由 prepack 在打包前承载

根 `package.json` MUST 提供 `"prepack": "npm run build"`。构建 MUST NOT 放入 `install`、`postinstall`、`preinstall` 或 `prepare`。`scripts` MUST NOT 含 `prepare`：npm >= 11.16 的 `allowScripts` 门禁按「声明即告警」枚举生命周期脚本，不判断该脚本在当前安装场景是否真的执行，因此 `prepare` 会让用户安装 tarball 时看到 `install scripts blocked` / `not yet covered by allowScripts` 警告，而它在 tarball 安装场景本就不执行。干净 clone 的 `npm ci` MUST NOT 依赖任何生命周期脚本生成 `dist/`；`npm test`（首步 typecheck、次步 build）与 `npm run build` MUST 生成 `dist/cli/index.js`。从 tarball 安装到其他项目时 MUST NOT 执行构建。

#### Scenario: 没有任何安装期生命周期脚本

- **WHEN** 读取根 `package.json` 的 `scripts`
- **THEN** 键集合不包含 `preinstall`、`install`、`postinstall`、`prepare`

#### Scenario: 干净 clone 由 build 生成 dist

- **WHEN** 在干净 clone 中执行 `npm ci`
- **THEN** 命令以 exit 0 结束
- **AND** `dist/` 的存在与否不构成 `npm ci` 的成败条件
- **AND** 随后执行 `npm test` 或 `npm run build` 后 `dist/cli/index.js` 存在

#### Scenario: tarball 安装不执行构建

- **WHEN** 把打好的 tarball 安装到另一个项目
- **THEN** 安装过程不执行本包的构建脚本
- **AND** 安装过程 MUST NOT 产生 `allowScripts` 相关警告
- **AND** 安装目录仍包含 tarball 自带的 `dist/`

### Requirement: dist MUST NOT 被 git 跟踪但仍进入 tarball

仓库 MUST 在 `.gitignore` 中包含 `dist/`，且 `git ls-files dist` MUST 输出为空。`package.json` 的 `files` MUST 仍包含 `"dist/"`。打出的 tarball MUST 包含 `package/dist/cli/index.js`。

#### Scenario: dist 不再被 git 跟踪

- **WHEN** 在仓库根执行 `git ls-files dist`
- **THEN** 输出为空

#### Scenario: tarball 仍包含构建产物

- **WHEN** 执行 `npm pack` 并检查 tarball 列表
- **THEN** 列表包含 `package/dist/cli/index.js`

### Requirement: CI MUST 守卫产物回潮与构建写脏

CI 的 `npm test` 之后、`npm pack` 之前 MUST 增加一步（`shell: bash`），执行两条检查：`git ls-files dist` 计数必须为 0；`git status --porcelain` 必须为空。任一条不满足 MUST 以非 0 退出。

#### Scenario: 产物被重新提交时 CI 失败

- **WHEN** 有人把 `dist/` 重新 `git add` 并提交，CI 运行该守卫
- **THEN** 守卫检测到被跟踪的 `dist/` 文件并以非 0 退出

#### Scenario: 构建写脏被跟踪文件时 CI 失败

- **WHEN** 构建过程修改了任何被跟踪的源码或配置文件，CI 运行该守卫
- **THEN** 守卫检测到非空 `git status --porcelain` 并以非 0 退出

### Requirement: 文档 MUST NOT 要求 allow-scripts

`README.md` 与 `docs/QUICKSTART.md` MUST NOT 出现要求用户添加 `--allow-scripts` 的安装指令。两份文档 MUST 说明 `oso init` 会自动检查并安装 `openspec` 垫片；装不上不会中止 init，而会提示该运行哪条命令。

#### Scenario: 文档不再要求 allow-scripts

- **WHEN** 搜索 `README.md` 与 `docs/QUICKSTART.md` 中的 `allow-scripts`
- **THEN** 不存在「需要 `--allow-scripts`」类表述

#### Scenario: 文档说明 init 会自检垫片

- **WHEN** 阅读 `docs/QUICKSTART.md` 的「验证安装」小节
- **THEN** 说明 `oso init` 会自动检查并安装 `openspec` 垫片
- **AND** 说明装不上不会中止 init，而是提示该运行哪条命令

