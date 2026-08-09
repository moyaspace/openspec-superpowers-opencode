# 项目功能与特性总结

## 项目定位

**openspec-superpowers-opencode** 是一个项目模板脚手架工具，将 **Superpowers 方法论** 通过 **OpenSpec** 的 artifact 治理框架桥接到 **OpenCode** 平台。它不是应用代码项目，而是**基础设施/工作流项目**。

---

## 一、CLI 工具

### `openspec-superpowers-opencode` CLI

| 命令 | 功能 |
|------|------|
| `init [目录]` | 一键初始化：`git init` → 模板部署 → 验证 → 首次提交 |
| `reset` | 按安装清单精确卸载，只删自己装过的文件 |
| `dry-run` | 预览变更，不实际写入 |
| `verify` | 5 项系统完整性检查（垫片、注册表、worktree） |
| `registry <add\|remove\|list\|verify\|reset>` | 活跃变更注册表管理 |
| `install-shims` | 安装 openspec 垫片脚本（拦截 list 实现跨 worktree 合并） |
| `uninstall-shims` | 恢复原版 openspec |
| `ensure-worktree <name>` | 确保变更的 git worktree 已创建 |
| `remove-worktree <name>` | 删除 worktree 目录 + 分支 |
| `create-openspec-superpowers-opencode` | 别名，等同于 `init` |

**多语言支持**：`--lang zh-CN | zh-TW | en`，帮助文本、错误消息、安装日志全部本地化。

---

## 二、OPSX 命令（OpenCode 内使用）

初始化后，项目内可通过 13 个 `/opsx-*` 命令驱动完整工作流：

| 命令 | 功能 | 阶段 |
|------|------|:----:|
| `/opsx-ff <name>` | **全量创建变更** — 创建 worktree → 生成全部 7 个 artifacts → commit → 回 main | 🔵 创建 |
| `/opsx-new <name>` | **逐步创建** — 创建 worktree + 变更 scaffold | 🔵 创建 |
| `/opsx-propose <描述>` | **快速提案** — worktree → proposal + design + tasks | 🔵 创建 |
| `/opsx-continue` | 在已有 worktree 内递增创建下一个 artifact | 🔵 创建 |
| `/opsx-apply` | **实现阶段** — 进入 worktree → 子 Agent TDD 编码 → 审查 → 提交 | 🟢 实现 |
| `/opsx-verify` | 验证实现 vs 规格（7 项检查清单） | 🟡 验证 |
| `/opsx-finish` | **收尾阶段** — 测试 → retrospective → archive → 合并/PR/清理 | 🔴 收尾 |
| `/opsx-remove <name>` | 取消变更 — 删除注册表条目 + worktree 目录 + 分支 | 🔴 收尾 |
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
| **绿地基**（新项目） | 目标目录不存在 或 为空 | 全自动部署全部文件，无需任何询问 |
| **棕地基**（已有项目） | 目标目录存在且有文件 | 门控询问 → 8 类棕地覆盖决策 |

### 5.2 棕地覆盖决策系统

通过 `BROWN_OVERRIDE_*` 环境变量支持无交互自动化测试：

| 变量 | 控制对象 | 可选值 |
|------|---------|--------|
| `BROWN_OVERRIDE_INIT` | 是否继续完整初始化棕地项目 | yes / no |
| `BROWN_OVERRIDE_OPENSPEC` | 是否覆盖 `openspec/config.yaml + schemas/` | yes / no |
| `BROWN_OVERRIDE_OCODEJSON` | 是否合并 `.opencode/opencode.json` | yes / no |
| `BROWN_OVERRIDE_COMMANDS` | 是否覆盖 `.opencode/commands/` | yes / no / ask |
| `BROWN_OVERRIDE_SKILLS` | 是否覆盖 `.opencode/skills/` | yes / no / ask |
| `BROWN_OVERRIDE_AGENTS` | 是否替换 AGENTS.md 托管区块 | yes / no |
| `BROWN_OVERRIDE_GITIGNORE` | 是否替换 `.gitignore` 托管区块 | yes / no |
| `BROWN_OVERRIDE_GITATTR` | 是否替换 `.gitattributes` 托管区块 | yes / no |
| `BROWN_OVERRIDE_EDITORCONFIG` | 是否替换 `.editorconfig` 托管区块 | yes / no |
| `BROWN_OVERRIDE_REGISTRY` | 注册表初始策略（创建空注册表 or 跳过） | create / skip |

