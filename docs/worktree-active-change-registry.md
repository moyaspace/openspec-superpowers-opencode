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

路径：`openspec/oso-change-registry.json`

```json
{
  "changes": [
    {
      "name": "demo2",
      "worktree": ".worktrees/demo2",
      "createdAt": "2026-07-04T00:00:00.000Z"
    }
  ]
}
```

注册表只存两样东西：**变更名** 和 **worktree 路径**。不存状态——状态由 worktree 内的 `openspec list` 实时获取。

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

### 垫片脚本逻辑（伪代码）

垫片脚本位于 PATH 中，必须能从任意子目录定位到项目根目录。
采用 **git-based** 策略：执行 `git rev-parse --git-common-dir` 获取公共 git 目录，取其所在目录为项目根。这种方式在 main 或任意 worktree checkout 中都返回同一路径。

每份垫片脚本首行包含特征标记，供 `registry verify` 检测垫片完整性：

| 平台 | 标记行 |
|------|--------|
| Unix shell | `# openspec shim for oso registry` |
| Windows CMD | `@rem openspec shim for oso registry` |
| Windows PS | `# openspec shim for oso registry` |

```
# openspec shim for oso registry      # ← 检测标记

if (args[0] === "list" && TOOL_DIR is set) {
    # 全部委托给 registry-utils.js
    # registry-utils 内部通过 git 定位项目根、读取注册表、遍历 worktree 合并输出
    exec("node <TOOL_DIR>/lib/registry-utils.js list")
} else {
    # 非 list 命令或不在项目中 → 透传
    exec("openspec-orig " + args.join(" "))
}
```

## 拦截范围：哪些 openspec 命令需要拦截

垫片脚本只拦截 `list`，其余全部透传 `openspec-orig`。以下逐一审查每个命令，论证为什么这个边界是正确的。

### 全部 12 个 opsx 文件的 openspec 命令调用清单

| openspec 命令 | 被哪些 opsx 文件调用 | 调用位置 |
|---|---|---|
| `openspec list --json` | apply, explore, archive, bulk-archive, continue, sync, verify | **根目录**（选择变更前） |
| `openspec status --change <name> --json` | apply, ff, new, propose, continue, archive, bulk-archive, verify | **worktree 内** |
| `openspec new change <name>` | ff, new, propose, onboard | worktree 内 |
| `openspec instructions <id> ...` | apply, ff, new, propose, continue, verify, onboard, finish | worktree 内 |
| `openspec archive -y` | finish | 根目录（透传即正确） |
| `openspec --version` | onboard | 任意位置 |

可见：**`list` 是唯一在根目录执行、且需要跨 worktree 聚合的命令。**

### 逐命令决策

| 命令 | 拦截？ | 理由 |
|------|:----:|------|
| `list` | **✅ 是** | 根目录执行，需要合并所有 worktree 的变更状态。每个 worktree 内 `openspec-orig list` 只看到自己的变更，垫片脚本负责遍历所有 worktree 汇总。 |
| `status` | ❌ 否 | 所有 opsx 调用都在 worktree 内（cd 进去后再跑 `status --change <name>`），透传 `openspec-orig` 已能正确获取该变更的 artifact 状态。根目录跑 `status` 无 `--change` 时只报"未选择变更"，无害。 |
| `new change` | ❌ 否 | 在 worktree 内创建变更，不需要跨 worktree。 |
| `instructions` | ❌ 否 | 从 worktree 内的 artifact 生成模板，透传即正确。 |
| `archive` | ❌ 否 | 纯文件操作（移动目录到 archive/），透传即正确。根目录执行也无影响。 |
| `--version` / 其他 | ❌ 否 | 元操作，与 worktree 无关。 |

### 为什么不拦截更多？

**复杂度与收益不对等。** 拦截 `list` 以外命令会带来：

1. **需要解析非 list 的结构化输出** — `status` 输出是嵌套 JSON，合并策略不明确（取平均值？全量展示？）
2. **遍历所有 worktree 的成本** — 每个 `status --change` 只需查一个 worktree，垫片脚本却要遍历全部
3. **垫片脚本膨胀** — 从"轻量拦截+透传"变成半个 openspec 重实现，增加维护成本和 bug 面
4. **零实际收益** — opsx 工作流中所有非 list 命令都有 worktree context，透传已正确工作

**如果将来有新的 opsx 命令在根目录调用 `openspec status`，也是先加 registry add 调用确保 worktree 目录存在（这是轻量的索引查表操作），而非扩展垫片的拦截范围。**

### 状态来源对比

