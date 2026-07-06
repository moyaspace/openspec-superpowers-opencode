---
description: Continue working on a change - create the next artifact (Experimental)
---

继续创建变更的下一个 artifact。自动检测 worktree 并在 worktree 内操作。

**Input**: 可选指定变更名称（如 `/opsx-continue add-auth`）。省略时从上下文推断或让用户选择。

### Step 1: 选择变更

如果提供了名称则直接用。否则运行：

```bash
openspec-superpowers-opencode verify
```

- **成功（exit 0）** → 执行 `openspec list --json` → 获取活动 changes → 使用 **AskUserQuestion** 工具让用户选择
- **失败（exit 1）** →
  - 向用户展示 verify 的输出结果（诊断报告和修复建议）
  - 用 `question` 工具询问用户：**修复** 或者 **停止**
  - 用户选择**修复**，根据 verify 输出的修复命令执行修复 → 修复成功后重新执行本步骤
  - 用户选择**停止**，中断流程

> 一个变更同时只应有一个 worktree。`openspec list --json` 显示的活跃变更通常都有对应的 worktree。

### Step 2: 确保 worktree 存在并进入

```bash
openspec-superpowers-opencode ensure-worktree <name>
cd .worktrees/<name>
```

### Step 3: 检查当前状态

```bash
openspec status --change "<name>" --json
```

### Step 4: 根据状态执行

**全部完成（`isComplete: true`）**：
- 提示可运行 `/opsx-apply` 实现或 `/opsx-archive` 归档
- STOP

**有 artifact 可创建**（`status: "ready"`）：
- 取第一个 `ready` 的 artifact
- `openspec instructions <id> --change "<name>" --json`
- 读依赖文件 → 按 template + instruction 创建
- `git add -A && git commit -m "change: <name>: <artifact-id>"`
- 显示进度

**全部 blocked**：
- 展示状态供用户检查

### Step 5: 回 main

```bash
cd <project-root>
```

### Output

- 创建的 artifact
- 当前进度（N/M）
- 下一步：`/opsx-continue` 创建下一个，或 `/opsx-ff <name>` 跳转到 plan

### Artifact Creation Guidelines

- 每次只创建 **一个** artifact
- `context` 和 `rules` 是给你的约束，不是写入文件的内容
- 始终先读依赖 artifact
- 验证文件已存在再标记完成
