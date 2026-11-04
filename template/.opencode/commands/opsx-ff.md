---
description: Create a change and generate all artifacts in isolated worktree (Experimental)
---

Fast-forward：创建 worktree → 在 worktree 内生成全部 artifacts → commit → 退出 worktree 回项目根（不切换分支）。

**Input**: 变更名称（kebab-case），或变更描述。

### Step 1: 确定名称

如果提供了名称则直接用。否则用 **question** 工具询问。

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

跳到 2d

**2c. 检查当前分支是否有未提交更改：**

```bash
git status --porcelain
```

- 输出为空 → 跳到 2d
- 输出非空 → 用 **question** 工具询问：

  > **当前分支有未提交的更改。是否先提交？(y/N)**
  >
  > - **N** → 不提交，跳到 2d
  > - **Y** →

  **2c-1. 提交变更：**

  ```bash
  git add -A && git commit
  ```

  **2c-2. 确认提交：**

  ```bash
  git log --oneline -1
  ```

  - 显示有新 commit → 成功，跳到 2d
  - 无新 commit 或报错 → 失败，回到 2c-1 重试

**2d. 读取 base（不可跳过）：**

`ensure-worktree` 会以当前 HEAD 为 base。这里在**创建 worktree 之前**从项目根读出它，作为 Step 4a 写入注册表、以及 Output 展示的值：

```bash
git rev-parse --abbrev-ref HEAD   # → BASE_BRANCH
```

读出后向用户打印一行：`基础分支 = <BASE_BRANCH>`。

- 只读：不写注册表、不调 `question`、不切换分支

### Step 3: 创建隔离 Worktree

Artifacts 在 feature 分支上生成，不在基础分支上留痕迹。

**3a. 创建 worktree：**

```bash
openspec-superpowers-opencode ensure-worktree <name>
cd .worktrees/<name>
# 复制 .gitignore 忽略的 openspec/schemas/ 和 config.yaml 到 worktree
mkdir -p openspec/schemas/
cp -r <project-root>/openspec/schemas/* openspec/schemas/ && cp <project-root>/openspec/config.yaml openspec/
```

**验证复制是否成功：**
```bash
test -f openspec/config.yaml && test -f openspec/schemas/superpowers-bridge-opencode/schema.yaml && test -f openspec/schemas/superpowers-bridge-opencode/templates/brainstorm.md
```

- **成功** → 继续
- **失败** → 重新执行复制再验证，成功后才能进入下一步

**3b. 初始化代码索引：**

```
- codegraph 命令可用 → codegraph init
```

命令不存在或初始化失败不阻断流程，继续下一步。

### Step 4: 确保变更存在（幂等，只判断本 worktree）

`ff` 可以在任意阶段被调用。判断依据只有一条：**当前 worktree 内是否已有该 change 目录**。

```bash
test -d openspec/changes/<name>
```

- **存在（exit 0）** → 跳过创建，直接进入 Step 4a
- **不存在（exit 1）** → 创建：

  ```bash
  openspec new change "<name>"
  ```

  - 成功（exit 0）→ 进入 Step 4a
  - 失败（exit 1）→ 停下报告，不得重试、不得手工建目录

> MUST NOT 用 `openspec list` 判断存在性：它返回的是**注册表中的活跃变更**，不是磁盘上的 change 目录；未经注册的 change 不会出现在结果里。
> 已归档的同名变更（`openspec/changes/archive/`）不视为冲突，不检测。

#### Step 4a: 注册变更到 registry

记录 change 到注册表，供后续 opsx 命令查找活跃变更以及对应的 worktree：

```bash
openspec-superpowers-opencode registry add <name> .worktrees/<name> --base "<BASE_BRANCH>"
```

- **成功（exit 0）** → 继续 Step 5
- **失败（exit 1）** →
  - 执行 `openspec-superpowers-opencode verify`，向用户展示输出结果
  - 用 `question` 工具询问用户：**修复** 或者 **停止**
  - 用户选择**修复**，根据 verify 输出的修复命令执行修复 → 修复成功后重新继续 Step 4a
  - 用户选择**停止**，中断流程

### Step 5: 生成全部 artifacts

使用 **TodoWrite** 追踪 artifact 进度。

按依赖顺序处理所有 `status` 为 `"ready"` 的 artifacts，但排除 post-apply artifacts——`requires` 链包含 `applyRequires` 中任一 artifact 的那些（`verify`、`retrospective`），它们由后续阶段生成，`ff` **不得生成**。没有可处理的 artifact 时**立即停止**。已 `done` 的 artifact **不得重建**，其数量记为本次跳过的 `<M>`。

对各 artifact：

a. 获取指令：

```bash
openspec instructions <artifact-id> --change "<name>" --json
```

b. 读取已完成的依赖 artifact 获取上下文

c. 使用 `template` 结构 + `instruction` 指引创建文件

d. 显示 "✓ Created <artifact-id>"

e. 循环直到 `openspec status --change "<name>" --json` 中所有 `applyRequires` 为 `"done"`

### Step 6: 提交 artifacts 并退出 worktree（cd 回项目根，不切换分支）

```bash
git add -A
git diff --cached --quiet || git commit -m "change: <name>"
cd <project-root>
```

- 无任何变化时（重复调用、artifacts 已齐）**跳过提交**，不视为失败。
  `git commit` 在无暂存内容时以 exit 1 退出；若直接串联 `&&`，幂等重跑会在最后一步中断。
- 若 `git commit` 失败（例如 hook 拒绝）→ 停下报告；`git diff --cached --quiet` 的 exit 1 表示「有变化」，不是失败。

### Output

- 变更：`<name>`
- Worktree：`.worktrees/<name>/`
- 分支：`feature/<name>`
- 基础分支：`<BASE_BRANCH>`
- 已创建：`<N>` 个 artifacts
- 本次跳过：`<M>` 个已完成 artifacts（`openspec status --change "<name>" --json` 中 `status` 为 `done` 的数量）
- 若 `<N>` 为 0：提示「全部 artifacts 已就绪，可运行 `/opsx-apply` 开始实现，或 `/opsx-archive` 归档」
- 提示：`/opsx-apply` 开始实现

### Artifact Creation Guidelines

- `context` 和 `rules` 是给你的约束，不是写入文件的内容
- 始终先读依赖 artifact 再创建新 artifact
- 上下文不清晰时优先用 **question** 工具
- 确认每个 artifact 文件已写入后再继续下一个
