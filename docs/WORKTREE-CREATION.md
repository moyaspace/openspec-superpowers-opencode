# Worktree 创建保证机制

> 本文档记录了关于"如何确保每次变更都创建 git worktree"的讨论过程、
> 方案对比和最终实现。供后续维护者理解设计决策。

## 问题

当前 worktree 在 `schema.yaml apply.instruction` 的 Step 1 中创建，
通过 `using-git-worktrees` skill 由 agent 执行。这是**纯提示级约束**——
agent 可以选择跟随或不跟随。

实际运行中观察到：worktree 有时创建、有时不创建，完全取决于 agent
在运行 `/opsx-apply` 时是否自觉执行 apply.instruction 的全部步骤。

## 分析：worktree 创建位置全景

### 创建入口（执行 `git worktree add` 的位置）

| 文件 | 命令入口 | 性质 |
|------|---------|------|
| `template/.opencode/commands/opsx-ff.md` Step 3 | `/opsx-ff <name>` | 命令定义（提示级） |
| `template/.opencode/commands/opsx-new.md` Step 4 | `/opsx-new <name>` | 命令定义（提示级） |
| `template/.opencode/commands/opsx-propose.md` Step 3 | `/opsx-propose <描述>` | 命令定义（提示级） |
| `openspec/schemas/.../schema.yaml` apply.instruction Step 1（旧版） | schema apply 指令 | 提示级，已废弃 |

### 只检测不创建的位置

| 文件 | 行为 |
|------|------|
| `template/.opencode/commands/opsx-apply.md` Step 2 | 检测 → 存在则进入，不存在则 STOP |
| `template/.opencode/commands/opsx-continue.md` Step 2 | 同上 |
| `template/.opencode/commands/opsx-finish.md` Step 0 | 同上 |
| `template/openspec/schemas/.../schema.yaml` apply Step 1 | 同上（新版） |

### 问题根源

1. **双路径冲突**：命令文件（ff/new/propose）创建 worktree，schema.yaml
   apply.instruction Step 1 也能创建——谁先触发取决于 agent 导航策略。
2. **两版 schema.yaml 不一致**：项目根版本是"创建"（旧），template 版是"检测"（新）。
3. **纯提示层**：所有约束都是"agent 应该做"，没有"不做就卡死"的硬约束。
4. **`using-git-worktrees` skill 依赖**：旧版 schema.yaml 依赖 agent 正确
   Read 并执行 Superpowers skill，多一层解释偏差风险。

## 讨论过程

### 初始方案（Prompt 级约束）

| 方案 | 内容 | 强度 | 弱点 |
|------|------|------|------|
| **A** | 在 `openspec-ff-change` SKILL.md 中写死 worktree 步骤 | 中 | SKILL 是备用路径，正常流程不经过 |
| **B** | 用户先手动 `using-git-worktrees` 再进 ff | 弱 | 用户多操作一步，靠自觉 |
| **C** | 在 TASKS 模板中强制加入 worktree task | 中 | 污染 task 语义，apply 才执行（太晚） |

结论：A-C 全是提示级软约束，加到 100% 也到不了 100%。

### 100% 方案：系统级约束

核心思路：从"agent 应该做"转为"agent 做不到"。

| 层 | 机制 | 拦截什么 |
|----|------|---------|
| **权限系统** | `opencode.json` 设 `"*": "deny"` | agent 绕过 worktree 直接写代码 |
| **CLI 命令** | `ensure-worktree` 代码逻辑 + 退出码 | agent 跳过或不执行 `git worktree add` |
| **命令文件** | 所有 opsx-*.md 调用 `ensure-worktree` | agent 走命令入口时跳过 worktree 创建 |
| **schema 提示** | apply Step 1 "检测+STOP" | agent 直接读 schema instruction 时走错路 |

### 权限方案的取舍

`"*": "deny"` 虽然 100% 保证，但给用户带来额外负担：
- 用户想在 main 分支上直接改配置、修 typo、补文档时，需要先改权限
- 与 `template/README.md` 已有的"直通 PR"场景（不经过 change 流程）冲突
- 用户不易理解"为什么写不了文件"

**决定：放弃权限层，保留后三层。**

## 最终方案：三层代码级保证

### 防御性清理：分支残留

正常 OPSX 流程下 `feature/<name>` 分支和 worktree 生命周期一致，
不存在"有分支无 worktree"的状态——finish 会同时清理两者。

