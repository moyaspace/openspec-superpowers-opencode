# init-self-verification Specification

## Purpose
本 capability 定义 `oso init` 的 8/8 自检如何借助临时 change 与改动注册表验证 openspec 集成，并保证注册、失败与清理路径都不留下临时条目或目录。
## Requirements
### Requirement: 8/8 自检 MUST 将临时 change 写入注册表

`oso init` 的 8/8 自我验证 MUST 在创建临时验证 change 之后调用 `registry add <临时名> .`，并在 `finally` 中调用 `registry remove <临时名>` 且删除临时 change 目录。注册表的创建 MUST 早于 8/8 执行。

#### Scenario: 已初始化项目（注册表存在且为空）二次 init 通过

- **WHEN** 项目已 init 过一次，`openspec/oso-change-registry.json` 存在且为空，用户再次执行 `oso init`
- **THEN** 8/8 验证通过
- **AND** 结束后注册表不残留临时条目

#### Scenario: 首次 init（注册表不存在）

- **WHEN** 项目从未 init 过，注册表文件不存在
- **THEN** 注册表被创建，8/8 验证通过，结束后不残留临时条目

#### Scenario: registry add 失败时 8/8 失败并指明步骤

- **WHEN** 注入故障使 `registry add` 失败
- **THEN** 8/8 验证失败，错误信息指明是注册步骤失败

#### Scenario: 8/8 中途失败时无残留

- **WHEN** 8/8 在创建 change 与注册之间失败
- **THEN** 结束后注册表无 `oso-verify-*` 残留
- **AND** 临时 change 目录已删除

### Requirement: 8/8 的 list 断言 MUST 走垫片拦截

`openspec list --json` 的可见性检查 MUST 走垫片拦截后的合并结果（注册表内容），MUST NOT 直连 `openspec-orig`。

#### Scenario: 临时 change 在 list 中可见

- **WHEN** 8/8 已注册临时 change
- **THEN** `openspec list --json` 的输出包含该临时 change

