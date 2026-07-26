# 统一 Setup Scripts 设计（含棕地流程）

日期：2026-07-25
状态：已实施

## 背景

当前 `oso init`、`oso reset` 和 `oso dry-run` 由 `bin/cli.js` 根据操作系统选择并启动 `scripts/setup.ps1` 或 `scripts/setup.sh`。两套脚本各自实现约 1,100 行相同职责，包括前置检查、Superpowers 发现、模板部署、棕地合并、验证、manifest 生成和卸载。

这种结构已经产生行为漂移：

- Windows 与 Linux 对无效 `BROWN_OVERRIDE_*` 值的处理不同。
- Linux schema 验证失败后仍可能输出"验证通过"，Windows 会记录失败。
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

模块结构：

```
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

```
解析参数
  -> 解析并校验目标目录
  -> 目标不存在时创建目录
  -> Git dirty 检查（目录有 .git 时执行 git status --porcelain，非空则终止）
  -> 前置工具检查（openspec、opencode、git 版本）
  -> Superpowers 路径和版本发现
  -> 判断绿地或棕地
  -> 收集覆盖决策（仅棕地）
  -> 生成部署计划（planner）
  -> 执行计划（deployer：逐文件原子写入）
  -> 写入 manifest（verification=pending）
  -> schema/workflow 验证
  -> 更新 manifest 状态（passed/failed）
  -> 创建 registry（oso-change-registry.json）
  -> Git 初始化、暂存和首次提交（验证失败则不提交）
