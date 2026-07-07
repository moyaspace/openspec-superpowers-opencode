---
description: Propose a new change - create worktree and generate all artifacts in one step
---

覆盖 OpenSpec 内置命令。创建 worktree → 在 worktree 内生成 proposal + design + tasks → commit → 回 main。

**Input**: 变更名称（kebab-case），或变更描述。

### Step 1: 确定名称

如果提供了名称则直接用。否则 AskUserQuestion 询问。

### Step 2: 确认 git 仓库已有至少一个 commit

```bash
git rev-parse --verify HEAD
```

- 返回 0 → 继续
- 返回非 0 → 自动创建首次提交：

```bash
git add -A && git commit -m "chore: initial project setup"
```

### Step 3: 创建隔离 Worktree

```bash
openspec-superpowers-opencode ensure-worktree <name>
cd .worktrees/<name>
```

### Step 4: 在 worktree 内创建变更

```bash
openspec new change "<name>"
```

#### Step 4a: 注册变更到 registry

记录 change 到注册表，供后续 opsx 命令查找活跃变更以及对应的 worktree：

```bash
openspec-superpowers-opencode registry add <name> .worktrees/<name>
```

- **成功（exit 0）** → 继续 Step 5
- **失败（exit 1）** →
  - 执行 `openspec-superpowers-opencode verify`，向用户展示输出结果
  - 用 `question` 工具询问用户：**修复** 或者 **停止**
  - 用户选择**修复**，根据 verify 输出的修复命令执行修复 → 修复成功后重新继续 Step 4a
  - 用户选择**停止**，中断流程

### Step 5: 生成 proposal + design + tasks

按 `openspec status --change "<name>" --json` 的依赖顺序逐个创建 artifact：
- `openspec instructions <id> --change "<name>" --json` 获取模板和指引
- 读依赖 artifact 获取上下文
- 用 template 结构创建文件

### Step 6: 提交 artifacts 并回 main

```bash
git add -A && git commit -m "change: <name>"
cd <project-root>
```

### Output

- 变更：`<name>`
- Worktree：`.worktrees/<name>/`
- 分支：`feature/<name>`
- 已创建：proposal.md, design.md, tasks.md
- 提示：`/opsx-apply` 开始实现

### Guardrails

- 如果上下文不清晰，AskUserQuestion
- `context` 和 `rules` 是给你的约束，不是写入文件的内容
- 验证 artifact 文件已写入再继续下一个
- 如果同名变更已存在，建议用 `/opsx-continue`
