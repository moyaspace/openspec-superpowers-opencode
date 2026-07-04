# Worktree 活跃变更注册表

## 问题

本项目采用全 worktree 隔离的开发模式：所有变更工作在 `.worktrees/<name>/` 中完成，
`main` 分支仅包含已合并的完成工作。

但 OpenSpec 原生通过 `openspec list` 扫描 `openspec/changes/` 目录来列出活跃变更。
当变更目录只存在于 worktree 中时，`main` 分支无法感知这些活跃变更的存在。

```
openspec list（在 main 上执行）
  → 扫描 openspec/changes/         ← 这里只有归档的变更
  → 看不到 .worktrees/<name>/ 里的活跃变更
```

## 目标

- 所有变更工作都在 worktree 中完成，每个 worktree 完全隔离
- `openspec list` 在 main 上能看到所有 worktree 中的活跃变更
- 不改变现有 skill 和斜杠命令中使用的 `openspec` 命令名

## 方案：重命名原版 openspec + 包装脚本 + 注册表

### 架构

```
选择 A：重命名原版 openspec，包装脚本同名顶替

安装时：
  1. 找到原版 openspec CLI（npm 全局安装位置）
  2. 重命名为 openspec-orig
  3. 放入包装脚本（同名 openspec）

运行时：
  openspec list → 包装脚本拦截 → 合并注册表 + worktree 状态
  openspec xxx  → 包装脚本透传 → openspec-orig xxx
```

### 注册表文件

路径：`openspec/changes.json`

```json
{
  "changes": [
    {
      "name": "demo2",
      "worktree": ".worktrees/demo2",
      "status": "proposed",
      "createdAt": "2026-07-04T00:00:00.000Z"
    }
  ]
}
```

### npm 全局安装文件处理

`@fission-ai/openspec` 通过 npm 全局安装后，在每个平台生成特定的入口文件：

| 平台          | 安装生成文件                              | 重命名为                  | 新生成包装脚本      |
| ------------- | ---------------------------------------- | ------------------------- | ------------------- |
| Windows CMD   | `openspec` + `openspec.cmd`              | `openspec-orig.cmd`       | `openspec.cmd`      |
| Windows PS    | 同上，部分版本额外 `openspec.ps1`        | `openspec-orig.ps1`       | `openspec.ps1`      |
| macOS / Linux | `openspec`（Node.js 脚本，无后缀）        | `openspec-orig`           | `openspec`          |

重命名步骤（安装程序中执行）：
1. 检测原版 `openspec` 所在目录（`npm root -g` 的上级 `bin/` 目录）
2. 将该目录下的 `openspec`、`openspec.cmd`、`openspec.ps1` 全部重命名为 `openspec-orig.*`
3. 写入对应平台的包装脚本（同名）
4. 脚本通过 `chmod +x` 设置为可执行

这样无论系统从哪个入口（CMD、PowerShell、bash）解析 `openspec` 命令，都确保走包装脚本。

### 包装脚本逻辑（伪代码）

包装脚本位于 PATH 中，必须能从任意子目录定位到项目根目录。
采用**向上查找**策略：从当前目录逐级向父目录搜索，找到 `openspec/changes.json` 即视为项目根。

每份包装脚本首行包含特征标记，供 `registry verify` 检测包装完整性：

| 平台 | 标记行 |
|------|--------|
| Unix shell | `# openspec wrapper for oso registry` |
| Windows CMD | `@rem openspec wrapper for oso registry` |
| Windows PS | `# openspec wrapper for oso registry` |

```
# openspec wrapper for oso registry      # ← 检测标记

function findProjectRoot(dir) {
  while (dir !== parent(dir)) {
    if (exists(dir + "/openspec/changes.json")) return dir
    dir = parent(dir)
  }
  return null  // 不在项目中
}

function main(args) {
  root = findProjectRoot(process.cwd())

  if (args[0] === "list" && root) {
    // 读注册表
    registry = readJSON(root + "/openspec/changes.json")
    // 遍历每个 worktree 读 tasks.md 获取实时状态
    for each change in registry {
      tasksPath = root + "/" + change.worktree
                  + "/openspec/changes/" + change.name + "/tasks.md"
      status = parseTasksStatus(tasksPath)
    }
    // 输出合并后的列表
    printRegistry(registry)
  } else if (!root) {
    // 不在项目中，直接透传
    exec("openspec-orig " + args.join(" "))
  } else {
    // 在项目中但非 list 命令，也透传
    exec("openspec-orig " + args.join(" "))
  }
}
```

