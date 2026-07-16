---
description: Create a change and generate all artifacts in isolated worktree (Experimental)
---

Fast-forward：创建 worktree → 在 worktree 内生成全部 artifacts → commit → 回 main。

**Input**: 变更名称（kebab-case），或变更描述。

### Step 1: 确定名称

如果提供了名称则直接用。否则 AskUserQuestion 询问。

### Step 2: 确认 git 仓库已有至少一个 commit

**2a. 检查 HEAD 是否存在：**

```bash
git rev-parse --verify HEAD
```

- 返回 0 → 跳到 2c
- 返回非 0 → 跳到 2b

**2b. 创建首次提交：**

```bash
git add -A && git commit -m "chore: initial project setup"
```

跳到 Step 3

**2c. 检查 main 是否有未提交更改：**

```bash
git status --porcelain
```

- 输出为空 → 跳到 Step 3
- 输出非空 → 用 **question** 工具询问：

  > **main 分支有未提交的更改。是否先提交？(y/N)**
  >
  > - Y → `git add -A && git commit`，跳到 Step 3
  > - N → 不提交，跳到 Step 3

### Step 3: 创建隔离 Worktree

Artifacts 在 feature 分支上生成，不在 main 上留痕迹。

**3a. 创建 worktree：**

```bash
openspec-superpowers-opencode ensure-worktree <name>
cd .worktrees/<name>
```

**3b. 初始化代码索引：**

```
- codegraph 命令可用 → codegraph init
```

命令不存在或初始化失败不阻断流程，继续下一步。

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

### Step 5: 生成全部 artifacts

使用 **TodoWrite** 追踪 artifact 进度。

按依赖顺序循环（artifacts with `status: "ready"` first）：

对各 artifact：

a. 获取指令：

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

b. 读取已完成的依赖 artifact 获取上下文

c. 使用 `template` 结构 + `instruction` 指引创建文件

d. 显示 "✓ Created <artifact-id>"

e. 循环直到 `openspec status --change "<name>" --json` 中所有 `applyRequires` 为 `"done"`

### Step 6: 提交 artifacts 并回 main

```bash
git add -A && git commit -m "change: <name>"
cd <project-root>
```

### Output

- 变更：`<name>`
- Worktree：`.worktrees/<name>/`
- 分支：`feature/<name>`
- 已创建：`<N>` 个 artifacts
- 提示：`/opsx-apply` 开始实现

### Artifact Creation Guidelines

- `context` 和 `rules` 是给你的约束，不是写入文件的内容
- 始终先读依赖 artifact 再创建新 artifact
- 上下文不清晰时优先 AskUserQuestion
- 确认每个 artifact 文件已写入后再继续下一个
