# 统一 Setup Scripts 为 JavaScript 设计

日期：2026-07-25
状态：已确认，待实施计划

## 背景

当前 `oso init`、`oso reset` 和 `oso dry-run` 由 `bin/cli.js` 根据操作系统选择并启动 `scripts/setup.ps1` 或 `scripts/setup.sh`。两套脚本各自实现约 1,100 行相同职责，包括前置检查、Superpowers 发现、模板部署、棕地合并、验证、manifest 生成和卸载。

这种结构已经产生行为漂移：

- Windows 与 Linux 对无效 `BROWN_OVERRIDE_*` 值的处理不同。
- Linux schema 验证失败后仍可能输出“验证通过”，Windows 会记录失败。
- `BROWN_OVERRIDE_OCODEJSON` 只存在于 PowerShell 实现。
- 路径分隔符、JSON 处理、hash 工具和命令转义依赖不同平台工具。
- setup 测试大量复制脚本逻辑，而不是直接测试生产实现。
- 固定使用 `verify-deploy` 作为验证 change 名称，清理时存在误删同名用户数据的风险。

## 目标

- 用一套 JavaScript 实现 `init`、`reset` 和 `dry-run` 的全部行为。
- 保留以下稳定公开入口：
  - `oso init [dir] [--lang zh-CN|zh-TW|en]`
  - `oso reset [dir]`
  - `oso dry-run [dir] [--lang zh-CN|zh-TW|en]`
  - `create-openspec-superpowers-opencode [dir]`
- 删除 `scripts/setup.ps1` 和 `scripts/setup.sh`，不保留直接脚本调用兼容层。
- 保持绿地、棕地、语言选择、环境变量覆盖、manifest 和 reset 的现有用户语义。
- 让 `dry-run` 与实际部署共享同一个操作计划。
- 将跨平台差异限制在路径发现和外部进程执行模块中。
- 让自动化测试直接覆盖生产模块。

## 非目标

- 不改变 OPSX workflow 或 schema 内容。
- 不重构 registry、worktree、shim 等无关 CLI 子命令。
- 不引入通用安装框架或声明式插件系统。
- 不承诺兼容用户直接执行旧的 `setup.ps1` 或 `setup.sh`。
- 不删除或覆盖 `openspec/changes/`、`openspec/specs/` 中的用户数据。

## 方案比较

### 方案 A：单文件 `scripts/setup.js`

把两套脚本直接翻译为一个 JavaScript 文件，CLI 继续启动子进程执行它。迁移成本最低，但会保留进程转发并形成新的千行脚本，测试和模块边界仍然较差。

### 方案 B：模块化 `lib/setup/`（采用）

CLI 直接导入 setup API。规划、合并、部署、验证和 reset 分成可独立测试的模块。该方案消除脚本分发，保持现有 CLI 契约，并控制实现复杂度。

### 方案 C：声明式安装引擎

把所有操作描述为配置，由通用引擎解释执行。扩展性最好，但当前只有一套安装模板，抽象和迁移成本超过实际收益。

## 总体架构

建议模块结构：

```text
bin/cli.js                 参数解析、用户输出、退出码
bin/create-project.js      init 命令别名

lib/setup/
  index.js                 initProject/resetProject/dryRunProject
  context.js               目标目录、模板目录、语言、环境和运行模式
  discovery.js             外部 CLI 与 Superpowers 安装位置发现
  planner.js               生成结构化安装或删除操作
  deploy.js                执行目录和文件操作
  merge.js                 JSON 与 marker 文件合并
  manifest.js              manifest 生成、兼容读取和安全校验
  reset.js                 按 manifest 生成并执行删除计划
  verify.js                schema、模板和 workflow 验证
  prompt.js                交互询问与环境变量覆盖
  process-runner.js        跨平台外部命令执行
```

`bin/cli.js` 只做参数解析与结果映射，不承载 setup 业务逻辑，也不在内部模块中调用 `process.exit()`。

公共 API：

```js
await initProject(options);
await resetProject(options);
await dryRunProject(options);
```

`options` 至少包含 `targetDir`、`lang`、输入输出接口和环境变量。测试可以注入 prompt、文件系统边界或 process runner；生产环境使用默认实现。

## Init 流程

