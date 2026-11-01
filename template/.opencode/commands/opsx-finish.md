---
description: Finish an implemented change - merge worktree, cleanup, archive, PR (Experimental)
---
完成 `/opsx-apply` 实现后的变更收尾工作：合并 worktree、清理、产出 retrospective、归档、开 PR。

**Input**: 可选指定变更名称（如 `/opsx-finish add-auth`）。省略时按 Step 1 的判定顺序选择变更。

**收尾流程**：

```
 1. 选择变更 → 确定要完成的 change 名称
 2. 检测     → 确认 worktree 存在并进入（不存在则 STOP，不新建）
 3. 提交+测试 → 切换到 worktree → 提交未完成工作 → 运行测试套件（验证 worktree 自身完好）
 4. 回顾     → 产出 retrospective.md（文件操作，与代码无关）
 5. 归档     → openspec archive -y（文件操作，与代码无关）
 6. 选项     → Read finishing-a-development-branch skill → 展示 4 个选项
 7. 执行     → 按用户选择执行
```

---

### Step 1: 选择变更

如果提供了名称则直接用，否则：
- 从上下文推断
- `.worktrees/` 下只有一个目录 → 自动选中
- 多个或无法判断 → 运行 `openspec list --json` 取活动 changes，使用 **question** 工具让用户选择

宣布：`"Using change: <name>"`

### Step 2: 确认 worktree 存在并进入

```bash
git worktree list
```

- **输出含 `.worktrees/<name>`** → `cd .worktrees/<name>`
- **输出不含** → **STOP**，按文末「无 worktree 时」处理

**MUST NOT** 新建 worktree：`ensure-worktree` 会先删除同名的 `feature/<name>` 分支、再新建一个空 worktree，收尾流程中禁止使用该命令。

### Step 3: 切换到 worktree，提交未完成工作并验证测试

```bash
cd .worktrees/<name>
```

**3a. 提交未提交内容：**

**3a-1. 检查状态并记录提交前 HEAD**

```bash
git status --porcelain
git rev-parse HEAD          # 记为 <before-head>
```

- `git status --porcelain` 输出为空 → 干净，跳到 3b

**3a-2. 提交变更**

```bash
git add -A && git commit -m "<由 AI 按本次实际改动拟定>"
```

**3a-3. 确认提交**

```bash
git rev-parse HEAD          # 与 <before-head> 比较
```

- 与 `<before-head>` 不同 → 成功，跳到 3b
- 与 `<before-head>` 相同，且 3a-1 的 `git status --porcelain` 为空 → 本无内容可提交，跳到 3b
- 与 `<before-head>` 相同，但 3a-1 有未提交内容 → 提交失败，回到 3a-2 重试

**3b. 运行测试套件（项目自带入口优先，语言命令兜底）：**

判定原则：项目声明的测试入口优先于语言默认命令；
**候选入口冲突、或无法判断哪个覆盖全量时，询问用户，不硬猜**。

```
1. 项目自带测试入口（优先采用，但需确认其覆盖全量）：
   - makefile / Makefile 含 `test:` target        → make test
   - CI 配置（.github/workflows/*.yml 等）显式定义的测试命令
   - 项目文档（AGENTS.md / CONTRIBUTING.md / docs/testing.md）声明的测试命令
   - ⚠️ 若候选入口不止一个，或入口疑似只覆盖子集（如 `make test` 仅跑部分包），
     与语言默认命令比对；无法判断哪个是全量入口时 → 用 **question** 工具问用户
2. 语言兜底（无项目自带入口，或自带入口经确认不覆盖全量时）：
   - 存在 package.json     → 检测 package.json 是否有 test script，有则 npm test，无则 WARNING "无 test script，跳过" 并继续
   - 存在 Cargo.toml       → cargo test
   - 存在 requirements.txt
     或 pyproject.toml     → pytest
   - 存在 go.mod           → go test ./...
   - 其他                  → 用 **question** 工具问用户
```

**测试失败甄别**：若失败信息属于环境类（embed 产物缺失、依赖未安装、目标文件不存在等），而非测试断言失败，先补齐环境或改换项目自带入口重跑；仍失败才判定为回归。

**测试失败** → STOP，告知用户失败详情，修复后再运行 `/opsx-finish`。