但 `ensure-worktree` 仍保留了一行静默清理，作为防御性措施：

```javascript
// 防御性清理：正常流程无残留，但用户手动操作后可分支/worktree 不同步
try {
    execSync(`git branch -D "${branch}"`, { cwd, stdio: 'ignore' });
} catch (_) {
    // 分支不存在时静默跳过
}
```

这样 `ensure-worktree` 在任何状态下都等价于
"从当前 HEAD 创建干净的新分支 + 新 worktree"，无副作用。

### 第 1 层：`bin/cli.js` — `ensure-worktree <name>` 子命令

代码逻辑，不依赖 agent 自觉执行：

```bash
openspec-superpowers-opencode ensure-worktree <name>
  → 检测 .worktrees/<name>/ 是否存在
  → 不存在 → git worktree add .worktrees/<name> -b feature/<name>
  → 已存在 → 跳过（幂等）
  → 任何失败 → process.exit(1)
```

由 OpenCode 的 bash 工具执行，退出码非 0 = 命令失败，agent 无法忽略。

### 第 2 层：6 个命令文件调用 `ensure-worktree`

所有 opsx-*.md 入口改为调用 CLI 命令而非裸 `git worktree`：

| 命令 | 改动 |
|------|------|
| `/opsx-ff` | Step 3: `git worktree add` → `ensure-worktree` |
| `/opsx-new` | Step 4: `git worktree add` → `ensure-worktree` |
| `/opsx-propose` | Step 3: `git worktree add` → `ensure-worktree` |
| `/opsx-apply` | Step 2: 检测+STOP → `ensure-worktree`（幂等创建） |
| `/opsx-continue` | Step 2: 检测+STOP → `ensure-worktree`（幂等创建） |
| `/opsx-finish` | Step 0: 检测+STOP → `ensure-worktree`（幂等创建） |

### 第 3 层：schema.yaml 统一为"检测+STOP"

项目根 `openspec/schemas/.../schema.yaml` 的 apply Step 1：
  - **旧**：Read using-git-worktrees skill → 创建 worktree
  - **新**：检测 `.worktrees/<name>/` → 存在则进入，不存在则 STOP

template 版 schema.yaml 已是最新版，无需改动。

## 文件变更清单

| 文件 | 改动 |
|------|------|
| `bin/cli.js` | 新增 `ensure-worktree` 子命令 + `runEnsureWorktree()` 函数 + help 文本 |
| `template/.opencode/commands/opsx-ff.md` | Step 3 替换为 `ensure-worktree` 调用 |
| `template/.opencode/commands/opsx-new.md` | Step 4 替换为 `ensure-worktree` 调用 |
| `template/.opencode/commands/opsx-propose.md` | Step 3 替换为 `ensure-worktree` 调用 |
| `template/.opencode/commands/opsx-apply.md` | Step 2 替换为 `ensure-worktree` 调用 |
| `template/.opencode/commands/opsx-continue.md` | Step 2 替换为 `ensure-worktree` 调用 |
| `template/.opencode/commands/opsx-finish.md` | Step 0 替换为 `ensure-worktree` 调用 |
| `openspec/schemas/.../schema.yaml` | apply Step 1 从"创建"改为"检测+STOP" |

## 使用方法

```bash
# 确保 worktree 存在（不存在时自动创建）
openspec-superpowers-opencode ensure-worktree <变更名>

# 正常流程中无需手动调用——/opsx-ff、/opsx-apply 等命令已自动调用
# 调试或手动操作时可直接使用
```

`ensure-worktree` 由 6 个 OPSX 命令自动调用，用户通常不需要手动执行。
只在以下场景可能需要直接使用：

- **手动调试**：想快速建一个隔离 worktree 检查状态
- **恢复中断**：worktree 意外删除后重建
- **CI 脚本**：在自动化流程中确保 worktree 存在

## 保障力度总结

| 层 | 机制 | 违反后果 | 强度 |
|----|------|---------|------|
| CLI 命令 | `ensure-worktree` 代码逻辑 + 退出码 | bash 工具报错，流程中断 | 🔒 硬 |
| 命令文件 | 6 个 opsx-*.md 全部调 `ensure-worktree` | agent 从任何命令入口都无法绕过 | 🔒 硬 |
| schema 提示 | apply Step 1 "检测+STOP" | agent 直接读 schema 时走不通 | 🔶 中 |

三层互不信任、互相冗余。任一层生效，无 worktree 则无法进行。