| 维度 | 旧设计（registry 存 status） | 新设计（registry 只存 worktree 路径） |
|------|---------------------------|--------------------------------------|
| 状态数据位置 | `oso-change-registry.json` 的 `status` 字段 | 各 worktree 内 `openspec list` 实时输出 |
| 状态更新方式 | opsx 执行 `update-status` 子命令 | 自动——worktree 内无论做什么改变，list 输出自动反映 |
| 状态时效性 | 可能过期（忘了 update 就 stale） | 永远是实时的 |
| 垫片逻辑 | 捏造条目行（`formatWorktreeEntry`） | 原样透传 worktree 的 list 输出行 |
| 合并方式 | 字符串拼接 + 去重（数据行由垫片生成） | 遍历 worktree + exec + 提取原行（数据行来自源） |
| `status` 字段维护成本 | 每个生命周期事件都要手动 update | 零 |

结论：**registry 降级为轻量索引，只回答一个问题——"活跃变更的 worktree 在哪？"。剩下的交给 openspec 自己的命令回答。**

## 注册表生命周期

### 创建时机

| 命令                  | 事件         | 操作                                                                          |
| --------------------- | ------------ | ----------------------------------------------------------------------------- |
| `/opsx-new`           | 创建新变更   | `openspec-superpowers-opencode registry add <name> .worktrees/<name>`          |
| `/opsx-propose`       | 创建新变更   | `openspec-superpowers-opencode registry add <name> .worktrees/<name>`          |
| `/opsx-ff` | 快速创建变更（scaffold 后） | `openspec-superpowers-opencode registry add <name> .worktrees/<name>` |
| `/opsx-finish`         | 归档 + cleanup | `openspec-superpowers-opencode registry remove <name>`                       |

#### 不拦截 update-status 的原因

注册表不追踪变更状态。状态由各 worktree 内 `openspec list` 实时汇报。
`/opsx-continue` 和 `/opsx-apply` 不再需要 registry update-status 步骤。

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

- `/opsx-new`       — add
- `/opsx-propose`   — add
- `/opsx-ff`        — add
- `/opsx-finish`    — remove（归档后执行）

修改方式：在对应步骤通过 CLI 子命令调用：

```bash
openspec-superpowers-opencode registry add <name> <worktree>
openspec-superpowers-opencode registry remove <name>
```

## 重要设计决策：所有 registry 命令不做终端交互式提示

registry 命令（`add`、`remove`、`list`、`verify`）设计为被 **AI agent 调用**（ opsx 命令中的步骤），而非用户直接运行。因此：

- **不做** `readline`/`promptYesNo` 之类的终端交互
- 输出**结构化文本报告** + 通过 **exit code**（0=正常，非0=有问题）指示结果
- AI agent 读取输出后，**自行决定**是否向用户提问、如何提问
- 例如 `registry add` 触发 verify 发现问题：CLI 输出错误信息 + exit 1 → AI agent 看到后向用户展示问题并询问"是否修复？" → 用户同意 → AI agent 执行 `--repair`

> **这条规则在 T3 设计中有误，已于实现阶段纠正。** 原设计包含 `promptYesNo` 交互函数，但 registry 命令是在 opsx 命令中被 AI 调用的，终端的交互提示永远无法被 AI 看到。纠正后改为纯 exit code 模式。

## 注册表管理脚本

路径：`<tool-install-dir>/scripts/registry.js`（工具安装目录内）

所有注册表操作集中在这个脚本中，通过 `openspec-superpowers-opencode` CLI 的子命令方式调用：

```bash
openspec-superpowers-opencode registry add <name> <worktree>
openspec-superpowers-opencode registry remove <name>
openspec-superpowers-opencode registry list
openspec-superpowers-opencode registry verify
```

`bin/cli.js` 收到 `registry` 子命令后，通过 `findProjectRoot(process.cwd())` 定位项目根目录，然后操作项目根下的 `openspec/oso-change-registry.json`。

只读操作（如垫片脚本中的 `openspec list` 合并）直接读取 `oso-change-registry.json`，不走 CLI 子命令。

## 安装程序

本方案由独立安装程序负责部署，不依赖 npm postinstall。

### 首次安装

为规避文件锁（正在执行的脚本无法被移动/删除），采用 **copy + write** 策略：

1. 找到原版 `openspec` CLI（`which openspec` / `where openspec` 路径的所在目录）
2. **复制**原版文件为 `openspec-orig`（同名映射：`openspec` → `openspec-orig`、`openspec.cmd` → `openspec-orig.cmd`、`openspec.ps1` → `openspec-orig.ps1`）
3. 在同目录写入垫片脚本（同名 `openspec` / `openspec.cmd` / `openspec.ps1`）
4. 设置可执行权限（Unix `chmod +x`）

