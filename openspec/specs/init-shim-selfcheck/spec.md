# init-shim-selfcheck Specification

## Purpose
TBD - created by archiving change oso-v1-defect-backport. Update Purpose after archive.
## Requirements
### Requirement: init MUST 自检 openspec 垫片并自动修复

`oso init` MUST 在 0/8 前提检查之后自检 `openspec` 是否为垫片且 `openspec-orig` 存在。垫片未生效时 MUST 调用 `installShims` 自动修复；修复失败时 MUST 中止 init 并提示用户运行 `oso install-shims`（Windows 需管理员权限）。

#### Scenario: 垫片未装且有权限时自动修复并继续

- **WHEN** `openspec` 不是垫片或其 `openspec-orig` 缺失，进程有写全局 bin 的权限，用户执行 `oso init`
- **THEN** init 调用 `installShims` 完成修复并继续执行到 8/8

#### Scenario: 垫片未装且无权限时中止并给出命令

- **WHEN** `installShims` 失败（无写权限）
- **THEN** init 中止，错误信息包含 `oso install-shims`

#### Scenario: 垫片已生效时不重装

- **WHEN** `openspec` 已是垫片且 `openspec-orig` 存在
- **THEN** init 不调用 `installShims`

#### Scenario: dry-run 只报告不修复

- **WHEN** 垫片未生效且用户以 dry-run 方式运行
- **THEN** 输出中报告垫片未生效
- **AND** 不写全局 bin

### Requirement: 垫片检测 MUST 复用既有判定函数

垫片自检 MUST 复用 `src/verify.ts` 的 `isShimScript` 与 `findOpenspecOrig`，MUST NOT 另写启发式判定。

#### Scenario: 检测结果与 verify 命令一致

- **WHEN** 同一环境下分别运行 `oso init` 的 0/8 自检与 `oso verify` 的垫片检查
- **THEN** 两者对「垫片是否生效」的判断一致

