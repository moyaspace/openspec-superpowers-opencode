---
description: Propose a new change - create worktree and generate all artifacts in one step
---

覆盖 OpenSpec 内置命令。创建 worktree → 在 worktree 内生成全部 artifacts → commit → 退出 worktree 回项目根（不切换分支）。

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

**3a. 创建 worktree 并校验就位：**

**3a-1. 创建 worktree：**

```bash
openspec-superpowers-opencode ensure-worktree <name>
```

- **成功（exit 0）** → 进入 3a-2
- **失败（exit 1）** → 停下报告，不得继续

**3a-2. 进入 worktree（cd 失败必须停下）：**

```bash
cd .worktrees/<name> || { echo "STOP: cd 失败"; exit 1; }
```

- `cd` 失败时立即 `exit 1`，不得进入复制重试

**3a-3. 只读校验：当前目录就是独立 worktree 根：**

```bash
test -z "$(git rev-parse --show-prefix)" || { echo "STOP: 不是独立 worktree"; exit 1; }
```

**3a-4. 只读校验：当前分支为 feature/<name>：**

```bash
test "$(git rev-parse --abbrev-ref HEAD)" = "feature/<name>" || { echo "STOP: 分支不对"; exit 1; }
```

- 3a-3 / 3a-4 任一失败 → 停下报告，不得进入 3a-5

**3a-5. 复制 schemas/config 并验证（失败最多重试 1 次）：**

```bash
mkdir -p openspec/schemas/
cp -r <project-root>/openspec/schemas/* openspec/schemas/ && cp <project-root>/openspec/config.yaml openspec/
test -f openspec/config.yaml && test -f openspec/schemas/superpowers-bridge-opencode/schema.yaml && test -f openspec/schemas/superpowers-bridge-opencode/templates/brainstorm.md
```

- **成功** → 进入 3a-6
- **失败** → 重新执行复制与 `test -f` 验证，**最多重试 1 次**
- **第二次仍失败** → 停下报告，不得进入下一步

**3a-6. 初始化代码索引：**

```
- codegraph 命令可用 → codegraph init
```

命令不存在或初始化失败不阻断流程，继续下一步。

### Step 4: 创建变更（本命令为创建语义）

`propose` 是**创建**语义：名字已被占用时停下并给出继续方式，不覆盖已有 change。

```bash
test -d openspec/changes/<name>
```

- **不存在（exit 1）** → 执行创建：

  ```bash
  openspec new change "<name>"
  ```

  成功（exit 0）→ 进入 Step 4a；失败（exit 1）→ 停下报告，不得重试、不得手工建目录。

- **存在（exit 0）** → **STOP**，向用户报告：

  > 变更 `<name>` 已存在，未创建、未覆盖任何 change。继续的方式：
  > - `/opsx-continue <name>` — 每次生成一个 artifact，逐个确认
  > - `/opsx-ff <name>` — 一次补齐所有剩余 artifact

  不得继续，不得覆盖已有 change。Step 3 可能已创建 worktree 并复制 schemas/config；离开前先 `cd <project-root>`，不要停在 worktree 内。

> MUST NOT 用 `openspec list` 判断存在性（返回的是注册表内容，不是磁盘目录）。
> 已归档的同名变更不视为冲突，不检测。

#### Step 4a: 注册变更到 registry

记录 change 到注册表，供后续 opsx 命令查找活跃变更以及对应的 worktree：

```bash
openspec-superpowers-opencode registry add <name> .worktrees/<name> --base "<BASE_BRANCH>"
```

- **成功（exit 0）** → 继续 Step 5
- **失败（exit 1）** →
  - 执行 `openspec-superpowers-opencode verify`，向用户展示输出结果
  - 用 **question** 工具询问用户：**修复** 或者 **停止**
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

### Step 6: 提交 artifacts 并退出 worktree（cd 回项目根，不切换分支）

```bash
git add -A && git commit -m "change: <name>"
cd <project-root>
```

### Output

- 变更：`<name>`
- Worktree：`.worktrees/<name>/`
- 分支：`feature/<name>`
- 基础分支：`<BASE_BRANCH>`
- 已创建：`<N>` 个 artifacts
- 提示：`/opsx-apply` 开始实现

### Artifact Creation Guidelines

- `context` 和 `rules` 是给你的约束，不是写入文件的内容
- 始终先读依赖 artifact 再创建新 artifact
- 上下文不清晰时优先用 **question** 工具
- 确认每个 artifact 文件已写入后再继续下一个
- 同名变更已存在时由 Step 4 中止，不再继续
