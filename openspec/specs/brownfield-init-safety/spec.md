# brownfield-init-safety Specification

## Purpose
TBD - created by archiving change oso-v1-defect-backport. Update Purpose after archive.
## Requirements
### Requirement: 棕地受管根文件 MUST 保留用户原有内容

棕地项目执行 `oso init` 时，受管根文件（`.gitignore` / `.gitattributes` / `.editorconfig` / `AGENTS.md`）的部署 MUST 走 `createInitPlan` + `executeOperations` 的 merge 路径；文件无 OSO marker 时，用户原有内容 MUST 逐字保留，托管区块 MUST 追加在末尾。系统 MUST NOT 以整文件覆盖的方式写入受管根文件。

#### Scenario: 棕地 + 无 marker 时追加而非覆盖

- **WHEN** 棕地项目的 `.gitignore` 不含任何 OSO marker，用户执行 `oso init`
- **THEN** init 完成后用户原有的每一行仍逐字存在，托管区块出现在文件末尾
- **AND** `git diff` 中不出现任何用户原有行被删除

#### Scenario: 棕地 + 完整 marker + 回答 y 时只替换 marker 之间

- **WHEN** 受管根文件含完整 marker 对，用户在 init 时回答 y
- **THEN** 仅 marker 之间的内容被替换为渲染后的模板内容，marker 之外的内容字节级不变

#### Scenario: 棕地 + 完整 marker + 回答 n 时文件不变

- **WHEN** 受管根文件含完整 marker 对，用户回答 n
- **THEN** 该文件字节级不变

#### Scenario: 棕地 + 不完整 marker 时中止

- **WHEN** 受管根文件只含一个 marker（不完整）
- **THEN** init 中止并报错，该文件内容不变

#### Scenario: 每个受管根文件每次 init 最多写一次

- **WHEN** 任意一次 `oso init` 完成
- **THEN** 每个受管根文件在本次 init 内被写入的次数不超过 1

#### Scenario: 连续两次 init 幂等

- **WHEN** 对同一棕地项目连续执行两次 `oso init`
- **THEN** 第二次执行后文件内容与第一次逐字相同

### Requirement: 落盘文件 MUST 不含未渲染占位符

init 完成后，落盘的 `AGENTS.md`、`openspec/schemas/**/schema.yaml`、`.opencode/commands/opsx-apply.md`、`.opencode/commands/opsx-finish.md` 等模板产物 MUST NOT 含 `{{SUPERPOWERS_BASE_PATH}}`。步骤 6 的校验 MUST 读取**落盘文件**而非模板源。

#### Scenario: 棕地 init 后无占位符残留

- **WHEN** 棕地项目执行 `oso init` 并回答 y（触发受管区块替换）
- **THEN** `AGENTS.md`、`schema.yaml`、`opsx-apply.md`、`opsx-finish.md` 均不含 `{{SUPERPOWERS_BASE_PATH}}`

#### Scenario: 渲染故障时步骤 6 必须失败

- **WHEN** 注入故障使渲染返回原样模板（占位符未替换）
- **THEN** 步骤 6 校验失败并指出含占位符的文件名，init 返回失败

### Requirement: 仅在目标已有可覆盖内容时询问 openspec 覆盖

系统 MUST 仅在 `openspec/config.yaml` 存在或 `openspec/schemas/` 非空时询问是否覆盖 openspec 配置与 schema。目标无上述内容时 MUST 直接部署并打印说明，MUST NOT 询问。

#### Scenario: 棕地 + openspec 不存在时不询问

- **WHEN** 棕地项目的 `openspec/` 不存在或不含 config.yaml 且 schemas 为空，用户执行 `oso init`
- **THEN** 全程不出现任何「覆盖 openspec」询问
- **AND** `openspec/config.yaml` 与 `openspec/schemas/` 被部署

#### Scenario: 棕地 + config.yaml 存在 + 回答 n 时报文不变

- **WHEN** `openspec/config.yaml` 已存在，用户回答 n
- **THEN** 询问出现且该文件内容不变

#### Scenario: 棕地 + schemas 非空 + 回答 y 时覆盖

- **WHEN** `openspec/schemas/` 非空，用户回答 y
- **THEN** 询问出现且 schemas 被覆盖

#### Scenario: 绿地不出现棕地询问

- **WHEN** 目标目录为空（绿地）
- **THEN** 不出现任何棕地专属询问

### Requirement: 棕地首次 init MUST 部署全部命令

首次使用 OSO 的棕地项目（`.opencode/commands/` 不存在）执行 `oso init` 时，系统 MUST 部署模板中的全部命令文件并创建目录。目标已有 commands 且用户回答 n 时 MUST 保持不变。

#### Scenario: 棕地 + 无 commands 目录时完整部署

- **WHEN** 棕地项目不存在 `.opencode/commands/`，执行 `oso init`
- **THEN** init 完成后 `.opencode/commands/` 含模板中的全部命令文件

#### Scenario: 已有 commands + 回答 n 时不变

- **WHEN** `.opencode/commands/` 已存在，用户回答 n
- **THEN** 该目录内容不变

