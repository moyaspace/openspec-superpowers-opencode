# 项目功能与特性总结

## 项目定位

**openspec-superpowers-opencode** 是一个项目模板脚手架工具，将 **Superpowers 方法论** 通过 **OpenSpec** 的 artifact 治理框架桥接到 **OpenCode** 平台。它不是应用代码项目，而是**基础设施/工作流项目**。

---

## 一、CLI 工具

### `openspec-superpowers-opencode` CLI

| 命令 | 功能 |
|------|------|
| `init [目录]` | 一键初始化：`git init` → 复制模板 → setup 脚本 → 首次提交 |
| `reset` | 按安装清单精确卸载，只删自己装过的文件 |
| `dry-run` | 预览变更，不实际写入 |
| `ensure-worktree <name>` | 确保变更的 git worktree 已创建 |
| `create-openspec-superpowers-opencode` | 别名，等同于 `init` |

**多语言支持**：`--lang zh-CN | zh-TW | en`，帮助文本、错误消息、安装日志全部本地化。

---

## 二、OPSX 命令（OpenCode 内使用）

初始化后，项目内可通过 12 个 `/opsx-*` 命令驱动完整工作流：

| 命令 | 功能 | 阶段 |
|------|------|:----:|
| `/opsx-ff <name>` | **全量创建变更** — 创建 worktree → 生成全部 7 个 artifacts → commit → 回 main | 🔵 创建 |
| `/opsx-new <name>` | **逐步创建** — 创建 worktree + 变更 scaffold | 🔵 创建 |
| `/opsx-propose <描述>` | **快速提案** — worktree → proposal + design + tasks | 🔵 创建 |
| `/opsx-continue` | 在已有 worktree 内递增创建下一个 artifact | 🔵 创建 |
| `/opsx-apply` | **实现阶段** — 进入 worktree → 子 Agent TDD 编码 → 审查 → 提交 | 🟢 实现 |
| `/opsx-verify` | 验证实现 vs 规格（7 项检查清单） | 🟡 验证 |
| `/opsx-finish` | **收尾阶段** — 测试 → retrospective → archive → 合并/PR/清理 | 🔴 收尾 |
| `/opsx-archive` | 同步 delta spec + 归档变更目录 | 🔴 收尾 |
| `/opsx-explore` | 纯思考模式，不创建变更 | 🔍 探索 |
| `/opsx-onboard` | 引导式入门 | 🚀 引导 |
| `/opsx-bulk-archive` | 批量归档变更 | 🔴 收尾 |
| `/opsx-sync` | 同步 spec 文件 | 🔄 同步 |

---

## 三、Git Worktree 隔离机制 [⭐ 核心特性]

每个变更通过 **git worktree** 完全隔离：

```
主仓库 (main)
├── .git/                        # 共享 Git 对象库
├── 项目文件                      # 主分支，始终干净
└── .worktrees/
    └── <变更名称>/               # 每个变更的隔离工作区
        ├── 项目文件              # feature/<name> 分支的工作副本
        └── .git                  # 指向共享 .git
```

### 隔离保障

| 机制 | 说明 |
|------|------|
| **main 始终干净** | artifacts 和代码都在 feature 分支生成 |
| **git 忽略** | `.worktrees/` 在 `.gitignore` 中排除，不会被意外追踪 |
| **opencode.json 权限** | AI 在 main 上写 `src/` 等路径需 AskUser 确认 |
| **幂等性** | 重复运行 `/opsx-apply` 自动跳过已完成步骤 |
| **可中断** | 可随时切换变更，不需要 finish 当前变更 |

### 生命周期

```
/opsx-ff / /opsx-new / /opsx-propose
  └→ 创建 worktree + artifacts (feature 分支)
        └→ /opsx-apply
              └→ 实现代码 (worktree 内)
                    └→ /opsx-finish
                          └→ 测试 → 合并回 main → 清理 worktree
```

---

## 四、多层架构设计 [⭐ 核心特性]

```
Superpowers skills (HOW - 执行方法论)
    ↓
OpenSpec 架构 (WHAT - artifact 治理)
    ↓
Git worktree (WHERE - 隔离环境)
    ↓
OPSX 命令 (WHEN - 流程编排)
```