```text
解析参数
  -> 解析并校验目标目录
  -> 目标不存在时创建目录
  -> Git dirty 检查
  -> 前置工具检查
  -> Superpowers 路径和版本发现
  -> 判断绿地或棕地
  -> 收集覆盖决策
  -> 生成部署计划
  -> 执行计划
  -> 写入 manifest
  -> schema/workflow 验证
  -> 创建 registry
  -> Git 初始化、暂存和首次提交
```

部署计划使用结构化操作，不存储拼接后的 shell 命令。例如：

```js
{ type: 'mkdir', path: 'openspec/specs' }
{ type: 'copy', source: '...', target: 'openspec/config.yaml' }
{ type: 'write', target: '.opencode/opencode.json', content: '...' }
```

在写入前必须完成目标路径检查、JSON 解析、marker 分析和合并内容计算。单个生成文件通过同目录临时文件写入后 rename，避免留下截断内容。

## Dry-run 流程

`dry-run` 与 `init` 使用相同的检查、决策和 planner，但不调用 deployer，不运行会改变项目状态的验证命令，也不创建 registry 或 Git commit。

输出应展示实际计划中的创建、覆盖、合并、跳过和保留操作。禁止在 planner 中以 `dryRun` 条件复制另一套部署逻辑。

## Reset 流程

`reset` 读取 `.opencode/install-manifest.json`，校验后生成删除计划，展示并确认，再执行删除。

安全规则：

- 拒绝绝对路径。
- 拒绝包含 `..` 的路径。
- 解析后的目标必须位于项目根目录内。
- 不跟随目录符号链接递归删除。
- 只删除 manifest 记录的可卸载文件。
- 仅在目录为空时删除父目录。
- 永远不删除 `openspec/changes/` 和 `openspec/specs/`。
- 保持现有受保护文件语义：不自动回滚 `AGENTS.md`、`opencode.json`、`.gitignore`、`.gitattributes` 和 `.editorconfig` 中的合并内容，而是输出人工处理提示。

## 棕地合并

所有 `BROWN_OVERRIDE_*` 值由 `prompt.js` 统一规范化。支持 `yes`、`no`，commands/skills 额外支持 `ask`；无效值回退到交互询问，不把原始无效值当成决策。

`opencode.json` 合并必须：

- 保持模板 key 顺序。
- 在模板 key 后追加用户自定义 key。
- 空值回退到模板默认值，用户独有的空 key 不写入结果。
- 强制 required edit paths 为 `allow`。
- 强制 schema/config paths 为 `deny`。
- 保留用户其他 permission 分组和自定义设置。

`AGENTS.md`、`.gitignore`、`.gitattributes` 和 `.editorconfig` 使用各自 marker 识别 bridge 管理区段：不存在目标时创建；目标存在但没有 marker 时追加；存在完整 marker 时根据决策替换或跳过。异常或不完整 marker 必须明确报错或走已定义的保守分支，不能静默截断用户文件。

## Superpowers 发现与 Skill Lock

使用 `os.homedir()`、`path.join()` 和 Node 目录遍历查找：

```text
<home>/.cache/opencode/packages/superpowers@*/.../node_modules/superpowers/skills
```

不使用 `find`、PowerShell glob、`grep`、`sha256sum` 或 `Get-FileHash`。版本读取、JSON 解析和 SHA-256 校验分别使用 Node `JSON.parse` 和 `crypto`。

根据 Superpowers 主版本选择 `skills.lock.v<major>.json`；不存在时按确定性排序选择 fallback，并将选中的内容部署为项目根目录 `skills.lock.json`。hash 不匹配继续保持 warning，不阻塞 init。

## Manifest

manifest 在文件部署完成后、workflow 验证前写入。验证结束后更新状态，使失败安装仍能执行 `oso reset`。

建议字段：

```json
{
  "project": "openspec-superpowers-opencode",
  "installedAt": "...",
  "language": "en",
  "opencodeVersion": "...",
  "superpowersPath": "...",
  "verification": "passed",
  "files": [],
  "overwriteDecisions": {}
}
```

