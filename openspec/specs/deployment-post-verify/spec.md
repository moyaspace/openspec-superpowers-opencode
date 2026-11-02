# deployment-post-verify Specification

## Purpose
本 capability 定义 `oso init` 在返回成功前的部署后自检：模板命令文件必须全部落盘、CLI 入口必须可加载，且验证失败只报错、不回滚已部署文件。
## Requirements
### Requirement: init MUST 在成功返回前验证模板命令齐全

`initProject` 在返回成功之前 MUST 枚举 `template/.opencode/commands/` 下的每个 `.md` 文件，并逐一确认 `<targetDir>/.opencode/commands/<相对路径>` 存在。任一缺失时 MUST 打印具体缺失项并返回 `success: false`。

#### Scenario: 正常部署时通过

- **WHEN** 模板中的每个 `.md` 命令都已被部署到目标目录
- **THEN** 验证通过，init 返回成功

#### Scenario: 删除任一命令文件后 init 失败并指明文件名

- **WHEN** 用户在 init 后删除 `.opencode/commands/` 下的某个命令文件，并使之重新触发校验
- **THEN** init 返回失败
- **AND** 错误信息包含被删除文件的名称

### Requirement: init MUST 在成功返回前验证 CLI 入口可加载

`initProject` MUST 确认 `dist/cli/index.js` 存在且可被动态 `import()`。文件缺失或 import 失败时 MUST 打印原因并返回 `success: false`。检查目标 MUST 是 `dist/cli/index.js`，MUST NOT 使用 `V1 不存在的 dist/oso-core/index.js`。

#### Scenario: dist/cli/index.js 存在且可 import 时通过

- **WHEN** `dist/cli/index.js` 存在且 `import()` 成功
- **THEN** 该检查通过

#### Scenario: 删除 dist/cli/index.js 后 init 失败

- **WHEN** `dist/cli/index.js` 被删除
- **THEN** init 返回失败，错误信息指出 CLI 入口缺失或不可加载

### Requirement: 部署后验证失败 MUST NOT 触发回滚

验证失败时系统 MUST 只报错并返回失败，MUST NOT 回滚已部署的文件，MUST NOT 引入事务式回滚设施。

#### Scenario: 验证失败后已部署文件保持原样

- **WHEN** 部署后验证因缺命令文件而失败
- **THEN** 已成功部署的其他文件仍留在磁盘上，未被回滚