```

部署计划使用结构化操作，不存储拼接后的 shell 命令。例如：

```js
{ type: 'mkdir', path: 'openspec/specs' }
{ type: 'copy', source: '...', target: 'openspec/config.yaml' }
{ type: 'write', target: '.opencode/opencode.json', content: '...' }
```

在写入前必须完成目标路径检查、JSON 解析、marker 分析和合并内容计算。单个生成文件通过同目录临时文件写入后 rename，避免留下截断内容。

### 实际写入（原子性）

写入逻辑在 `lib/setup/deploy.js:21`：

1. 在写入任何文件前，先校验所有目标路径。
2. 拒绝项目目录外路径。
3. 拒绝经过符号链接或 Windows junction 的路径。
4. `preserve` 操作不做任何写入。
5. `copy`/`write` 先写同目录临时文件，再用 `rename` 原子替换目标文件。

这是逐文件原子写入，不是整个部署事务。如果后面的文件发生 I/O 错误，前面已经成功写入的文件不会自动回滚。

### 部署后流程

```
执行部署（逐文件）
→ 写 verification=pending 的 manifest
→ 执行 OpenSpec 完整验证（schema + workflow）
→ 更新 manifest 为 passed/failed
→ 验证成功后创建 registry（oso-change-registry.json）
→ git init（如需要）
→ git add
→ 有变更时自动 commit
```

验证失败不会回滚已经部署的文件，也不会创建 registry 或提交 Git。

## 棕地判断

判断代码在 `lib/setup/context.js:13`。

| 条件 | 判定 |
|------|------|
| 目录不存在 | greenfield |
| 目录存在但为空 | greenfield |
| 目录存在且有任意内容 | brownfield |

当前实现比较宽泛：不检查 Git，也不要求存在 `openspec/config.yaml`。因此只有一个 `.git/`、README 或任意隐藏文件，也会被判为棕地。

> **注意：** 即使非空目录里根本没有 `openspec/`，它仍被判为棕地，并要求允许覆盖 OpenSpec。选择 `no` 会导致整个 `openspec/` 不部署，后续验证通常会失败。

如果目录已有 `.git`，初始化前还会执行 `git status --porcelain`。工作区不干净则立即终止，不进入覆盖询问。

## 棕地决策

决策逻辑在 `lib/setup/index.js`（`collectBrownfieldDecisions` 和 `initProject` 两部分）。

首先询问：

```
BROWN_OVERRIDE_INIT
Brownfield project. Continue with full init?
```

不是 `yes` 就取消，不写文件。

继续后依次处理：

| 范围 | 环境变量 | 行为 |
|------|----------|------|
| 整个 `openspec/`（config + schemas） | `BROWN_OVERRIDE_OPENSPEC` | `yes` 部署并覆盖；否则全部跳过 |
| `.opencode/opencode.json` | `BROWN_OVERRIDE_OCODEJSON` | 文件存在时询问；`yes` 合并，否则保留 |
| `.opencode/commands/` | `BROWN_OVERRIDE_COMMANDS` | `yes`/`no`/`ask`，`ask` 时逐个冲突文件询问 |
| `.opencode/skills/` | `BROWN_OVERRIDE_SKILLS` | 同上 |
| `AGENTS.md` 托管区块 | `BROWN_OVERRIDE_AGENTS` | 已有完整 marker 时询问是否替换 |
| `.gitignore` 托管区块 | `BROWN_OVERRIDE_GITIGNORE` | 同上 |
| `.gitattributes` 托管区块 | `BROWN_OVERRIDE_GITATTR` | 同上 |
| `.editorconfig` 托管区块 | `BROWN_OVERRIDE_EDITORCONFIG` | 同上 |
| `oso-change-registry.json` | `BROWN_OVERRIDE_REGISTRY` | 存在时询问；默认 `no` 不做覆盖 |

没有环境变量且没有 prompt 时，默认决策是 `no`，见 `lib/setup/prompt.js:20`。

所有 `BROWN_OVERRIDE_*` 值由 `prompt.js` 统一规范化。支持 `yes`、`no`，commands/skills 额外支持 `ask`；无效值回退到交互询问，不把原始无效值当成决策。

## 文件部署规则（棕地）

计划生成在 `lib/setup/planner.js:52`。

- `skills.lock.json`：棕地也会直接覆盖，没有单独询问。
- `openspec/**`（config.yaml + schemas/）：只有 `BROWN_OVERRIDE_OPENSPEC=yes` 才部署；否则全部跳过。
  - 棕地下 `openspec/changes/**` 和 `openspec/specs/**` 永远 preserve（见 changes/specs 保护章节）。
  - schemas/ 复制时按语言过滤（见 "Schema 复制时的语言过滤"）。
- `.opencode/opencode.json`：
  - 原文件不存在：直接创建。
  - 原文件存在且选择 `no`：保留。
  - 选择 `yes`：结构化合并（见 `opencode.json` 合并节）。
- `.opencode/commands/**` 和 `.opencode/skills/**`：
  - 只对已经存在的同名文件应用覆盖决策（`yes`/`no`/`ask`）。
  - 模板中新增、目标中不存在的文件会直接部署。
- 其他 `.opencode/**` 模板文件：没有独立棕地保护，存在时直接覆盖。
- `AGENTS.md`、`.gitignore`、`.gitattributes`、`.editorconfig`：
  - 文件不存在：创建。
  - 文件存在但没有 marker：自动追加托管区块，不询问。
  - 正好有一对 marker：`yes` 替换托管区块，`no` 保留。
  - marker 不完整或数量异常：抛错终止。

### 棕地下 `openspec/` 部署范围

棕地模式下 `deployOpenspec()` 只复制两个内容：
1. `openspec/config.yaml`
2. `openspec/schemas/`（按语言过滤）

不会复制其他 `openspec/` 子目录。`openspec/changes/` + `openspec/specs/` 显式跳过（受棕地保护），不受 `BROWN_OVERRIDE_OPENSPEC=yes` 影响。

### Schema 复制时的语言过滤

`openspec/schemas/` 目录中有按语言区分的 schema 文件（`.zh-CN.`、`.zh-TW.` 后缀）。
复制时按目标语言自动过滤：

- 文件包含 `.zh-CN.` → 仅 `--lang zh-CN` 时部署
- 文件包含 `.zh-TW.` → 仅 `--lang zh-TW` 时部署
- 其余文件 → 始终部署

该逻辑在 `planner.js:selectedLanguageFile()` 和 `index.js:deployOpenspec()` 的 langFilter 中实现，棕地和绿地均生效。

## opencode.json 合并

合并实现在 `lib/setup/merge.js:mergeOcodeJson()`。

必须：

- 保持模板 key 顺序。
- 在模板 key 后追加用户自定义 key。
- 空值回退到模板默认值，用户独有的空 key 不写入结果。
- 保留用户其他 permission 分组和自定义设置。
- **模板 `.opencode/opencode.json` 是 permission 的单一权威来源**：不再硬编码 `allow`/`deny` 覆写列表。
  - 原设计要求的"强制 required edit paths 为 allow / schema paths 为 deny"已在实现中移除。
  - 用户编辑配置文件即可调整权限，无需修改合并代码。

`AGENTS.md`、`.gitignore`、`.gitattributes` 和 `.editorconfig` 使用各自 marker 识别 bridge 管理区段：不存在目标时创建；目标存在但没有 marker 时追加；存在完整 marker 时根据决策替换或跳过。异常或不完整 marker 必须明确报错或走已定义的保守分支，不能静默截断用户文件。

核心合并逻辑：

```js
function mergeOcodeJson(userJson = {}, templateJson = {}) {
    const result = mergeKeys(templateJson, userJson);
    // ...逐层 mergeKeys，保持模板 key 顺序
    // 无硬编码 allow/deny 覆写
    return result;
}
```

## Dry-run 流程

`dry-run` 与 `init` 使用相同的检查、决策和 planner，但不调用 deployer，不运行会改变项目状态的验证命令，也不创建目标目录、registry 或 Git commit。目标目录不存在时，planner 将其视为一个虚拟的空目录来生成绿地安装计划；命令结束后目标目录必须仍然不存在。

输出应展示实际计划中的创建、覆盖、合并、跳过和保留操作。禁止在 planner 中以 `dryRun` 条件复制另一套部署逻辑。

dry-run 下 `collectBrownfieldDecisions()` 同样会被调用，确保棕地 dry-run 的决策收集与实际 init 一致。

## Reset 流程

`reset` 读取 `.opencode/install-manifest.json`，校验后生成删除计划，展示并确认，再执行删除。

安全规则：

- 拒绝绝对路径。
- 拒绝包含 `..` 的路径。
- 解析后的目标必须位于项目根目录内。
- 不跟随目录符号链接递归删除。
- 只删除 manifest 记录的可卸载文件。
- 仅在目录为空时删除父目录。
- 永远不删除 `openspec/changes/`、`openspec/specs/`、`AGENTS.md`、`.opencode/opencode.json`、`.gitignore`、`.gitattributes`、`.editorconfig`。
- 保持现有受保护文件语义：不自动回滚 `AGENTS.md`、`opencode.json`、`.gitignore`、`.gitattributes` 和 `.editorconfig` 中的合并内容，而是输出人工处理提示。

受保护文件列表在 `reset.js:PROTECTED_FILES` 和 `protectedManifestPath()` 中定义。

## changes/specs 保护

棕地下 `openspec/changes/**` 和 `openspec/specs/**` 永远 preserve，即使用户选择 `BROWN_OVERRIDE_OPENSPEC=yes`。

实现规则（`planner.js` 中在通用 `openspec/` 判断之前）：如果模板文件路径以 `openspec/changes/` 或 `openspec/specs/` 开头，则无论棕地决策如何都跳过。

| 场景 | 状态 |
|------|------|
| 棕地下现有 changes/specs 内容 | 保护，不受 `BROWN_OVERRIDE_OPENSPEC=yes` 影响 |
| 棕地下模板新增同名文件 | 保护，永远 preserve |
| Reset 执行 | 保护，不删除 |
| 绿地 | 创建空目录 |

## Superpowers 发现与 Skill Lock

使用 `os.homedir()`、`path.join()` 和 Node 目录遍历查找：

```
<home>/.cache/opencode/packages/superpowers@*/.../node_modules/superpowers/skills
```

不使用 `find`、PowerShell glob、`grep`、`sha256sum` 或 `Get-FileHash`。版本读取、JSON 解析和 SHA-256 校验分别使用 Node `JSON.parse` 和 `crypto`。

根据 Superpowers 主版本选择 `skills.lock.v<major>.json`；不存在时按确定性排序选择 fallback，并将选中的内容部署为项目根目录 `skills.lock.json`。hash 不匹配继续保持 warning，不阻塞 init。

## Manifest

manifest 在文件部署完成后、workflow 验证前写入。验证结束后更新状态，使失败安装仍能执行 `oso reset`。

字段：

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

验证覆盖：

1. `openspec schema validate superpowers-bridge-opencode`
2. `openspec templates --json`：解析 project 源模板数量（≥8）
3. `openspec new change <名称>`：创建测试 change
4. `openspec list --json`：验证 change 可见
5. `openspec status --change <名称> --json`：验证 artifact 依赖链完整
6. `openspec instructions brainstorm --change <名称>`：验证指令生成

测试 change 使用 `oso-verify-<pid>-<随机hex>` 格式（`verify.js:53`）。验证代码记录 change 是否由本次执行成功创建；清理位于 `finally`，且只有在创建成功时执行。这样后续验证失败仍会清理临时数据，也不会删除用户已有同名 change。

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
- 对不存在的目标目录执行 `dry-run` 后，目标目录仍不存在。
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