> 这个测试点的目的是验证 worktree 自身实现完好（开发期快速反馈）。
> 它不能替代选项 1 中的预演测试点——worktree 环境可能被开发残留污染（如本机装过的依赖），掩盖干净检出才暴露的问题。

### Step 4: 产出 retrospective

执行前确认当前目录在 worktree 内（Step 3 已 `cd .worktrees/<name>`，但实际执行中容易漂回主工作区）：

```bash
cd .worktrees/<name>
```

**4a. 确保 verify.md 存在（不存在则自动生成）：**

```bash
test -f openspec/changes/<name>/verify.md
```

- 文件存在且 Overall Decision 为 ❌ FAIL → STOP：先按 verify.md 中的失败项修复，再重跑 `/opsx-finish`
- 文件存在且非 FAIL（含 PASS / PASS WITH WARNINGS）→ 跳到 4b
- **文件不存在 → 自动生成**：
  1. 读取 verify artifact 的 instruction：`openspec instructions verify --change "<name>"`
  2. 按 instruction 逐 Scenario 核对证据（基于本变更的 specs、tasks.md checkbox 状态、Step 3 的测试结果）产出 verify.md
  3. 生成后确认 Overall Decision 非 FAIL，继续 4b
  4. 生成失败（如 instruction 不可用或证据不足）→ STOP，建议用户运行 `/opsx-verify` 人工核验

**4b. 产出 retrospective：**

Read retrospective artifact 的 instruction：

```bash
openspec instructions retrospective --change "<name>"
```

按 instruction 产出 retrospective.md（其 PRECHECK 此时已满足）。

### Step 5: 归档变更

已在 worktree 内。为了确保，再切：

```bash
cd .worktrees/<name>
openspec archive <name> -y
```

此操作将：

- 把 `openspec/changes/<name>/specs/` 的 delta specs 同步到 `openspec/specs/`
- 变更目录移到 `openspec/changes/archive/YYYY-MM-DD-<name>/`

### Step 5a: 提交归档变更

```bash
git rev-parse HEAD          # 记为 <before-archive-head>
git add -A && git commit -m "<name>: archive change"
```

### Step 5b: 确认提交

```bash
git rev-parse HEAD          # 与 <before-archive-head> 比较
```

- 与 `<before-archive-head>` 不同 → 成功，跳到 Step 6
- 与 `<before-archive-head>` 相同，且提交报 "nothing to commit" → 已是最新，跳到 Step 6
- 与 `<before-archive-head>` 相同，且无 "nothing to commit" → 失败，回到 Step 5a 重试

**方向约束（MUST）：**

合并方向的唯一合法值是 feature/<name> → <base-branch>（base 由 Step 6a 确定）：

```
  feature/<name>  →  <base-branch>
```

- **合并只往 base 上合并。** 合并目标 MUST 等于 base，MUST NOT 换成任何别的分支。
- base 就是 `main` 时，合并到 `main` 是**正确**的，照常执行。
- 要禁止的是「不看 base、一律并回 `main`」：base 不是 `main` 时 MUST NOT 合并到 `main`。
- base 未知时先按 Step 6a 确定，不得先行 rebase 或 merge。

### Step 6: 读取 finishing-a-development-branch skill