安装程序不碰项目级别的任何文件。

### 重新安装 / `--repair` 模式

`openspec-orig` 已存在时跳过复制步骤，直接覆盖写入垫片脚本（幂等）。用于：

- 安装后重新执行
- npm update 后恢复垫片脚本（`node <tool-dir>/scripts/installer.js --repair`）

`--repair` 模式下如果 `openspec-orig` 不存在则报错退出，避免新环境误用。

## 项目初始化

```json
// openspec/oso-change-registry.json（首次提交）
{ "changes": [] }
```

后续所有注册表操作只改内容，不删除文件。即使注册表清空也保留 `{"changes":[]}`，确保垫片脚本的 `findProjectRoot` 始终能找到项目根。

对应的入口文件对应关系：

| 平台          | 垫片脚本       | 原版重命名          |
| ------------- | -------------- | ------------------- |
| Windows CMD   | `openspec.cmd` | `openspec-orig.cmd` |
| Windows PS    | `openspec.ps1` | `openspec-orig.ps1` |
| macOS / Linux | `openspec`     | `openspec-orig`     |

## 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| `oso-change-registry.json` 格式损坏（非合法 JSON） | `registry-utils.js` 中 `readRegistry()` 解析失败返回 `{changes:[]}`，退化为空列表输出。不降级透传——因为注册表损坏说明已安装垫片，应提示修复 |
| `oso-change-registry.json` 文件不存在 | **在项目内** → `registry-utils.js list` 检测文件不存在，调用 `execOpenspecOrig(['list'])` 透传原版（不是我们的项目） |
| | **在项目外** → `registry-utils.js list` 检测 `findProjectRoot` 返回 null，调用 `execOpenspecOrig(['list'])` 透传原版 |
| worktree 目录已被手动删除 | 遍历注册表时检测目录是否存在，不存在的打印 `⚠ <name>: worktree not found at <path>`，跳过该条目但保留注册表记录 |
| 更新/重装工具（`openspec-orig` 已存在） | 安装程序先检测 `openspec-orig` 是否存在，如已存在则跳过 copy，直接覆盖写入新版本垫片脚本；`--repair` 模式要求 openspec-orig 必须已存在 |
| 垫片脚本被 npm update 覆盖 | `registry verify` 检测到 `openspec` 无特征标记但 `openspec-orig` 存在 → 输出报告 + exit 1 → AI agent 读取后向用户展示问题并引导修复 |
| 注册表中同名变更已存在 | `registry.add()` 执行覆盖：用新条目替换旧条目（匹配键为 `name`） |
| 多项目同时使用 | 每项目各自有 `openspec/oso-change-registry.json`，`findProjectRoot` 向上查找到最近的那个，互不干扰 |

## 跨平台注意事项

### `.gitignore`

```
.worktrees/
```

`openspec/oso-change-registry.json` **不在** `.gitignore` 中，需要被追踪（它是项目元数据，每个开发者都需要看到同一份注册表）。

`openspec/changes/` 目录（归档变更）按 OpenSpec 原生规则管理。

### `openspec list` 输出格式

`openspec list` 采用**两阶段合并**策略：

- **Phase ①**：遍历 registry entries → 进入 worktree → 执行 `openspec-orig list` → 提取该变更的数据行（按 name 过滤），追加 worktree 路径后缀
- **Phase ②**：在项目根目录执行 `openspec-orig list` → 取出**不在 registry 中**的 change（无 worktree，直接存在项目根目录），标记为 `worktree: "."`

所有变更行的右边列统一通过 `padEnd(52)` 对齐：

```
# 合并过程示意：

# Phase ① — registry 中的 worktree 条目：
#   feature-login 在 .worktrees/feature-login/ 中
#   feature-search 在 .worktrees/feature-search/ 中

# Phase ② — 根目录 openspec-orig 提供的额外变更（不在 registry）：
#   root-only 直接存在于项目根目录的 openspec/changes/ 中

# 最终输出（统一 padEnd(52) 对齐右边列）：
Changes:
  feature-login    Proposal    2 tasks    5m ago              .worktrees/feature-login
  feature-search   Spec        1 task     2h ago              .worktrees/feature-search
  root-only        0 tasks     1d ago                          .

# 三种右边列标记：

# | 标记 | 含义 | 来源 |
# |------|------|------|
# | `.worktrees/<name>` | 变更在隔离的 worktree 中 | Phase ① |
# | `.`                 | 变更在项目根目录（无 worktree） | Phase ② |
# | `(no worktree)`     | registry 中配置了 worktree 但目录不存在或命令失败 | Phase ① 异常 |

# 每个变更的状态来自其 worktree（或根目录）的实时 openspec-orig 数据，
# 不是注册表里的缓存值。这就是 registry 不存 status 的原因。
```