## 注册表生命周期

### 创建时机

| 命令                  | 事件         | 操作                                                                          |
| --------------------- | ------------ | ----------------------------------------------------------------------------- |
| `/opsx-new`           | 创建新变更   | `openspec-superpowers-opencode registry add <name> created .worktrees/<name>`  |
| `/opsx-propose`       | 创建新变更   | `openspec-superpowers-opencode registry add <name> proposed .worktrees/<name>` |
| `/opsx-ff` | 快速创建变更（scaffold 后） | `openspec-superpowers-opencode registry add <name> created .worktrees/<name>` |
| `/opsx-continue` | 继续创建变更（创建 artifact 前） | `openspec-superpowers-opencode registry update-status <name> in-progress` |
| `/opsx-apply`         | 开始实现     | `openspec-superpowers-opencode registry update-status <name> implementing`     |
| `/opsx-apply`（完成） | 实现完成     | `openspec-superpowers-opencode registry update-status <name> implemented`      |

### 删除时机

| 命令                   | 事件         | 操作                                                        |
| ---------------------- | ------------ | ----------------------------------------------------------- |
| `/opsx-finish`         | 归档 + cleanup | `openspec-superpowers-opencode registry remove <name>`    |
| （未来）`/opsx-cancel` | 放弃变更     | `openspec-superpowers-opencode registry remove <name>` + 清理 worktree |

**`/opsx-finish` 是唯一的正常删除点。** 其流程：

```
/opsx-finish demo2
  → Step 1: 验证测试（worktree 内）
  → Step 2: 产出 retrospective
  → Step 3: openspec archive -y          ← 归档变更
  → Step 3.5: openspec-superpowers-opencode registry remove demo2 ← 从注册表删除
  → Step 4-5: 合并/推PR/保留/丢弃        ← 清理 worktree
```

归档后的变更移入 `openspec/changes/archive/`，不再属于活跃变更。

### 状态流转

```
created  →  in-progress  →  implementing  →  implemented  →  done（finish 后删除）
proposed ↗                  ↘  abandoned → （删除）
```

`done` 是概念上的终端状态，**不写注册表**——finish 直接 remove 条目。

## 需要修改的命令入口

以下命令在创建或操作变更时，需要同步更新注册表：

- `/opsx-new`           — add
- `/opsx-propose`       — add
- `/opsx-ff`            — add
- `/opsx-continue`      — update-status
- `/opsx-apply`         — update-status（开始 `implementing`，完成 `implemented`）
- `/opsx-finish`        — remove（归档后执行）

修改方式：在对应步骤通过 CLI 子命令调用：

```bash
openspec-superpowers-opencode registry add <name> <status> <worktree>
openspec-superpowers-opencode registry update-status <name> <status>
openspec-superpowers-opencode registry remove <name>
```

## 重要设计决策：所有 registry 命令不做终端交互式提示

registry 命令（`add`、`remove`、`update-status`、`list`、`verify`）设计为被 **AI agent 调用**（ opsx 命令中的步骤），而非用户直接运行。因此：

- **不做** `readline`/`promptYesNo` 之类的终端交互
- 输出**结构化文本报告** + 通过 **exit code**（0=正常，非0=有问题）指示结果
- AI agent 读取输出后，**自行决定**是否向用户提问、如何提问
- 例如 `registry add` 触发 verify 发现问题：CLI 输出错误信息 + exit 1 → AI agent 看到后向用户展示问题并询问"是否修复？" → 用户同意 → AI agent 执行 `--repair`

> **这条规则在 T3 设计中有误，已于实现阶段纠正。** 原设计包含 `promptYesNo` 交互函数，但 registry 命令是在 opsx 命令中被 AI 调用的，终端的交互提示永远无法被 AI 看到。纠正后改为纯 exit code 模式。

## 注册表管理脚本

路径：`<tool-install-dir>/scripts/registry.js`（工具安装目录内）