新 manifest 内相对路径统一使用 `/`。读取旧 manifest 时同时接受 `/` 和 `\`，规范化后再执行根目录约束检查。

## Workflow 验证

验证继续覆盖：

1. `openspec schema validate superpowers-bridge-opencode`
2. project 源模板数量
3. 创建测试 change
4. change list 可见性
5. artifact 依赖链
6. brainstorm instructions 生成

测试 change 使用 `oso-verify-<pid>-<random>` 格式。验证代码记录 change 是否由本次执行成功创建；清理位于 `finally`，且只有在创建成功时执行。这样后续验证失败仍会清理临时数据，也不会删除用户已有同名 change。

## 外部命令执行

业务模块不得构造完整 shell 命令字符串。调用接口统一为：

```js
runner.run('openspec', ['schema', 'validate', 'superpowers-bridge-opencode'], {
  cwd: targetDir
});
```

`process-runner.js` 负责 stdout/stderr、退出状态、超时和 Windows npm `.cmd` shim 适配。普通可执行文件使用 Node 的程序名加参数数组。Windows 必须使用 shell 的特殊情况仅允许存在于该模块，并且调用参数来自固定或已校验值。

## 错误处理与退出码

内部 API 返回结构化结果或抛出包含 `phase`、`command`、`target` 和 `cause` 的 setup 错误。CLI 负责转换为用户消息和退出码。

| 结果 | 退出码 |
|---|---:|
| init/reset/dry-run 成功 | 0 |
| 用户主动取消 | 0 |
| 参数、前置条件、部署或验证失败 | 1 |

部署或验证失败时不执行 Git commit。验证失败保留 manifest，并标记 `verification: failed`，以支持后续 reset 和诊断。

## 测试设计

### 单元测试

测试直接导入生产模块，覆盖：

- 绿地和棕地 plan 生成。
- 所有覆盖决策和无效环境变量处理。
- Superpowers 路径和 lock 选择。
- `opencode.json` 合并及 key 顺序。
- marker 创建、追加、替换、跳过和异常输入。
- manifest 路径兼容与根目录逃逸拒绝。
- workflow 输出解析和临时 change 清理条件。
- 语言选择及占位符替换。

现有复制 setup 逻辑的测试应改为导入 `lib/setup/*`，避免测试与生产实现再次漂移。

### 集成测试

在独立临时目录执行真实 setup API 或 CLI。通过注入 fake process runner 模拟 OpenSpec、OpenCode 和 Git，以确定性验证：

- `init -> dry-run -> reset` 生命周期。
- dirty Git 拒绝。
- 部署失败不提交 Git。
- 验证失败仍生成可用 manifest。
- 已有 `verify-deploy` change 不被修改。
- 包含空格、括号和 `&` 的目标目录。

### 平台与打包测试

GitHub Actions 在 Windows、Ubuntu 和 macOS 上验证 npm tarball：

- 包含完整 `lib/setup/`。
- 不再要求 `scripts/setup.ps1` 和 `scripts/setup.sh`。
- `oso init/reset/dry-run` 均可调用。
- `create-openspec-superpowers-opencode` 仍转发到 init。
- 删除 setup shell 文件的 CRLF 专项检查。

## 文档与发布迁移

- README、QUICKSTART、FEATURES、TESTING 和部署文档改为描述统一 JavaScript 实现。
- 删除直接运行 setup 脚本的说明。
- CI tarball 文件清单从两个 setup 脚本改为 `lib/setup/`。
- `.gitattributes` 中删除只为 setup shell 文件保留的换行约束。
- CHANGELOG 或发布说明明确：`oso init/reset/dry-run` 保持兼容，直接脚本调用被移除。

## 验收标准

- `bin/cli.js` 不再根据 OS 选择 setup 脚本，也不使用 `runSetupScript()`。
- 仓库和 npm tarball 中不再包含 `scripts/setup.ps1`、`scripts/setup.sh`。
- Windows、Linux、macOS 执行相同的 JavaScript setup 模块。
- `oso init/reset/dry-run` 和 create-project 别名保持可用。
- 绿地、棕地、三种语言、环境变量覆盖、manifest 和 reset 行为通过自动化测试。
- dry-run 生成与 init 相同来源的操作计划且不写项目文件。
- 用户 changes/specs 和已有 `verify-deploy` change 不受验证或 reset 影响。
- 所有 setup 单元测试直接覆盖生产模块，不再复制脚本逻辑。