> **关键设计**：垫片脚本**不重新格式化** openspec-orig list 的数据内容（name、status、tasks、time 等列），只做**统一列对齐 + 追加右边标记**。这意味着如果未来 openspec 更新了 list 的输出格式（追加列、改对齐等），垫片脚本自动适配——零维护。

### 非项目目录 / 无注册表行为

| 场景 | 行为 |
|------|------|
| 在项目内、有注册表、有 worktree | 遍历 worktree 合并输出（Phase ①）+ 扫描根目录 openspec-orig 取额外变更（Phase ②） |
| 在项目内、有注册表、但所有 worktree 目录被删 | Phase ① 输出 `(no worktree)` 标记 + Phase ② 输出根目录变更 |
| 在项目内、注册表存在但为空（`changes:[]`） | Phase ① 跳过，仅 Phase ②：从根目录 openspec-orig 取所有变更（标记为 `.`） |
| 在项目内、注册表为空 **且** 根目录 openspec-orig 也无变更 | Phase ① 跳过，Phase ② 无结果 → 输出 `No active changes found.` |
| 在项目内、注册表有条目但 worktree 全不可用 **且** 根目录也无变更 | Phase ① 全 `(no worktree)`，Phase ② 无结果 → 输出 `No active changes found.` |
| 在项目内、注册表不存在 | 透传 `openspec-orig list`（不是我们的项目，不走合并） |
| 在项目外 | 透传 `openspec-orig list`（原生行为） |
| 注册表 JSON 损坏 | `readRegistry()` 返回 `{changes:[]}` → 退化为 Phase ② 仅输出根目录变更（或 `No active changes found.`）。`registry verify` 可检测并提示修复 |

## 待实现

以下为工具目录（`openspec-superpowers-opencode`）中需要实现的内容：

### 1. `lib/registry.js`

注册表读写逻辑，CommonJS，导出函数供 CLI 子命令调用：

- `read(path)` — 读 `openspec/oso-change-registry.json`，文件不存在或损坏时返回空注册表
- `write(path, data)` — 写回文件，确保目录存在
- `add(path, name, worktree)` — 同名覆盖写入，设置 `createdAt`
- `remove(path, name)` — 删除条目，保留空文件（不 unlink）
- `list(path)` — 格式化输出所有活跃变更（条目名 + worktree 路径 + 创建时间）

### 2. `bin/cli.js` 新增 `registry` 子命令

```bash
openspec-superpowers-opencode registry add <name> <worktree>
openspec-superpowers-opencode registry remove <name>
openspec-superpowers-opencode registry list
openspec-superpowers-opencode registry verify
```

`cli.js` 处理逻辑：

1. `findProjectRoot(process.cwd())` 定位项目根
2. 加载 `<tool-install-dir>/lib/registry.js`
3. 调用对应函数，传入项目根下的 `openspec/oso-change-registry.json` 路径

`verify` 子操作额外检测垫片完整性：

| 检查项 | 检测方式 | 由谁触发 |
|--------|----------|----------|
| `openspec-orig` 存在 | `which openspec` → dirname → 查 openspec-orig | verify / add |
| `openspec` 是否垫片脚本 | 读取 openspec 文件首行，匹配特征标记 | verify / add |
| `oso-change-registry.json` 有效 | `JSON.parse()` | verify / add |
| worktree 目录存在 | `fs.existsSync()` 逐条验证 | verify 仅 |

### `verify` 执行时机

| 场景 | 触发者 | 失败时行为 |
|------|--------|------------|
| 手动/诊断 | `openspec-superpowers-opencode registry verify` | 输出报告 + exit 1，不修改 |
| opsx 流程中（add 前） | opsx 命令先跑 `registry verify`，再跑 `registry add` | 输出报告 + exit 1 → AI agent 读取后决定是否询问用户修复 |
| opsx 流程中（list 前） | opsx 命令先跑 `openspec-superpowers-opencode verify`，再跑 `openspec list` | 同上 |

第三项"垫片脚本内触发"的逻辑（注意：**垫片脚本内不做交互式询问**，只输出结构化信息，AI agent 读取后决定下一步）：

