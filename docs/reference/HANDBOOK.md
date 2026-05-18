# openspec-superpowers-opencode

基于 [OpenSpec](https://github.com/Fission-AI/OpenSpec) `superpowers-bridge-opencode` schema 的项目，
将 [Superpowers](https://github.com/obra/superpowers) 方法论桥接到 [OpenCode](https://opencode.ai) 平台。

---

## 这是什么？

这是一个**基础设施/工作流项目**。它没有应用代码，操作对象是 `openspec/changes/` 中的变更 artifacts
（提案、规格、任务、计划、验证、回顾）。

核心价值：将 Superpowers skills（brainstorming、writing-plans、using-git-worktrees 等）
通过 OpenSpec 的 OPSX 命令接入 OpenCode。

---

## 部署方式

**需要同时复制 `template/` 和 `scripts/` 两个目录**——setup 脚本通过 `../template/` 相对路径引用模板目录，
两者必须在同一父目录下。

### 方式一：npx（推荐，无需 git clone）

```bash
npx create-openspec-superpowers-opencode my-project
cd my-project
# Windows:
.\scripts\setup.ps1
# Linux:
./scripts/setup.sh
```

### 方式二：复制整个模板仓库

```powershell
# Windows
Copy-Item -Recurse ..\openspec-superpowers-opencode\* my-project\
cd my-project
.\scripts\setup.ps1
```

```bash
# Linux
cp -R ../openspec-superpowers-opencode/* my-project/
cd my-project
./scripts/setup.sh
```

### 方式二：仅复制 template + scripts

```powershell
# Windows
Copy-Item -Recurse ..\openspec-superpowers-opencode\template, ..\openspec-superpowers-opencode\scripts my-project\
cd my-project
.\scripts\setup.ps1
```

```bash
# Linux
cp -R ../openspec-superpowers-opencode/{template,scripts} my-project/
cd my-project
./scripts/setup.sh
```

### setup 脚本自动完成

1. 检查前提条件（openspec CLI、opencode CLI、git、Superpowers 插件）
2. 检测 Superpowers 安装路径
3. 初始化 OpenSpec
4. 复制模板文件（AGENTS.md 已有则追加 bridge 内容）
5. 替换 `{{SUPERPOWERS_BASE_PATH}}` 占位符为实际路径
6. 验证 schema
7. 验证完整工作流（模板路径 → 创建变更 → artifact 链 → 指令生成 → 清理）
8. （Step 1.5）Skill lock 校验 — 对比 Superpowers skill 文件的 SHA-256 与锁定值
9. （Step 7）写入安装清单 — `openspec-bridge-install.json`，记录已安装文件

### 用户执行步骤

| 步骤 | 位置 | 命令 | 说明 |
|------|------|------|------|
| ① 复制目录 | 终端 | `Copy-Item -Recurse ..\openspec-superpowers-opencode\template, ..\openspec-superpowers-opencode\scripts my-project\` | 将 template + scripts 复制到目标项目 |
| ② 初始化 Git | 终端 | `cd my-project && git init && git add -A && git commit -m "init"` | 创建仓库和首个 commit |
| ③ 安装脚本 | 终端 | `.\scripts\setup.ps1` 或 `./scripts/setup.sh` | 检测环境、复制文件、替换路径、验证 schema |
| ④ 开始使用 | OpenCode | `/opsx-ff <功能名>` | 创建第一个变更（worktree 内自动生成全部 artifacts） |

> **`/init-deep` 不需要执行** — setup 脚本已经部署了 AGENTS.md（含 Superpowers 载入规则和子 Agent 调度映射）。再跑 `/init-deep` 可能覆盖已有配置。
>
> **`git init` 可以省略** — 所有 OPSX 命令都有 auto-init 逻辑（`git rev-parse --verify HEAD` 失败时自动 init + 首次提交）。只需确保 `git` 命令已安装。
>
> **`opencode.json` 已部署** — permission 规则限制 AI 只能在 `.worktrees/**` 和 `openspec/**` 等路径写入，防止误改 main 分支文件。详见 [opencode.json](#opencodejson-permission-规则)。
>
> **`.gitignore` 已创建** — `.worktrees/` 目录被 git 忽略，变更 artifacts 不会意外追踪到 main 分支。
>
> **安装脚本参数：**
> - `.\scripts\setup.ps1 -DryRun` — 预览变更，不实际写入
> - `.\scripts\setup.ps1 -Uninstall` — 按清单卸载，只删自己装过的文件
> - `.\scripts\setup.ps1 -Force` — 覆盖未受管理的已有文件

### 更新项目模板

`reset + init` 只重新复制本包中的模板文件，不影响 Superpowers skill 文件内容。

| 更新内容 | 操作 | 说明 |
|---------|------|------|
| Superpowers 插件更新 | **无需操作** | skill 内容自更新 |
| 本项目更新 | `reset + init` | 重新复制新模板、新锁文件 |

### skills.lock.json

记录了 7 个 Superpowers skill 文件的 SHA-256 哈希值，随本项目发布。
Superpowers 更新后 SHA-256 不匹配时，`init` 会显示黄色 WARNING 提示。
**不阻塞，正常工作流不受影响。** 需要新版 `skills.lock.json` 才能消除该警告——即等待本项目更新。

---

## 快速开始

```bash
/opsx-propose <描述>  # 创建 worktree → 生成 proposal + design + tasks → commit → 回 main
/opsx-ff <功能名>    # 创建 worktree → 在 worktree 内生成全部 artifacts → commit → 回 main
/opsx-apply          # 进入已有 worktree → 子 Agent TDD 编码 → 审查 → 提交
/opsx-finish         # 测试验证 + retrospective + 归档 + 合并/PR/清理
/opsx-verify         # 验证实现 vs spec（7 项检查）
/opsx-archive        # 同步 delta spec + 归档
```

逐步模式：

```bash
/opsx-new <功能名>   # 创建 worktree → 创建变更 scaffold（第一个 artifact 待生成）
/opsx-continue       # 在 worktree 内逐步创建 brainstorm → proposal → specs → tasks → plan
/opsx-apply          # 进入已有 worktree 实现 + 提交（不碰主分支）
/opsx-finish         # 合并 feature 分支 → 清理 → retrospective → archive → PR
/opsx-verify         # 验证实现 vs spec
/opsx-archive        # 归档
```

**核心原则**：所有 artifacts 和代码都在 worktree（feature 分支）中生成和提交，
`main` 分支只包含模板基础设施文件，始终干净。

---

## 项目结构

```
your-project/
├── .opencode/
│   ├── commands/            # OPSX 快捷键定义（/opsx-*）
│   ├── skills/              # openspec-*-change skills
│   └── package.json         # @opencode-ai/plugin
├── scripts/
│   ├── setup.ps1            # Windows 安装脚本
│   └── setup.sh             # Linux 安装脚本
├── openspec/
│   ├── config.yaml          # schema: superpowers-bridge-opencode
│   ├── schemas/superpowers-bridge-opencode/
│   │   ├── schema.yaml      # schema 定义（含 Superpowers 路径）
│   │   └── templates/       # 9 个 artifact 模板
│   ├── changes/archive/     # 已归档变更
│   └── specs/               # 主规格文件
└── AGENTS.md                # Superpowers 载入规则 + 子 Agent 调度映射（已有则追加）
```

> `template/DEPLOYMENT.md` 和 `template/README.md` 保留在模板目录中，不部署到项目根目录。

---

## Git Worktree 隔离机制

### 为什么需要 worktree？

变更实现阶段的编码工作会修改项目文件。如果直接在主工作目录中修改，会带来几个问题：

1. **状态污染** — 未完成的代码变更混杂在主分支中，打断上下文切换
2. **提交粒度模糊** — 变更 A 和变更 B 的文件交错修改，难以独立提交
3. **审查困难** — 无法独立验证单个变更的完整测试基线
4. **中断成本高** — 需要暂停当前变更去处理紧急问题时，必须 stash 或丢弃当前进度

Git worktree 为每个变更创建**共享同一仓库但工作目录隔离**的环境：

```
主仓库 (main)
├── .git/               # 共享的 Git 对象库
├── 项目文件             # 主分支的工作文件
└── .worktrees/         # 隐藏的 worktree 目录（已被 .gitignore 排除）
    └── <变更名称>/      # 每个变更的隔离工作区
        ├── 项目文件     # 变更分支的工作文件（独立副本）
        └── .git         # 指向共享 .git 的指针
```

当执行 `/opsx-ff` 或 `/opsx-new` 时：

1. 创建指向独立分支 `feature/<name>` 的 worktree
2. 所有 artifacts 在 worktree 内生成并提交，**不在 main 上留痕**
3. `/opsx-apply` 直接进入已有 worktree 实现代码
4. 变更完成后 `/opsx-finish` 将 feature 分支合并回 main，清理 worktree

### Worktree 生命周期

worktree 的生命周期横跨三个命令：`/opsx-ff` / `/opsx-new`（创建）→ `/opsx-apply`（实现）→ `/opsx-finish`（收尾）。

**`/opsx-ff` / `/opsx-new` 负责：** worktree 创建 → artifacts 生成 → commit → 回 main

```
┌──────────────────────────────────────────────────────┐
│  0. Pre-flight                                       │ ◀──── FF/New
│     → 确认 git 仓库已有 ≥1 commit（无则 auto-init）  │       阶段
│     → 获取变更名称                                    │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  1. 创建 Worktree                                    │
│      → git worktree add .worktrees/<name> -b feature/<name>  │
│      → cd .worktrees/<name>                          │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  2. 生成 Artifacts（在 worktree 内）                  │
│      openspec new change + 逐个生成 artifact          │
│      → artifacts 在 feature 分支上，main 不受影响     │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  3. 提交 + 回 main                                   │
│      git add -A && git commit -m "change: <name>"    │
│      cd <project-root>                               │
│      → 提示运行 /opsx-apply                          │
└──────────────────┬───────────────────────────────────┘
                   │
            ╔══════╧════════╗
            ║  /opsx-apply  ║
            ╚══════╤════════╝
                   ▼
┌──────────────────────────────────────────────────────┐ ◀──── Apply
│  4. 进入已有 Worktree                                │       阶段
│      → 检测 .worktrees/<name>/ 存在                  │
│      → cd .worktrees/<name>                          │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  5. 实现任务（在 worktree 中）                        │
│      对 plan.md 的每个任务：                          │
│      → task() 派 Agent 编码                          │
│      → spec-reviewer 审查规格对齐                    │
│      → code-quality-review 审查代码质量              │
│      → 标记 tasks.md checkbox 完成                   │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  6. 验证 + 提交                                      │
│      openspec status 确认 artifacts 已完成            │
│      git add + git commit                            │
└──────────────────┬───────────────────────────────────┘
                   │
            ╔══════╧════════╗
            ║  /opsx-finish ║
            ╚══════╤════════╝
                   ▼
┌──────────────────────────────────────────────────────┐ ◀──── Finish
│  7. 测试验证（worktree 内）                           │       阶段
│      跑测试套件 → 验证 worktree 自身完好              │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  8. Retrospective + Archive                          │
│      产出 retrospective.md → openspec archive -y     │
└──────────────────┬───────────────────────────────────┘
                   ▼
┌──────────────────────────────────────────────────────┐
│  9. 合并到 main                                      │
│      git rebase <base> → <test> → git merge (ff)     │
│      → 清理 worktree                                 │
└──────────────────────────────────────────────────────┘
```

### 安全机制

1. **禁止追踪 worktree 文件** — `.worktrees/` 必须被 `.gitignore` 排除
   - `git check-ignore -q .worktrees` 返回 0 才可继续
   - 不满足时自动写入 `.gitignore` 并提交
2. **测试基线验证** — worktree 创建后先运行测试套件，确保基线干净
3. **幂等性** — 重复运行 `/opsx-apply` 会检测 `.worktrees/<name>/` 是否存在，
    已完成的步骤自动跳过，从中断处继续

### Worktree 入口总表

| 命令 | 创建 worktree？ | 行为 |
|------|:-------------:|------|
| `/opsx-propose <描述>` | ✅ | 创建 worktree → 生成 proposal + design + tasks → commit → 回 main |
| `/opsx-new <name>` | ✅ | 创建 worktree → scaffold + 首个 artifact → commit → 回 main |
| `/opsx-ff <name>` | ✅ | 创建 worktree → 生成全部 artifacts → commit → 回 main |
| `/opsx-continue` | ❌ 复用 | 检测已有 worktree → 进入 → 创建下一个 artifact → commit → 回 main |
| `/opsx-apply` | ❌ 复用 | 检测已有 worktree → 进入 → 实现代码 → 审查 → 提交 |
| `/opsx-finish` | ❌ 复用 | 检测已有 worktree → 测试 → retrospective → archive → 合并 → 清理 |
| `/opsx-verify` | ❌ | 只读，不涉及 worktree |
| `/opsx-archive` | ❌ | 只读，不涉及 worktree |
| `/opsx-explore` | ❌ | 纯思考模式，不创建变更 |
| `openspec new change` (CLI) | ❌ | 手动操作，需自行处理 worktree |

> 前三个命令（propose / new / ff）**创建** worktree 并确保 main 干净；
> continue / apply / finish **复用**已存在的 worktree。

### 操作示例

#### `/opsx-ff <name>` — 创建变更 + artifacts（worktree 内）

```bash
# 创建 worktree → 生成 artifacts → commit → 回 main
git worktree add .worktrees/my-feature -b feature/my-feature
cd .worktrees/my-feature
openspec new change my-feature
openspec instructions brainstorm --change my-feature
# ... AI Agent 生成 brainstorm, proposal, specs, tasks, plan ...
git add -A && git commit -m "change: my-feature"
cd /project/root
# main 分支没有任何变化
```

#### `/opsx-new <name>` — 逐步创建（同样流程，只生成 scaffold）

```bash
git worktree add .worktrees/my-feature -b feature/my-feature
cd .worktrees/my-feature
openspec new change my-feature
git add -A && git commit -m "change: my-feature (scaffold)"
cd /project/root
# 后续用 /opsx-continue 依次创建 artifact
```

#### `/opsx-apply` — 实现阶段（进入已有 worktree）

```bash
# Step 1-4: 检测 worktree → 进入 → Pre-flight → 实现
cd .worktrees/my-feature
openspec status --change my-feature --json
# ... AI Agent 实现任务、审查、验证 ...
git add -A && git commit -m "my-feature: 实现说明"

# 提示运行 /opsx-finish
```

#### `/opsx-finish` — 收尾阶段（影响主分支）

```bash
# Step 0-1: 检测 worktree → 测试 worktree 自身
cd .worktrees/my-feature
<test command>                     # 自动检测：npm test / cargo test / pytest / ...

# Step 2-3: retrospective → 归档
openspec instructions retrospective --change my-feature
openspec archive -y

# Step 4-5: finishing-a-development-branch skill
# 用户选择「合并到主分支」
git checkout feature/my-feature
git rebase main                  # 线性化到 main 最新
<test command>                    # rebase 后测：新基线可能带冲突
git checkout main
git merge feature/my-feature     # fast-forward
git worktree remove .worktrees/my-feature  # 先移除 worktree
git branch -d feature/my-feature
```

> 实际操作中 AI Agent 会通过 AskUserQuestion 征求用户选择（合并/PR/保留/丢弃）。

---

## 架构总览

当前工作流将三个系统分层结合：

```
Superpowers skills (HOW - 执行方法论):
  brainstorming  writing-plans  subagent-dev(+tdd+review)  finishing-branch
       ↓              ↓                    ↓                     ↓
OpenSpec 架构 (WHAT - artifact 治理):
  brainstorm → proposal → specs → tasks → plan → verify → retrospective
                                                   ↓
Git worktree (WHERE - 隔离):
  opsx-propose/opsx-new/opsx-ff   →   opsx-apply   →   opsx-finish
  (创建 worktree + artifacts)       (实现代码)        (合并回 main)
```

各层的职责：

| 层 | 职责 | 关键决策 |
|----|------|---------|
| **OpenSpec** | 定义变更的 artifact 生命周期（每个阶段产什么） | `schema.yaml` 定义 artifact 类型、依赖关系、apply/finish 阶段 |
| **Superpowers** | 提供执行方法论（每个阶段怎么产） | 5 个 skill 被直接使用，通过 Read 替代 skill() 加载 |
| **Git worktree** | 提供隔离环境（代码产在哪里） | 所有 artifacts 和代码在 feature 分支，main 始终干净 |
| **OPSX 命令** | 编排流程（什么时机产） | propose/new/ff 创建 → apply 实现 → finish 合并 |

**核心原则**：OpenSpec 定义 WHAT，Superpowers 定义 HOW，Worktree 定义 WHERE，
命令定义 WHEN。各层独立，互不侵入。

---

## 设计分析

### 为什么需要参数化？

将工作目录转化为可复用的模板，需要解决以下问题：

| 文件 | 硬编码路径数 | 部署到目标项目 | 处理方式 |
|------|:-----------:|:------------:|---------|
| `.opencode/commands/*` (11个) | 0 | ✅ | 直接复制 |
| `.opencode/skills/*` (10个) | 0 | ✅ | 直接复制 |
| `.opencode/package.json` | 0 | ✅ | 直接复制 |
| `openspec/config.yaml` | 0 | ✅ | 直接复制 |
| `openspec/schemas/.../templates/*` (9个) | 0 | ✅ | 直接复制 |
| **`openspec/schemas/.../schema.yaml`** | **9处** | ✅ | 替换 `{{SUPERPOWERS_BASE_PATH}}` |
| **`AGENTS.md`** | **1处** | ✅ | 替换占位符；已有则追加 |
| `DEPLOYMENT.md` | 11处 | ❌ | 保留在 `template/` |
| `README.md` | 2处 | ❌ | 保留在 `template/` |

### 核心障碍

Superpowers 基路径包含三个可变因素，导致路径无法硬编码：

```
C:\Users\<USERNAME>\.cache\opencode\packages\
  superpowers@git+https_\github.com\obra\superpowers.git\
  node_modules\superpowers\skills\
```

1. **用户名** — 每个 Windows/Linux 用户不同
2. **Git hash** — Superpowers 版本更新后路径变化
3. **平台** — Windows (`\`) vs Linux (`/`) 路径格式不同

### 解决方案

- 模板文件使用 `{{SUPERPOWERS_BASE_PATH}}` 占位符
- `scripts/setup.ps1`（Windows）/ `scripts/setup.sh`（Linux）自动检测路径并替换
- 两份脚本逻辑一致，仅语法和路径格式不同，共享同一份 `template/` 目录

### Schema 设计要点

| 对比项 | 上游 superpowers-bridge | 本模板 (superpowers-bridge-opencode) |
|--------|------------------------|--------------------------------------|
| **Skill 加载** | `Skill tool` 调用 | `Read` 读取 skill 文件 |
| **子 Agent 调度** | `call_omo_agent(hephaestus)` | `task(category="deep", ...)` |
| **PRECHECK** | 检查 skill 名称 | Read 文件存在性 |
| **verify** | 调用 `openspec-verify-change` skill | 按 7 项检查清单逐项执行 |
| **降级策略** | 不适用 | 不支援 executing-plans，fail loud |

---

## 工作流

### Artifact 依赖链

```
brainstorm → proposal → specs → tasks → plan → verify → retrospective
                 ↓
              design (optional)
```

### Apply 阶段流程（`/opsx-apply`）

```
Step 0: 选择变更 → 检测 .worktrees/<name>/ 是否存在
         → 不存在则 STOP（提示先运行 /opsx-ff）
Step 1: 进入 worktree → cd .worktrees/<name>
Step 2: Pre-flight → Read 检查所有必要 skill 文件
Step 3: 执行 → 对 plan.md 中每个任务：
         a) Read implementer-prompt.md → task() 派 Agent
         b) Agent 完成 → Read spec-reviewer-prompt.md 审查
         c) 通过 → Read code-quality-reviewer-prompt.md 审查
         d) 全部通过 → 标记 tasks.md checkbox
Step 4: Verification → openspec status 确认 artifacts 完成
Step 5: Commit → 在 worktree 中提交变更
         → 通知用户运行 /opsx-finish
```

### Finish 阶段流程（`/opsx-finish`）

```
Step 0: 检测 → 找到要完成的 worktree
Step 1: 测试 → 切换到 worktree 运行测试（验证 worktree 自身完好）
Step 2: 回顾 → 产出 retrospective.md（文件操作，与代码无关）
Step 3: 归档 → openspec archive -y（文件操作，与代码无关）
Step 4: 选项 → Read finishing-a-development-branch skill
         用户选择：合并 / PR / 保留 / 丢弃
Step 5: 执行 → 按选择执行
```

**两个测试点**，定位不同问题：

| 时机 | 测什么 |
|------|--------|
| Step 1 — worktree 内 | 验证 worktree 自身实现完好，避免带着问题往下走 |
| 选项「合并」rebase 之后 | base 变了，代码基于新基线可能有冲突。rebase 后再测一次 |

**测试命令自动检测**：

| 项目类型 | 检测依据 | 执行命令 |
|---------|---------|---------|
| Node.js | `package.json` | `npm test` |
| Rust | `Cargo.toml` | `cargo test` |
| Python | `requirements.txt` 或 `pyproject.toml` | `pytest` |
| Go | `go.mod` | `go test ./...` |
| 其他 | Makefile / CI 配置 | 推断或 AskUserQuestion |

```
合并路径的完整流程：
  cd .worktrees/<name>
  <test command>                   # Step 1: 测 worktree 自身
  cd /project/root                 # （自动检测 npm test / cargo test / ...）
  git checkout feature/<name>
  git rebase <base-branch>         # 线性化到 base 最新
  <test command>                    # rebase 后: 测新基线兼容
  git checkout <base-branch>
  git merge feature/<name>         # fast-forward
  git worktree remove .worktrees/<name>  # 先移除 worktree
  git branch -d feature/<name>
```

### 核心流程

| 命令 | 功能 | 影响范围 |
|------|------|---------|
| `/opsx-propose` | 创建 worktree + 生成 proposal + design + tasks | worktree（feature 分支） |
| `/opsx-new <name>` | 创建 worktree + 变更 scaffold（首个 artifact 待生成） | worktree（feature 分支） |
| `/opsx-ff <name>` | 创建 worktree + 生成全部 artifacts（brainstorm → plan） | worktree（feature 分支） |
| `/opsx-continue` | 在已有 worktree 内创建下一个 artifact | worktree（feature 分支） |
| `/opsx-apply` | 进入已有 worktree → 子 Agent TDD 编码 → 审查 → 提交 | 仅 worktree（隔离） |
| `/opsx-finish` | 合并 feature 分支 → 清理 → retrospective → archive → PR | 主分支 + 远程 |
| `/opsx-verify` | 验证实现 vs spec（7 项检查） | 只读 |
| `/opsx-archive` | 同步 delta spec + 归档变更目录 | 仅仓库文件 |

---

## Superpowers Skill 载入说明

本 schema 通过 `Read` 替代 `skill()` 来载入 Superpowers skills，原因：

1. **工具不可用** — `skill()` 在某些平台/环境中不可用，而 `Read` 是普遍支持的文件读取工具
2. **内容透明** — `Read` 可以查看 skill 的完整内容，方便调试和理解
3. **路径灵活** — 通过 setup 脚本自动检测路径，无需手动配置

### 子 Agent 调度映射

| 任务类型 | OpenCode 调用 |
|---------|---------------|
| 实现任务 | `task(category="deep", load_skills=[], ...)` — prompt 嵌入 TDD 指令（Read Superpowers TDD SKILL.md） |
| 代码搜索 | `task(subagent_type="explore", ...)` |
| 查文档 | `task(subagent_type="librarian", ...)` |
| 架构决策 | `task(subagent_type="oracle", ...)` |
| Code review | `task(subagent_type="oracle", ...)` |

### Skill 使用情况

| Skill | 状态 | 用途 |
|-------|------|------|
| `brainstorming` | ✅ 使用 | opsx-propose/opsx-ff 的 brainstorm 阶段：探索用户意图、需求、设计 |
| `writing-plans` | ✅ 使用 | opsx-ff 的 plan 阶段：将 design/requirements 分解为可执行的微任务 |
| `subagent-driven-development` | ✅ 使用 | opsx-apply 的实现阶段：调度子 Agent 执行 TDD 编码 + spec 审查 + 代码质量审查 |
| `test-driven-development` | ✅ 使用 | 通过 Read 嵌入子 Agent prompt：强制 RED-GREEN-REFACTOR 流程 |
| `finishing-a-development-branch` | ✅ 使用 | opsx-finish 的合并/清理阶段：结构化合并选项（merge/PR/cleanup） |
| `requesting-code-review` | ↗️ 传递 | opsx-finish 中提及：实现完成后执行 openspec status 和 verify.yaml 检查 |
| `verification-before-completion` | ⚪ 未使用 | 由 openspec status + verify.yaml 替代，效果等效且 schema 原生 |
| `dispatching-parallel-agents` | ⚪ 未使用 | 由 OpenCode 原生 `task(run_in_background=true)` 替代 |
| `systematic-debugging` | ⚪ 未使用 | 场景不匹配（本模板无应用代码，不需调试运行时问题） |
| `receiving-code-review` | ⚪ 未使用 | 场景不匹配（本模板非上游代码库下游接收方） |
| `using-git-worktrees` | ⚪ 未使用 | 由自定义命令直接调用 `git worktree` 替代，worktree 入口命令固化 |
| `customize-opencode` | ⚪ 未使用 | 场景不匹配（本模板不修改 OpenCode 自身配置） |
| `using-superpowers` | ⚪ 未使用 | 引导入口 meta-skill，实际运行中不产生具体工作输出 |
| `writing-skills` | ⚪ 未使用 | 场景不匹配（当前阶段不创建新的 skill） |

✅ **直接使用** — 5 个 skill 在 schema.yaml 或 OPSX 命令中通过 Read 显式加载执行
↗️ **传递使用** — 1 个 skill 在文档中引用但不直接加载（由实现步骤自然覆盖）
⚪ **未使用** — 8 个 skill 因替代方案或场景不匹配而合理不加载

---

## 工程化特性

### opencode.json Permission 规则

项目根目录的 `opencode.json` 约束 AI 的写入范围，防止误改 main 分支文件：

```json
{
  "permission": {
    "write": {
      ".worktrees/**": "allow",       // worktree 内任意写
      "openspec/**": "allow",         // artifact 和 spec
      ".opencode/**": "allow",        // 命令和 skill
      "AGENTS.md": "allow",
      "opencode.json": "allow",
      "*": "ask"                      // 其他路径（如 src/）需确认
    },
    "edit": { /* 同 write */ },
    "bash": {
      "git *": "allow",              // 常规 git 操作允许
      "git push*": "ask",            // 推送需确认
      "npm test*": "allow",          // 测试允许
      "*": "ask"                     // 其他命令需确认
    }
  }
}
```

AI 在 main 分支上直接编辑代码时会先 AskUser，确保不会被无意「写脏」主分支。
但进入 worktree（`.worktrees/<name>/`）后可以自由编辑，没有限制。

### Skill Lock 校验

`skills.lock.json` 锁定上游 Superpowers skill 文件的 SHA-256，部署时自动校验：

```json
{
  "upstream": {
    "repo": "github.com/obra/superpowers",
    "commit": "612fbcdd01be93b7e3432f04fc8a864e2c3b8a88"
  },
  "skills": {
    "brainstorming/SKILL.md": { "sha256": "BBA4..." },
    "test-driven-development/SKILL.md": { "sha256": "7DEE..." },
    "...": { "sha256": "..." }
  }
}
```

setup 脚本 Step 1.5 对比本地 skill 文件的实际 hash：
- ✅ 全部匹配 → 通过
- ⚠ hash 不匹配 → WARNING（不阻塞，但提示可能需要更新 lock 文件）

### 安装清单 + 卸载

setup 脚本写入 `openspec-bridge-install.json`，记录所有已安装的文件路径。

```bash
# 预览变更（不执行）
.\scripts\setup.ps1 -DryRun

# 卸载（按清单只删自己装过的文件）
.\scripts\setup.ps1 -Uninstall

# 覆盖已有文件
.\scripts\setup.ps1 -Force
```

> `-DryRun` 和 `-Uninstall` 不能同时使用。

---

## OpenSpec CLI 速查

```powershell
openspec new change "<name>"          # 创建变更目录
openspec status --change "<name>"     # 查看 artifact 状态
openspec instructions <id> --change "<name>"  # 获取 artifact 指令+模板
openspec schema validate <schema>     # 校验 schema
openspec schemas                      # 列出可用 schema
openspec list                         # 列出活跃变更
openspec archive -y                   # 归档变更
```

---

## 相关资源

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — Spec-driven 开发框架
- [Superpowers](https://github.com/obra/superpowers) — 开发方法论技能集合
- [OpenCode](https://opencode.ai) — AI 编程助手平台
- [上游 schema](https://github.com/JiangWay/openspec-schemas) — superpowers-bridge 原始定义