三种决策模式：
- **yes** — 全量覆盖
- **no** — 已有文件跳过，新文件部署
- **ask** — 逐文件交互式询问

### 5.3 智能合并

`opencode.json` 不再使用硬编码的 allow/deny 列表（如 `.worktrees/**` 权限），改为**模板 authority 模式** — 由 `template/.opencode/opencode.json` 定义完整的安全策略，所有覆盖决策通过棕地门控系统（`BROWN_OVERRIDE_OCODEJSON`）逐项确认。AGENTS.md 已有则追加 bridge 内容，不覆盖。

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
| **跨平台** | Windows + Linux + macOS，通过 unified JS 安装器（`lib/setup/`）统一实现，输出完全一致 |
| **路径自适应** | `{{SUPERPOWERS_BASE_PATH}}` 占位符在安装时替换为实际路径 |
| **权限约束** | `opencode.json` 限制 AI 写入范围，防止污染 main 分支 |
| **占位符替换** | 4 个文件（schema.yaml、AGENTS.md、opsx-apply.md、opsx-finish.md）自动替换 |
| **语言文件清理** | 安装后自动清理非首选语言的多余文件 |
| **幂等性** | 重复运行 safe，已有文件按决策规则处理 |
| **npm 可发布** | 包名 `openspec-superpowers-opencode`，支持全局安装和 npx 使用 |

---

## 八、活跃变更注册表与系统验证 [⭐ 核心特性]

### 问题

本项目所有变更在 **git worktree** 中隔离开发（`main` 不直接产生变更）。这带来了一个**可见性鸿沟**：

```
openspec list（在 main 上执行）
  → 扫描 openspec/changes/           ← main 上只有归档变更
  → 看不到 .worktrees/<name>/ 里的活跃变更
```

AI agent 通过 `openspec list` 了解当前有哪些活跃变更，但如果看不到 worktree 中的变更，就无法切换上下文、无法感知并行进度。注册表系统填补了这个鸿沟——它在 main 上维护一份轻量索引，让 `openspec list` 能跨所有 worktree 聚合展示活跃变更。

配套的 **verify 命令**和**垫片脚本系统**进一步保障这个机制的可靠性：verify 检查垫片是否就位、注册表是否完好；垫片脚本拦截 `openspec list` 自动完成合并，用户和 AI 无感。

```
main（干净）
  ├── openspec/oso-change-registry.json   ← 索引：所有 worktree 中的活跃变更
  └── .worktrees/
        ├── feature-login/                ← worktree 内的 openspec list 实时数据
        └── feature-auth/

openspec list（经垫片拦截）
  → 读注册表获知 worktree 路径列表
  → 遍历每个 worktree 执行 openspec-orig list
  → 合并输出 → 用户/AI 看到完整视图
```

### 8.1 活跃变更注册表 (`oso-change-registry.json`)

项目根 `openspec/oso-change-registry.json` 维护一个轻量**索引**，记录所有 worktree 中的活跃变更：

```json
{
  "changes": [
    { "name": "feature-login", "worktree": ".worktrees/feature-login", "createdAt": "2026-07-04T00:00:00.000Z" }
  ]
}
```

注册表只存**变更名 + worktree 路径**，不存状态——状态由各 worktree 内 `openspec list` 实时获取。

#### 生命周期

| 事件 | 操作 | 触发命令 |
|------|------|---------|
| 创建变更 | `registry add <name> <worktree>` | `/opsx-new`, `/opsx-propose`, `/opsx-ff` |
| 归档/完成 | `registry remove <name>` | `/opsx-finish` |
| 人工诊断 | `registry list` / `registry verify` | 手动调用 |

### 8.2 Registry CLI 子命令

| 命令 | 功能 | 交互 |
|------|------|------|
| `registry add <name> <worktree>` | 添加/覆盖变更条目 | 无终端交互，exit code 指示结果 |
| `registry remove <name>` | 删除变更条目 | 同上 |
| `registry list` | 格式化输出所有活跃变更 | 只读 |
| `registry verify` | 轻量验证（注册表 JSON + worktree 目录存在性） | 只读 |
| `registry reset` | 重置注册表为空（可选备份原文件为 `.bak`） | 无交互 |

所有 registry 子命令专为 AI agent 调用设计——输出结构化文本 + exit code，不请求终端输入。

### 8.3 垫片脚本系统