Read：
  {{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md

按 skill 内容执行：

**Step 6a: 确定基础分支（禁止默认推断）**

> finish 执行时已在 `.worktrees/<name>` 内，`HEAD` 是 `feature/<name>`，
> **base 无法从当前环境读出**，只能来自注册表记录或用户。MUST NOT 因此就默认某个分支。

base 的来源，按顺序取第一个可用的：

1. 运行 `openspec list --json`，取本 change 条目的 `baseBranch` 字段 → 读到就用
   （在 worktree 内执行也会返回项目根注册表的数据；`registry list` 的**文本**输出不含该字段，不要用它判断）
2. 读不到 → 用 **question** 工具问用户「这个 change 的 base 分支是哪个？」→ 用其回答
3. 用户也答不出 / 仍无法确定 → **STOP**，不得先行 rebase 或 merge

> 用户若在本轮对话里直接说明了 base（如「并回 release/1.1」），以用户为准——口头指令优先于注册表记录。

确定后 MUST 向用户复述一次：
  「基础分支 = <base-branch>，合并方向 feature/<name> → <base-branch>」
得到确认后再继续。

MUST NOT 按「通常是 `main` 或 `master`」自行假定。
base 可以就是 `main`；但 MUST NOT 未经用户确认就把 base 与 `main` 混为一谈。

**Step 6b: 展示 4 个选项给用户：**

```
实现完成。接下来要做什么？

1. 合并到基础分支 <base-branch>（本地）
2. 推送并创建 Pull Request
3. 保留分支，稍后处理
4. 丢弃本次变更

请选择：
```

**不要添加额外解释** — 保持选项简洁。

### Step 7: 执行用户选择

#### 选项 1: 本地合并（rebase + 临时测试台预演）

> worktree 分支未推送过，rebase 不重写任何公开历史。
> 每个 task 一个 commit 是**有意义的逻辑边界**，保留它们比 squash 成一个对 `git blame` / `git bisect` 更友好。
>
> 流程要点：全量测试在临时测试台（`.worktrees/_merge-test-<name>/`，即弃目录）上执行——
> 对象是"合并后的精确树状态"；测试通过前，<base-branch> 不做任何操作。

**执行序列**（四阶段，顺序不可调换；`<name>` 为变更名，`<base-branch>`/`<feature-branch>` 见 Step 6a）：

```bash
# ── 阶段一：rebase（当前在开发 worktree 内 .worktrees/<name>）──
git rebase <base-branch>              # 线性化到 base 最新；冲突在此暴露/解决（不测试）
```

```bash
# ── 阶段二：临时测试台验证（<base-branch> 全程零接触）──
# 注意：worktree add 必须带 --detach——base 分支已被主工作区检出，
# 不加 --detach 会报 fatal: '<base-branch>' is already used by worktree。
# 测试台为游离 HEAD（树 = base 当前 commit），流程内禁止在测试台提交。
git worktree add --detach .worktrees/_merge-test-<name> <base-branch>
cd .worktrees/_merge-test-<name>
git merge --no-commit --no-ff <feature-branch>
<env prepare>                          # 环境准备命令：按下方分派表选择执行（如 npm ci）——必须在 merge 之后（环境准备依赖合并后的依赖清单）
<test command>                         # 唯一全量测试点；退出码判定（非 0 = 失败，AI 不得以任何理由视为通过）
```

`<test command>` 按 Step 3b 的分派结果确定并使用相同命令；若 Step 3b 已判定跳过测试（如项目无 test script），则此步仅验证 merge 成功，不执行测试。

**环境准备分派表**（按测试台目录内检测标志分派）：

```
- package.json                      → npm ci（无 lockfile 则 npm install）
- Cargo.toml                        → 无步骤（可选：RUSTC_WRAPPER=sccache 前置）
- requirements.txt / pyproject.toml → python -m venv .venv-test + 安装（或 uv sync）
- go.mod                            → 无步骤
- makefile / Makefile 含 `test:` target → 无步骤（`make` 依赖按项目实际情况前置）
- 其他                              → Makefile / CI 配置推断或问用户（**question**）
```

**测试通过 → 阶段三**。

**测试失败（非 0 退出码）→ 失败路径**：

```bash
cd <project-root>
git worktree remove --force .worktrees/_merge-test-<name>   # 连未提交的预演一起丢弃（测试台本就即弃）
```

然后 STOP 报告失败详情。注册表与开发 worktree 原样保留（变更仍为活跃状态，修复后重跑 `/opsx-finish`）。

```bash
# ── 阶段三：落地（<base-branch> 接收已验证结果）──
cd <project-root>                      # 回项目根（测试台留到阶段四用 --force 整体丢弃）
git rev-parse --abbrev-ref HEAD
```

- **输出 = `<base-branch>`** → 继续下一步
- **输出 ≠ `<base-branch>`** → STOP，不得 merge

```bash
git merge --ff-only <feature-branch>   # 树 = 刚测过的树，逐字节一致
```

- 若 `--ff-only` 失败（base 在验证期间前进）→ 停止并报告，重跑 `/opsx-finish`

```bash
# ── 阶段四：清理（顺序不可调换）──
git worktree remove --force .worktrees/_merge-test-<name>  # 1. 测试台清理（连未提交的预演一起丢弃）
openspec-superpowers-opencode registry remove <name>  # 2. 注册表（必须在开发 worktree 删除之前）
openspec-superpowers-opencode registry list           # 3. 验证：输出含 <name> 则重试上一步
git worktree remove .worktrees/<name>                 # 4. 移除开发 worktree
git branch -d <feature-branch>                        # 5. 删分支
```

**若第 4 步移除开发 worktree 失败**：

> **此失败模式主要发生在 Windows。** POSIX（Linux/macOS）允许删除已被进程打开的文件
> （inode 保留至句柄关闭），故通常不会失败；仅当某进程以该目录为当前工作目录时，顶层
> 目录删除才可能报 `EBUSY`。Windows 因文件句柄独占，只要编辑器 / OpenCode 会话的 LSP /
> 文件管理器仍持有该目录，删除即失败——典型报错 `Invalid argument`、
> `The process cannot access the file because it is being used by another process`
> （**均为 Windows 措辞**）。

1. **MUST NOT 反复重试，MUST NOT 升级手段**——不要试 `--force`、改名、`rd /s /q`、杀进程。
   真因在**外部进程**（仍开着的编辑器 / OpenCode 会话的 LSP），重试无效且属越权。
2. **先确认 git 侧是否已干净**：`git worktree list`。
   - **已不列出** `<name>` → git 侧已干净，**继续第 5 步删分支**；残留只是一个**空目录**。
     （此后若再跑 `git worktree remove` 报 `fatal: '…' is not a working tree`，即为此状态，
     属预期，**不必再试**。）
   - **仍列出** → 停止并报告（另一类问题，不在此处置）。
3. **报告残留 + 下一步**：`.worktrees/<name>/` 残留，通常是宿主进程占用该目录句柄；
   关闭编辑器 / OpenCode 会话后手动删除即可。
4. **MUST 明写可忽略**：残留空目录**不影响**已完成的合并、归档与 git 状态；
   **MUST NOT** 因它阻塞收尾或声称收尾失败。

**定位持有者（可选，非标配工具）**：

```bash
# Unix/macOS
lsof +D <worktree-path>      # 或 fuser -v <worktree-path>
# Windows (PowerShell) — Sysinternals handle.exe
# handle.exe -a -u <name>
```

#### 选项 2: 推送并创建 PR

```bash
git push -u origin <feature-branch>
gh pr create --base <base-branch> --head <feature-branch> --title "<title>" --body "## Summary\n..."
```

PR 创建后，change 已推送但尚未合入。worktree 和注册表条目均保留。
用户可在 PR 合入后手动清理（先清理注册表，再删 git 资源）：

- 清理注册表：`openspec-superpowers-opencode registry remove <name>`（如失败可重试）
- **验证**：运行 `openspec-superpowers-opencode registry list`，确认输出中不含 `<name>`，包含则重试上一步
- 删除 worktree：`git worktree remove .worktrees/<name>`
- 删除分支：`git branch -d <feature-branch>`

#### 选项 3: 保留分支

告知用户分支和 worktree 路径。不做任何清理。

#### 选项 4: 丢弃

**要求用户输入 'discard' 确认**后执行：

```bash
openspec-superpowers-opencode registry remove <name>  # 1. 注册表（先于 git 操作）
openspec-superpowers-opencode registry list           # 2. 验证：输出含 <name> 则重试上一步
cd <project-root>                                     # 3. 回到项目根（base 已被主工作区检出）
git checkout <base-branch>                            # 4. 回主工作区
git worktree remove .worktrees/<name>                 # 5. 移除开发 worktree
git branch -D <feature-branch>                        # 6. 删分支（丢弃用 -D 强删）
```

**若第 4 步移除开发 worktree 失败**：处置同「选项 1 → 阶段四第 4 步」的四条
（MUST NOT 重试 / 先查 `git worktree list` / 报告残留 / 明写可忽略）。本选项特有：
第 5 步用 `-D` 强删分支，只要 git 侧已干净（`git worktree list` 不列出 `<name>`）即可正常执行，
残留空目录不阻塞它。

---

**无 worktree 时**：如果用户运行 `/opsx-finish` 但对应 worktree 已被手动清理，Step 2 会 STOP。
此时检查是否有对应分支残留，建议用户手动处理。

**幂等性**：如果 retrospective.md 已存在则跳过；如果变更已归档则跳过。

**残留测试台清理**：`.worktrees/_merge-test-<name>/` 是即弃目录，正常流程中会在
选项 1 阶段四第 1 步移除。若因异常中断而残留（存在该目录但变更已完成或已丢弃），
可在确认无用后 `git worktree remove .worktrees/_merge-test-<name> --force` 清理。
