# init-shim-selfcheck Specification

## Purpose
本 capability 定义 `oso init` 启动时对 openspec 垫片的自检、自动修复，以及无写权限时中止并给出手动命令的行为。
## Requirements
### Requirement: init MUST 自检 openspec 垫片并自动修复

`oso init` MUST 在 0/8 前提检查之后自检 `openspec` 是否为垫片且 `openspec-orig` 存在。垫片未生效时 MUST 调用 `installShims` 自动修复。修复失败时 MUST NOT 中止 init：实现 MUST 记录 `shimSkipped`、失败原因（`shimResult.details`）与实际探测到的 `binDir`，打印 `warn`，继续执行 1/8 至 8/8。8/8 成功后 MUST 输出独立提示块，包含失败原因、实际 `binDir`、按平台与 `binDir` 可写性区分的可直接照抄命令，并说明装好后无需重跑 init。`shimSkipped` 时 init MUST 返回成功并以 exit 0 结束。程序 MUST NOT 尝试自动提权（不调用 sudo、不弹 UAC）。

#### Scenario: 垫片未装且有权限时自动修复并继续

- **WHEN** `openspec` 不是垫片或其 `openspec-orig` 缺失，进程有写 openspec bin 目录的权限，用户执行 `oso init`
- **THEN** init 调用 `installShims` 完成修复并继续执行到 8/8

#### Scenario: 垫片未装且无权限时跳过而不中止

- **WHEN** `installShims` 因 `EACCES` / `EPERM` 失败
- **THEN** init 不抛出错误、不中止，继续执行到 8/8
- **AND** init 以 exit 0 结束
- **AND** 输出包含 `warn` 级别的「垫片未安装，跨 worktree 合并不可用；其余功能不受影响」
- **AND** 结尾提示块包含失败原因、实际 `binDir` 与可直接照抄的命令
- **AND** 提示块说明装好后无需重跑 init

#### Scenario: Unix 提示按 binDir 可写性区分 sudo

- **WHEN** 在 Unix 上 `installShims` 因权限失败，且 `binDir` 不可写
- **THEN** 结尾提示块给出的命令含 `sudo oso install-shims` 形态
- **AND** 提示块说明 nvm / 用户级 prefix 用户无需 sudo

#### Scenario: Windows 提示含管理员与 gsudo 备选

- **WHEN** 在 Windows 上 `installShims` 因权限失败
- **THEN** 结尾提示块说明以管理员身份打开 PowerShell 后运行 `oso install-shims`
- **AND** 静态追加「若已装 gsudo，可用 `gsudo oso install-shims` 代替」
- **AND** 程序不检测 gsudo 是否存在

#### Scenario: 垫片已生效时不重装

- **WHEN** `openspec` 已是垫片且 `openspec-orig` 存在
- **THEN** init 不调用 `installShims`

#### Scenario: dry-run 只报告不修复

- **WHEN** 垫片未生效且用户以 dry-run 方式运行
- **THEN** 输出中报告垫片未生效
- **AND** 不调用 `installShims`，不写全局 bin

### Requirement: 垫片检测 MUST 复用既有判定函数

垫片自检 MUST 复用 `src/verify.ts` 的 `isShimScript` 与 `findOpenspecOrig`，MUST NOT 另写启发式判定。

#### Scenario: 检测结果与 verify 命令一致

- **WHEN** 同一环境下分别运行 `oso init` 的 0/8 自检与 `oso verify` 的垫片检查
- **THEN** 两者对「垫片是否生效」的判断一致