```python
# 垫片脚本伪代码（被 AI 通过 shell 调用）
if args[0] == "list":
    root = findProjectRoot(cwd)
    if root is None:
        exec("openspec-orig list")          # 不在项目 → 透传
    else:
        registry = readJSON(root + "/openspec/oso-change-registry.json")
        lines = []
        seen = set()
        COLUMN = 52

        # Phase ①: 遍历注册表条目，进入各 worktree 取 openspec-orig 详情
        for each change in registry.changes:
            name = change["name"]
            if name in seen: continue
            seen.add(name)
            wt = change.get("worktree")
            wt_path = root + "/" + wt if wt else None
            if not wt_path or not exists(wt_path):
                lines.append(padEnd("  " + name, COLUMN) + "  (no worktree)")
                continue
            output = exec("openspec-orig list", { cwd: wt_path })
            for each line in output:
                if line matches "^  \\S" and name in line:
                    lines.append(padEnd(line, COLUMN) + "  " + wt)
                    break
            else:
                lines.append(padEnd("  " + name, COLUMN) + "  (no worktree)")

        # Phase ②: 项目根目录 openspec-orig 取不在 registry 的变更
        try:
            root_output = exec("openspec-orig list", { cwd: root })
            for each line in root_output:
                if line matches "^  \\S":
                    m = extract_name(line)
                    if m and m not in seen:
                        seen.add(m)
                        lines.append(padEnd(line, COLUMN) + "  .")
        except:
            pass    # 根目录无 openspec-orig 也可接受

        if lines is empty:
            print("No active changes found.")
        else:
            print("Changes:\n" + join(lines))
else:
    exec("openspec-orig " + args.join(" "))  # 非 list → 透传
```

### 3. 安装程序：垫片脚本

安装程序部署三类垫片脚本（不在 postinstall 中，由独立安装程序处理）：

- `openspec` — Unix/macOS
- `openspec.cmd` — Windows CMD
- `openspec.ps1` — Windows PowerShell

垫片脚本逻辑参考本文档"垫片脚本逻辑（伪代码）"节：拦截 `openspec list` 后全部委托给 `registry-utils.js`，其余透传 `openspec-orig`。

安装程序重新执行时：只覆盖垫片脚本，`openspec/oso-change-registry.json` 已存在则不动。

## 与其他设计文档的关联

- `AGENTS.md` — 定义了 worktree 开发规则，本方案是其基础设施补充
- OpenSpec 官方 `/opsx:*` 命令 — 本方案不修改其核心逻辑，仅在其入口处增加注册表同步步骤

## 行为效果

`openspec list` 在各场景下的实际表现（列号说明：右边列统一从第 52 列开始，用 `padEnd` 对齐）：

**正常场景**：在项目目录（main 或任意 worktree）跑 `openspec list`，worktree 变更 + 根目录变更合并输出：

```
$ openspec list
Changes:
  feature-login      Proposal    2 tasks    5m ago              .worktrees/feature-login
  feature-search     Spec        1 task     2h ago              .worktrees/feature-search
  root-only          0 tasks     1d ago                          .
```

Phase ① 合并所有 worktree 中的活跃变更，Phase ② 补上根目录中的额外变更（标记为 `.`）。每个变更的状态从它自己的 worktree 或根目录实时获取。

**worktree 缺失**（registry 中有条目但 worktree 目录被删或命令失败）：

```
$ openspec list
Changes:
  feature-login      Proposal    2 tasks    5m ago              .worktrees/feature-login
  ghost                                                    (no worktree)
  root-only          0 tasks     1d ago                          .
```

`(no worktree)` 与正常 worktree 路径在同一列对齐，直观看出该条目有问题。根目录变更仍旧出现。

**无活跃变更**：

```
$ openspec list
No active changes found.
```

**无 registry 但有根目录变更**（注册表 `changes:[]`，根目录 openspec-orig 有变更）：

```
$ openspec list
Changes:
  legacy-change      Spec        5 tasks    2w ago               .
```

所有变更标记为 `.` 来源自根目录。

**在项目外**：透传原生 `openspec-orig list`，等价于没装垫片。

**非 list 命令**（如 `openspec status --change foo --json`）：全程透传，垫片不碰。

**JSON 损坏**：`readRegistry()` 返回 `{changes:[]}` → Phase ① 跳过，退化为 Phase ② 仅输出根目录变更。不崩溃。

**垫片未安装**：`openspec list` 走原版，只看到当前目录（main）的变更，看不到任何 worktree 里的变更。

**从 main 看 vs 从 worktree 看**：`git rev-parse --git-common-dir` 都返回 `project/.git` → 同一项目根 → 行为一致。

**性能**：每个 worktree 执行一次 `openspec-orig list`（约 100-200ms），3 个 worktree 约半秒。Phase ② 额外一次根目录 `openspec-orig list`（< 200ms）。注册表读取和 JSON 解析在 1ms 内。