| 层 | 职责 | 具体内容 |
|----|------|---------|
| **Superpowers** | 执行方法论 | brainstorming → writing-plans → subagent-dev(+TDD+review) → finishing-branch |
| **OpenSpec** | 定义产出物 | brainstorm → proposal → specs → tasks → plan → verify → retrospective |
| **Git worktree** | 提供隔离 | 每个变更独立目录 + 独立分支，main 始终干净 |
| **OPSX 命令** | 编排流程 | ff/new/propose 创建 → apply 实现 → finish 合并 |

### 用到 5 个 Superpowers Skills

| Skill | 用途 |
|-------|------|
| `brainstorming` | 变更创建时的意图探索和需求设计 |
| `writing-plans` | 将设计分解为可执行的微任务 |
| `subagent-driven-development` | 调度子 Agent 执行 TDD 编码 + 审查 |
| `test-driven-development` | 强制 RED → GREEN → REFACTOR 流程 |
| `finishing-a-development-branch` | 结构化的合并/PR/清理选项 |

---

## 五、智能安装与部署

### 5.1 Greenfield / Brownfield 双模式

| 模式 | 检测条件 | 行为 |
|------|---------|------|
| **绿地基**（新项目） | `openspec/` 不存在 | 自动部署全部文件，无需询问 |
| **棕地基**（已有项目） | `openspec/` 或 `.opencode/` 已存在 | 门控询问 + 逐项决策 |

### 5.2 棕地覆盖决策系统

通过 `BROWN_OVERRIDE_*` 环境变量支持自动化测试：

| 变量 | 控制对象 | 可选值 |
|------|---------|--------|
| `BROWN_OVERRIDE_OPENSPEC` | 是否覆盖 `openspec/config.yaml + schemas/` | yes / no |
| `BROWN_OVERRIDE_COMMANDS` | 是否覆盖 `.opencode/commands/` | yes / no / ask |
| `BROWN_OVERRIDE_SKILLS` | 是否覆盖 `.opencode/skills/` | yes / no / ask |

三种决策模式：
- **yes** — 全量覆盖
- **no** — 已有文件跳过，新文件部署
- **ask** — 逐文件交互式询问

### 5.3 智能合并

`opencode.json` 使用 **union merge** — 用户已有权限保留，模板的 required 路径（`.worktrees/**`、`openspec/**`、`.opencode/**`）强制补入。AGENTS.md 已有则追加 bridge 内容，不覆盖。

---

## 六、完整性保障

### Skill Lock 校验

`skills.lock.json` 锁定 7 个 Superpowers skill 文件的 **SHA-256 哈希值**，部署时自动校验：
- ✅ 全部匹配 → 通过
- ⚠ hash 不匹配 → WARNING（不阻塞，提示更新 lock 文件）

### 安装清单

`install-manifest.json` 精确记录每个已安装文件和覆盖决策，`reset` 命令按清单精准卸载，不误删用户文件。

### 工作流验证

setup 脚本执行 **6 项端到端验证**：
1. 模板路径解析（验证 8+ 个 project 源模板）
2. 测试变更创建
3. 变更列表确认
4. Artifact 链完整性（8+ 个 artifact）
5. 指令生成正常
6. Schema 格式验证

---

## 七、工程化特性

| 特性 | 说明 |
|------|------|
| **跨平台** | Windows（`setup.ps1`）+ Linux（`setup.sh`），共享同一套模板 |
| **路径自适应** | `{{SUPERPOWERS_BASE_PATH}}` 占位符在安装时替换为实际路径 |
| **权限约束** | `opencode.json` 限制 AI 写入范围，防止污染 main 分支 |
| **占位符替换** | 4 个文件（schema.yaml、AGENTS.md、opsx-apply.md、opsx-finish.md）自动替换 |
| **语言文件清理** | 安装后自动清理非首选语言的多余文件 |
| **幂等性** | 重复运行 safe，已有文件按决策规则处理 |
| **npm 可发布** | 包名 `openspec-superpowers-opencode`，支持全局安装和 npx 使用 |
