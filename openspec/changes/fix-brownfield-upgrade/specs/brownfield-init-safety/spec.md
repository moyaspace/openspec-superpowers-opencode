## MODIFIED Requirements

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

棕地项目执行 `oso init` 时，系统 MUST 部署并刷新 `.opencode/commands/` 与 `.opencode/skills/` 中的全部模板文件。目标已存在同名文件时，系统 MUST 覆盖为当前模板渲染结果，MUST NOT 询问，MUST NOT 因任何既有决策或环境变量而跳过。系统 MUST NOT 删除模板中不存在、且 `.opencode/install-manifest.json` 的 `files` 未记录的用户自建文件。

#### Scenario: 棕地 + 无 commands 目录时完整部署

- **WHEN** 棕地项目不存在 `.opencode/commands/`，执行 `oso init`
- **THEN** init 完成后 `.opencode/commands/` 含模板中的全部命令文件

#### Scenario: 棕地 + 已有 13 个命令时刷新 10 个变更文件

- **WHEN** 目标已有 v1.1.1 版本的 13 个 `opsx-*.md`，用户执行 `oso init` 并回答 n
- **THEN** 当前版本相对 v1.1.1 变更的 10 个命令文件与模板渲染结果逐字一致
- **AND** 未变更的 3 个命令文件保持逐字一致

#### Scenario: 用户自建命令不被删除

- **WHEN** `.opencode/commands/` 中存在模板没有、manifest 未记录的用户自建命令
- **THEN** init 完成后该文件仍存在且内容不变

#### Scenario: 废弃的环境变量被忽略并提示

- **WHEN** 用户设置 `BROWN_OVERRIDE_COMMANDS=no` 或 `BROWN_OVERRIDE_SKILLS=no` 执行棕地 `oso init`
- **THEN** 系统忽略该变量并输出一行废弃说明
- **AND** commands / skills 仍被完整刷新

---

## ADDED Requirements

### Requirement: 棕地 MUST 无条件刷新 OSO 产品资产

棕地 `oso init` MUST 将以下路径视为 OSO 产品资产并无条件写入：`.opencode/commands/**`、`.opencode/skills/**`、`openspec/schemas/superpowers-bridge-opencode/**`。系统 MUST NOT 对这些路径发起 preserve 决策，MUST NOT 依赖目标文件是否存在来决定是否写入。系统 MUST 保持 `openspec/changes/**`、`openspec/specs/**`、`openspec/config.yaml`、`.opencode/opencode.json` 与受管根文件的既有语义不变。

#### Scenario: schemas 目录为空时产品资产全部落盘

- **WHEN** 棕地项目的 `openspec/schemas/superpowers-bridge-opencode/` 为空，用户执行 `oso init`
- **THEN** 该目录下 `lang` 过滤后的全部模板文件被写入
- **AND** `openspec/changes/**` 与 `openspec/specs/**` 不被创建或修改

#### Scenario: commands 与 skills 已存在时无条件覆盖

- **WHEN** `.opencode/commands/` 或 `.opencode/skills/` 已存在同名文件，用户执行 `oso init`
- **THEN** 这些文件被当前模板渲染结果覆盖
- **AND** 全程不出现针对 commands 或 skills 的询问

#### Scenario: 用户配置与用户数据不受产品资产刷新影响

- **WHEN** 棕地项目同时存在 `openspec/config.yaml`、`openspec/changes/` 与 `openspec/specs/`
- **THEN** `config.yaml` 仍按「存在则询问、答 n 保留」处理
- **AND** `openspec/changes/**` 与 `openspec/specs/**` 内容字节级不变

### Requirement: 升级 MUST 输出被更新的产品资产清单

当系统覆盖一个已存在的产品资产文件，且目标文件内容与模板渲染结果不同时，系统 MUST 在输出中列出「已更新：<相对路径>」。内容相同时 MUST NOT 输出该行。新建文件 MUST 沿用 `✓ <path>` 形式，MUST NOT 同时输出「已更新」。

#### Scenario: v1.1.1 升级恰好输出 10 条更新

- **WHEN** 目标为 v1.1.1 全套夹具，用户执行 `oso init` 并回答 n
- **THEN** 输出中恰好包含 10 条「已更新：」行，对应 10 个内容变更的命令文件
- **AND** 未变更的 3 个命令不产生「已更新」行

#### Scenario: 内容相同不输出

- **WHEN** 目标产品资产文件与模板渲染结果逐字相同
- **THEN** 输出中不出现该文件的「已更新」行

#### Scenario: 新建文件使用既有形式

- **WHEN** 目标产品资产文件不存在，init 将其写入
- **THEN** 输出 `✓ <relative-path>`，且不出现该文件的「已更新」行