所有注册表操作集中在这个脚本中，通过 `openspec-superpowers-opencode` CLI 的子命令方式调用：

```bash
openspec-superpowers-opencode registry add <name> <status> <worktree>
openspec-superpowers-opencode registry remove <name>
openspec-superpowers-opencode registry update-status <name> <status>
openspec-superpowers-opencode registry list
openspec-superpowers-opencode registry verify
```

`bin/cli.js` 收到 `registry` 子命令后，通过 `findProjectRoot(process.cwd())` 定位项目根目录，然后操作项目根下的 `openspec/changes.json`。

只读操作（如包装脚本中的 `openspec list` 合并）直接读取 `changes.json`，不走 CLI 子命令。

## 安装程序

本方案由独立安装程序负责部署，不依赖 npm postinstall。

### 首次安装

为规避文件锁（正在执行的脚本无法被移动/删除），采用 **copy + write** 策略：

1. 找到原版 `openspec` CLI（`which openspec` / `where openspec` 路径的所在目录）
2. **复制**原版文件为 `openspec-orig`（同名映射：`openspec` → `openspec-orig`、`openspec.cmd` → `openspec-orig.cmd`、`openspec.ps1` → `openspec-orig.ps1`）
3. 在同目录写入包装脚本（同名 `openspec` / `openspec.cmd` / `openspec.ps1`）
4. 设置可执行权限（Unix `chmod +x`）

安装程序不碰项目级别的任何文件。

### 重新安装 / `--repair` 模式

`openspec-orig` 已存在时跳过复制步骤，直接覆盖写入包装脚本（幂等）。用于：

- 安装后重新执行
- npm update 后恢复包装脚本（`node <tool-dir>/scripts/installer.js --repair`）

`--repair` 模式下如果 `openspec-orig` 不存在则报错退出，避免新环境误用。

## 项目初始化

```json
// openspec/changes.json（首次提交）
{ "changes": [] }
```

后续所有注册表操作只改内容，不删除文件。即使注册表清空也保留 `{"changes":[]}`，确保包装脚本的 `findProjectRoot` 始终能找到项目根。

对应的入口文件对应关系：

| 平台          | 包装脚本       | 原版重命名          |
| ------------- | -------------- | ------------------- |
| Windows CMD   | `openspec.cmd` | `openspec-orig.cmd` |
| Windows PS    | `openspec.ps1` | `openspec-orig.ps1` |
| macOS / Linux | `openspec`     | `openspec-orig`     |

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| `changes.json` 格式损坏（非合法 JSON） | 包装脚本 catch 解析异常，打印 `⚠ registry corrupted, falling back to native list`，退化为调用 `openspec-orig list` |
| `changes.json` 文件不存在 | 视为无注册表条目，不拦截，透传 `openspec-orig list`（等价于原生行为） |
| worktree 目录已被手动删除 | 遍历注册表时检测目录是否存在，不存在的打印 `⚠ <name>: worktree not found at <path>`，跳过该条目但保留注册表记录 |
| 更新/重装工具（`openspec-orig` 已存在） | 安装程序先检测 `openspec-orig` 是否存在，如已存在则跳过 copy，直接覆盖写入新版本包装脚本；`--repair` 模式要求 openspec-orig 必须已存在 |
| 包装脚本被 npm update 覆盖 | `registry verify` 检测到 `openspec` 无特征标记但 `openspec-orig` 存在 → 输出报告 + exit 1 → AI agent 读取后向用户展示问题并引导修复 |
| 注册表中同名变更已存在 | `registry.add()` 执行覆盖：用新条目替换旧条目（匹配键为 `name`） |
| 多项目同时使用 | 每项目各自有 `openspec/changes.json`，`findProjectRoot` 向上查找到最近的那个，互不干扰 |

## 跨平台注意事项

### `.gitignore`

```
.worktrees/
```

`openspec/changes.json` **不在** `.gitignore` 中，需要被追踪（它是项目元数据，每个开发者都需要看到同一份注册表）。

`openspec/changes/` 目录（归档变更）按 OpenSpec 原生规则管理。

### `openspec list` 输出格式

包装脚本的输出尽量模仿 OpenSpec 原生格式，让用户和工具无感知：

