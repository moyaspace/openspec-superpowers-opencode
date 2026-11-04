# shim-install-safety Specification

## Purpose
TBD - created by archiving change retire-install-hook. Update Purpose after archive.
## Requirements
### Requirement: 权限失败 MUST 给出可照抄的行动指引

`installShims` 捕获 `EACCES` / `EPERM` 时 MUST 在 `details` 中追加实际探测到的 `binDir` 与可直接复制执行的命令。非权限类失败（`openspec not found`、assets 缺失）MUST 保持原文案，MUST NOT 硬套提权提示。程序 MUST NOT 尝试自动提权。在 Ubuntu 系统 npm 环境下，输出中的命令 MUST 可直接复制执行，用户无需自行推断是否需要 sudo。

#### Scenario: Unix 权限失败给出 sudo 命令

- **WHEN** 在 Unix 系统 npm 环境（`binDir` 不可写）执行 `oso install-shims`
- **THEN** 输出包含实际 `binDir`
- **AND** 输出包含可复制执行的 `sudo oso install-shims` 形态命令

#### Scenario: 非权限失败不套用提权提示

- **WHEN** `openspec` 不在 PATH，导致 `installShims` 失败
- **THEN** `details` 保持 `openspec CLI not found in PATH` 类原文案
- **AND** 不出现 sudo / 管理员提权提示

### Requirement: 垫片脚本写入 MUST 原子替换

`installShimScripts` MUST 先写同目录临时文件，再用 `renameSync` 覆盖目标文件。POSIX 上 MUST 直接 rename；Windows 上 rename 覆盖已存在文件失败时 MUST 回退为「删除目标 + rename」。失败时 MUST 清理临时文件，MUST NOT 留下 `openspec.tmp-*` 残留。写入失败时原有的 `openspec` 文件 MUST 仍存在且内容不变。

#### Scenario: 写入失败不破坏原命令

- **WHEN** 人为让垫片写入阶段失败（例如临时目录只读）
- **THEN** 原有的 `openspec` 文件仍存在且内容不变
- **AND** 目录中没有 `openspec.tmp-*` 残留

#### Scenario: 正常安装仍替换成功

- **WHEN** 垫片写入成功
- **THEN** 目标位置是包含垫片内容的新文件
- **AND** 没有临时文件残留

### Requirement: 可执行权限失败 MUST NOT 静默成功

`setExecutable` MUST 收集 chmod 失败的文件名并加入 `details`。在 Unix 上，`openspec` 主入口 chmod 失败时，`installShims` MUST 返回 `success: false`；Windows 分支 MUST 直接返回且不受影响。

#### Scenario: Unix 主入口 chmod 失败判定为失败

- **WHEN** 在 Unix 上 `openspec` 主入口 chmod 失败
- **THEN** `installShims` 返回 `success: false`
- **AND** `details` 包含失败的文件名

#### Scenario: Windows 不执行 chmod

- **WHEN** 在 Windows 上安装垫片
- **THEN** `setExecutable` 直接返回
- **AND** 不因 chmod 产生失败

