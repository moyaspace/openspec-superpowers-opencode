## ADDED Requirements

### Requirement: 帮助与报错 MUST 使用 oso 短命令

`oso --help`（中文与英文）中的每一条命令示例 MUST 以 `oso` 开头。各子命令的用法报错（`ensure-worktree` / `remove-worktree` / `registry` / 未知子命令）与 `oso verify` 的 `fix` 提示 MUST 使用 `oso ...`。`create-openspec-superpowers-opencode` 作为精确匹配时 MUST 被排除，不得计为长名残留。

#### Scenario: 中英 help 不含长命令

- **WHEN** 分别执行 `oso --help` 与 `oso --help --lang zh-CN`
- **THEN** 输出中 `openspec-superpowers-opencode` 的精确匹配次数为 0
- **AND** `create-openspec-superpowers-opencode` 不计入该次数

#### Scenario: 用法报错使用短命令

- **WHEN** 执行 `oso ensure-worktree`、`oso remove-worktree`、`oso registry` 或 `oso __no_such__`
- **THEN** 输出不含 `openspec-superpowers-opencode`

#### Scenario: verify 的 fix 提示使用短命令

- **WHEN** `oso verify` 报告需要修复的检查项
- **THEN** 每条 `fix` 提示使用 `oso ...` 形式

### Requirement: create-project 别名帮助 MUST 保留自身名字

`create-openspec-superpowers-opencode --help` 的用法行 MUST 保留 `create-openspec-superpowers-opencode <target-dir>`。「等同于 / Equivalent to」一行 MUST 显示 `oso init <target-dir>`。

#### Scenario: 别名帮助的用法与等同于行

- **WHEN** 执行 `create-openspec-superpowers-opencode --help`
- **THEN** 用法行使用 `create-openspec-superpowers-opencode`
- **AND** 「等同于 / Equivalent to」行使用 `oso init <target-dir>`

### Requirement: 子命令 --help MUST 在副作用前短路

`oso <subcommand> --help` MUST 打印该子命令说明并以 exit 0 结束，MUST NOT 执行任何动作。至少 MUST 覆盖 `install-shims`（含权限说明），并 SHOULD 覆盖 `init` / `reset` / `dry-run` / `ensure-worktree` / `registry` / `verify` / `install-shims` / `uninstall-shims` / `remove-worktree`。短路 MUST 发生在 `runInstallShims()` 等任何写操作之前。

#### Scenario: install-shims --help 无副作用

- **WHEN** 在隔离 bin 目录执行 `oso install-shims --help`
- **THEN** 命令打印说明并以 exit 0 结束
- **AND** 隔离 bin 目录内容前后完全一致

#### Scenario: registry --help 无副作用

- **WHEN** 执行 `oso registry --help`
- **THEN** 命令打印说明并以 exit 0 结束
- **AND** 不修改注册表或工作区内容

### Requirement: 标识符与长命令解析 MUST NOT 改变

`src/setup/manifest.ts` 的 `project: 'openspec-superpowers-opencode'`、`src/setup/planner.ts` 的四个 marker 注释、`src/setup/reset.ts` 的项目名校验 MUST 保持原值。`openspec-superpowers-opencode` 长命令的解析路径 MUST NOT 改变，`openspec-superpowers-opencode --version` MUST 与 `oso --version` 输出版本号一致且退出码为 0。已部署项目的 `.opencode/install-manifest.json` 的 `project` 字段 MUST 仍为 `openspec-superpowers-opencode`。

#### Scenario: 标识符文件无改动

- **WHEN** 检查本 change 的 diff
- **THEN** `src/setup/manifest.ts`、`src/setup/planner.ts`、`src/setup/reset.ts` 无任何改动

#### Scenario: 长命令仍然可用

- **WHEN** 执行 `openspec-superpowers-opencode --version`
- **THEN** 输出与 `oso --version` 一致的版本号
- **AND** 退出码为 0

#### Scenario: 已部署夹具的 manifest 项目名不变

- **WHEN** 对已部署夹具执行 `oso init` 后读取 `.opencode/install-manifest.json`
- **THEN** 其 `project` 字段仍为 `openspec-superpowers-opencode`