```
# 原生 openspec list 输出
Changes:
  demo     No tasks      27m ago

# 包装脚本输出 — worktree 条目末尾追加路径
Changes:
  demo     No tasks      27m ago
  demo2    Proposed      worktree      .worktrees/demo2
  demo3    Implementing  2/5 tasks     .worktrees/demo3

# 合并策略：
#   1. 先调用 openspec-orig list 获取原生列表
#   2. 读注册表，为每个 worktree 条目补充路径列
#   3. 去重（同名以注册表为准）
#   4. 合并排序输出
```

## 待实现

以下为工具目录（`openspec-superpowers-opencode`）中需要实现的内容：

### 1. `scripts/registry.js`

注册表读写逻辑，CommonJS，导出函数供 CLI 子命令调用：

- `read(path)` — 读 `openspec/changes.json`，文件不存在或损坏时返回空注册表
- `write(path, data)` — 写回文件，确保目录存在
- `add(path, name, status, worktree)` — 同名覆盖写入，设置 `createdAt`
- `remove(path, name)` — 删除条目，保留空文件（不 unlink）
- `updateStatus(path, name, status)` — 更新指定变更的状态
- `list(path)` — 格式化输出所有活跃变更

### 2. `bin/cli.js` 新增 `registry` 子命令

```bash
openspec-superpowers-opencode registry add <name> <status> <worktree>
openspec-superpowers-opencode registry remove <name>
openspec-superpowers-opencode registry update-status <name> <status>
openspec-superpowers-opencode registry list
openspec-superpowers-opencode registry verify
```

`cli.js` 处理逻辑：

1. `findProjectRoot(process.cwd())` 定位项目根
2. 加载 `<tool-install-dir>/scripts/registry.js`
3. 调用对应函数，传入项目根下的 `openspec/changes.json` 路径

`verify` 子操作额外检测包装完整性：

| 检查项 | 检测方式 | 由谁触发 |
|--------|----------|----------|
| `openspec-orig` 存在 | `which openspec` → dirname → 查 openspec-orig | verify / add |
| `openspec` 是否包装脚本 | 读取 openspec 文件首行，匹配特征标记 | verify / add |
| `changes.json` 有效 | `JSON.parse()` | verify / add |
| worktree 目录存在 | `fs.existsSync()` 逐条验证 | verify 仅 |

### `verify` 执行时机

| 场景 | 触发者 | 失败时行为 |
|------|--------|------------|
| 手动/诊断 | `openspec-superpowers-opencode registry verify` | 输出报告 + exit 1，不修改 |
| opsx 流程中（add 前） | opsx 命令先跑 `registry verify`，再跑 `registry add` | 输出报告 + exit 1 → AI agent 读取后决定是否询问用户修复 |
| opsx 流程中（list 前） | opsx 命令先跑 `registry verify`，再跑 `openspec list` | 同上 |

第三项"包装脚本内触发"的逻辑（注意：**包装脚本内不做交互式询问**，只输出结构化信息，AI agent 读取后决定下一步）：

```bash
# 在包装脚本中（被 AI 通过 shell 调用，非交互式终端）
if args[0] == "list" && findProjectRoot(cwd) != null:
    # 透传 openspec-orig list 获取原生列表
    native_list = exec("openspec-orig list")
    读 registry 补充 worktree 条目
    合并输出去重
    print(合并后的完整列表)
```

### 3. 安装程序：包装脚本

安装程序部署三类包装脚本（不在 postinstall 中，由独立安装程序处理）：

- `openspec` — Unix/macOS
- `openspec.cmd` — Windows CMD
- `openspec.ps1` — Windows PowerShell

包装脚本逻辑参考本文档"包装脚本逻辑（伪代码）"节：执行 `findProjectRoot` 向上查找，拦截 `openspec list` 合并注册表，其余透传 `openspec-orig`。

安装程序重新执行时：只覆盖包装脚本，`openspec/changes.json` 已存在则不动。

## 与其他设计文档的关联

- `AGENTS.md` — 定义了 worktree 开发规则，本方案是其基础设施补充
- OpenSpec 官方 `/opsx:*` 命令 — 本方案不修改其核心逻辑，仅在其入口处增加注册表同步步骤
