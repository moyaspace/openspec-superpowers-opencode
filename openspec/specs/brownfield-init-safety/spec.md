# brownfield-init-safety Specification

## Purpose
本 capability 定义 `oso init` 在棕地项目上的安全边界：受管根文件保留用户原有内容、OSO 产品资产默认刷新、`BROWN_OVERRIDE_*` 三档开关语义不变，以及升级时输出被更新文件的可见性。
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

系统 MUST 仅在 `openspec/config.yaml` 已存在时询问是否覆盖该用户配置文件。`openspec/schemas/` 属于 OSO 产品资产，系统 MUST 无条件部署或覆盖其中的全部模板文件，MUST NOT 因该询问的答案而跳过。目标不存在 `openspec/config.yaml` 时，系统 MUST NOT 询问 openspec 覆盖，并 MUST 直接部署 config 与 schemas。

#### Scenario: 棕地 + config.yaml 存在 + 回答 n 时 config 不变但 schemas 补齐

- **WHEN** 棕地项目的 `openspec/config.yaml` 已存在，`openspec/schemas/superpowers-bridge-opencode/` 为空，用户执行 `oso init` 并回答 n
- **THEN** `openspec/config.yaml` 字节级不变
- **AND** `openspec/schemas/superpowers-bridge-opencode/` 下 `lang` 过滤后的 10 个模板文件全部落盘
- **AND** 7/8 的 `openspec schema validate superpowers-bridge-opencode` 通过，exit 0

#### Scenario: 棕地 + schemas 非空但无 config.yaml 时不询问且覆盖

- **WHEN** `openspec/schemas/` 非空而 `openspec/config.yaml` 不存在，用户执行 `oso init`
- **THEN** 全程不出现「覆盖 openspec」询问
- **AND** `openspec/schemas/` 中的文件被当前模板覆盖

#### Scenario: 棕地 + openspec 不存在时不询问

- **WHEN** 棕地项目的 `openspec/` 不存在或不含 config.yaml 且 schemas 为空，用户执行 `oso init`
- **THEN** 全程不出现任何「覆盖 openspec」询问
- **AND** `openspec/config.yaml` 与 `openspec/schemas/` 被部署

#### Scenario: 绿地不出现棕地询问

- **WHEN** 目标目录为空（绿地）
- **THEN** 不出现任何棕地专属询问

### Requirement: 棕地首次 init MUST 部署全部命令

棕地项目执行 `oso init` 时，系统 MUST 部署并刷新 `.opencode/commands/` 与 `.opencode/skills/` 中的全部模板文件。默认（未设置覆盖开关）时，系统 MUST NOT 询问，MUST 将已存在的同名文件覆盖为当前模板渲染结果。系统 MUST 保留三档显式开关的原有语义：`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 为 `no` 时 MUST 保留目标文件不变；为 `yes` 时 MUST 覆盖；为 `ask` 时 MUST 逐文件询问并按答复决定。系统 MUST NOT 删除模板中不存在、且 `.opencode/install-manifest.json` 的 `files` 未记录的用户自建文件。

#### Scenario: 棕地 + 无 commands 目录时完整部署

- **WHEN** 棕地项目不存在 `.opencode/commands/`，执行 `oso init`
- **THEN** init 完成后 `.opencode/commands/` 含模板中的全部命令文件

#### Scenario: 棕地 + 已有 13 个命令 + 未设置开关时刷新 10 个变更文件

- **WHEN** 目标已有 v1.1.1 版本的 13 个 `opsx-*.md`，未设置 `BROWN_OVERRIDE_COMMANDS`，用户执行 `oso init`
- **THEN** 当前版本相对 v1.1.1 变更的 10 个命令文件与模板渲染结果逐字一致
- **AND** 未变更的 3 个命令文件保持逐字一致

#### Scenario: 显式设置 no 时保留目标文件

- **WHEN** 用户设置 `BROWN_OVERRIDE_COMMANDS=no` 执行棕地 `oso init`
- **THEN** 已存在的命令文件内容字节级不变

#### Scenario: 显式设置 ask 时逐文件询问

- **WHEN** 用户设置 `BROWN_OVERRIDE_COMMANDS=ask` 执行棕地 `oso init`，并对某文件回答 n
- **THEN** 该文件内容字节级不变
- **AND** 回答 y 的文件被模板覆盖

#### Scenario: 用户自建命令不被删除

- **WHEN** `.opencode/commands/` 中存在模板没有、manifest 未记录的用户自建命令
- **THEN** init 完成后该文件仍存在且内容不变

---

### Requirement: 棕地 MUST 默认刷新 OSO 产品资产

棕地 `oso init` MUST 将以下路径视为 OSO 产品资产并默认写入：`.opencode/commands/**`、`.opencode/skills/**`、`openspec/schemas/superpowers-bridge-opencode/**`。系统 MUST NOT 因「目标文件已存在」而对这些路径发起 preserve 决策，除非用户通过对应的 `BROWN_OVERRIDE_*` 开关显式指定 `no` 或 `ask`。系统 MUST 保持 `openspec/changes/**`、`openspec/specs/**`、`openspec/config.yaml`、`.opencode/opencode.json` 与受管根文件的既有语义不变。

#### Scenario: schemas 目录为空时产品资产全部落盘

- **WHEN** 棕地项目的 `openspec/schemas/superpowers-bridge-opencode/` 为空，用户执行 `oso init`
- **THEN** 该目录下 `lang` 过滤后的全部模板文件被写入
- **AND** `openspec/changes/**` 与 `openspec/specs/**` 不被创建或修改

#### Scenario: commands 与 skills 已存在且未设置开关时默认覆盖

- **WHEN** `.opencode/commands/` 或 `.opencode/skills/` 已存在同名文件，且未设置对应 `BROWN_OVERRIDE_*` 开关，用户执行 `oso init`
- **THEN** 这些文件被当前模板渲染结果覆盖
- **AND** 全程不出现针对 commands 或 skills 的询问

#### Scenario: 用户配置与用户数据不受产品资产刷新影响

- **WHEN** 棕地项目同时存在 `openspec/config.yaml`、`openspec/changes/` 与 `openspec/specs/`
- **THEN** `config.yaml` 仍按「存在则询问、答 n 保留」处理
- **AND** `openspec/changes/**` 与 `openspec/specs/**` 内容字节级不变

### Requirement: 升级 MUST 输出被更新的文件清单

当系统覆盖一个已存在的文件，且目标文件内容与模板渲染结果不同时，系统 MUST 在输出中列出「已更新：<相对路径>」，不区分文件产权类别。内容相同时 MUST NOT 输出该行。新建文件 MUST 沿用 `✓ <path>` 形式，MUST NOT 同时输出「已更新」。

#### Scenario: v1.1.1 升级恰好输出 10 条更新

- **WHEN** 目标为 v1.1.1 全套夹具（`config.yaml` 答 n、受管根文件内容一致、schemas 目录为空），用户执行 `oso init`
- **THEN** 输出中恰好包含 10 条「已更新：」行，对应 10 个内容变更的命令文件
- **AND** 未变更的 3 个命令不产生「已更新」行

#### Scenario: 内容相同不输出

- **WHEN** 目标文件与模板渲染结果逐字相同
- **THEN** 输出中不出现该文件的「已更新」行

#### Scenario: 新建文件使用既有形式

- **WHEN** 目标文件不存在，init 将其写入
- **THEN** 输出 `✓ <relative-path>`，且不出现该文件的「已更新」行