为解决跨 worktree 变更可见性问题，安装程序（`install-shims`）在系统 PATH 中替换原版 `openspec` 为垫片脚本：

```
安装前：openspec → openspec（原版 CLI）
安装后：openspec → 垫片脚本（拦截 list），openspec-orig → openspec（重命名保留）
```

#### 平台对应

| 平台 | 垫片脚本 | 原版备份 |
|------|---------|---------|
| Unix/macOS | `openspec` | `openspec-orig` |
| Windows CMD | `openspec.cmd` | `openspec-orig.cmd` |
| Windows PS | `openspec.ps1` | `openspec-orig.ps1` |

#### 拦截规则

垫片**只拦截** `openspec list`，其余全部透传 `openspec-orig`。

| 命令 | 拦截？ | 理由 |
|------|:----:|------|
| `list` | ✅ | 根目录执行，需合并所有 worktree 变更 |
| `status`, `new`, `instructions`, `archive` | ❌ | 在 worktree 内执行，透传即正确 |

垫片拦截后全部委托 `registry-utils.js`，后者内部有双重透传决策：

```
openspec list → 垫片拦截（条件：TOOL_DIR 有效 && 参数是 list）
  → registry-utils.js list
    → 非 git 项目？           → 透传 openspec-orig list
    → 不在项目/无注册表？        → 透传 openspec-orig list
    → 注册表存在且有 worktree？ → 遍历合并输出
```

这样就保证了：**装了垫片但没用 oso 的项目**（如纯 openspec 项目），`openspec list` 行为与原版完全一致。

#### 垫片检测标记

每份垫片脚本首行包含唯一特征标记，供 `registry verify` 检测垫片完整性：

| 平台 | 标记行 |
|------|--------|
| Unix shell | `# openspec shim for oso registry` |
| Windows CMD | `@rem openspec shim for oso registry` |
| Windows PS | `# openspec shim for oso registry` |

### 8.4 verify 顶层命令（5 项系统完整性检查）

```bash
openspec-superpowers-opencode verify
```

| # | 检查项 | 失败修复 |
|---|--------|---------|
| 1 | `openspec` — CLI 是否在 PATH 中 | 安装 `@fission-ai/openspec` |
| 2 | `openspec-orig` — 原版 CLI 备份是否存在 | `install-shims` |
| 3 | `openspec (shim)` — 当前 `openspec` 是否为垫片脚本 | `install-shims` |
| 4 | `oso-change-registry.json` — JSON 有效且可解析 | `registry reset` 或 `init` |
| 5 | `worktrees` — 注册表中所有 worktree 目录存在 | `registry remove` 清理孤立条目 |

输出格式：
```
✓ openspec: installed at /usr/local/bin/openspec
✓ openspec-orig: found at /usr/local/bin/openspec-orig
✓ openspec (shim): is shim script
✓ oso-change-registry.json: valid (2 changes)
✓ worktrees: all present
```

- 全 ✓ → exit code 0
- 有 ⚠ → exit code 1（AI agent 读取输出后决定是否询问用户修复）
- 非项目目录中检查 4+5 → ∼ skip

### 8.5 安装/卸除垫片

```bash
# 安装垫片脚本
openspec-superpowers-opencode install-shims

# 卸除垫片脚本，恢复原版 openspec
openspec-superpowers-opencode uninstall-shims
```

安装采用 **copy + write** 策略，规避文件锁：先复制原版为 openspec-orig，然后写入垫片脚本到同名文件。
卸除则反过来：删除垫片文件，将 openspec-orig 重命名回 openspec。

### 8.6 Opsx 集成

| opsx 命令 | 注册表操作 | 集成方式 |
|-----------|-----------|---------|
| `/opsx-apply` | 执行前先跑 `verify` | 7 个 opsx 命令在 listing 前插入 verify 步骤 |
| `/opsx-ff` / `/opsx-new` / `/opsx-propose` | `registry add` | 创建变更后自动注册 |
| `/opsx-finish` | `registry remove` | 归档后移除注册表条目 |
| `/opsx-remove` | `registry remove` + 清理 worktree | 删除注册表条目，再删除 worktree 目录 + 分支 |
| `/opsx-verify` / `/opsx-explore` / `/opsx-continue` / `/opsx-archive` / `/opsx-bulk-archive` / `/opsx-sync` | 执行前先跑 `verify` | 系统闸门，确保垫片和注册表正常 |
