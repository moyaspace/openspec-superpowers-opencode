# HOW IT WORKS

本项目是如何工作的——一条命令从输入到执行完毕的完整链路。

## 一句话

用户在 OpenCode 中输入 `/opsx-ff add-user-auth`，OpenCode 路由到 `.opencode/commands/opsx-ff.md`，该命令指示 AI 调用 openspec CLI、Superpowers skills（通过 Read）、Git 等工具，在隔离的 worktree 中完成变更的创建、实现和收尾。

---

## 执行链条

```
用户输入 /opsx-ff add-user-auth
        │
        ▼
┌─ OpenCode 平台 ──────────────────────────────────────────────┐
│  检测到 /opsx-ff 是 slash command                             │
│  读取 .opencode/commands/opsx-ff.md（命令入口）               │
│  把命令内容交给 AI 执行                                        │
└──────────────────────────────────────────────────────────────┘
        │
        ▼ AI（Sisyphus）按命令指示执行：
        │
  ①  git worktree add .worktrees/add-user-auth ...
  ②  cd .worktrees/add-user-auth
  ③  openspec new change "add-user-auth"
        │
        ▼
┌─ OpenSpec CLI ──────────────────────────────────────────────┐
│  读 openspec/config.yaml → schema: superpowers-bridge-opencode │
│  加载 openspec/schemas/.../schema.yaml（artifact 定义）       │
│  执行 new change 命令 → 创建变更目录                          │
└──────────────────────────────────────────────────────────────┘
        │
  ④  循环生成全部 artifacts（按依赖顺序）：
        │
        ▼
┌─ openspec instructions brainstorm --change "add-user-auth"   ┐
│  schema.yaml 的 brainstorm 段定义：                           │
│    - template: brainstorm.md（模板文件路径）                  │
│    - instruction: 载入 brainstorming skill 等                 │
│    - requires: []（无依赖，最先创建）                          │
│                                                              │
│  openspec 返回 JSON：{ template, instruction, outputPath }    │
└──────────────────────────────────────────────────────────────┘
        │
  ⑤  AI 读 template 文件，按 instruction 读 Superpowers skill，
     按 skill 内容生成 artifact 内容，写入 outputPath。
        │
  ⑥  重复 ④→⑤ 按依赖链生成全部 artifacts：
      brainstorm → proposal → specs → tasks → plan
        │
  ⑦  git add + git commit，cd 回项目根目录
     提示运行 /opsx-apply
```

---

## 各文件的角色

| 文件 | 谁读它 | 作用 |
|------|--------|------|
| `.opencode/commands/opsx-*.md` | **AI（Sisyphus）** | 告诉我每个 `/opsx-*` 命令要做什么、分几步 |
| `.opencode/skills/openspec-*-change/SKILL.md` | **AI**（通过 `skill()` 加载） | 同上，另一种加载方式，独立于平台 |
| `AGENTS.md` | **AI**（会话启动时读） | 项目级行为规则：worktree 优先、TDD 强制、子 Agent 调度映射 |
| `openspec/config.yaml` | **openspec CLI** | 选择使用哪个 schema |
| `openspec/schemas/.../schema.yaml` | **openspec CLI + AI** | 定义 artifact 类型、依赖顺序、模板路径、生成指令。AI 也读 instruction 里的约束 |
| `openspec/schemas/.../templates/*.md` | **AI** | 每个 artifact 的输出结构模板，AI 按模板填空 |
| `opencode.json` | **OpenCode 平台** | 权限控制：AI 能读/写哪些路径、执行哪些命令 |

---

## 层级关系

```
OpenCode 平台
  识别 /opsx-* 命令，路由到命令文件
  └─ .opencode/commands/opsx-*.md
      告诉 AI 执行步骤
      ├─ openspec CLI
      │   读 config → 加载 schema → 管理 artifact 生命周期
      │   ├─ schema.yaml
      │   │   定义 artifact 链、模板路径、依赖顺序
      │   │   └─ templates/*.md
      │   │       每个 artifact 的填空结构
      │   └─ 其他：new change / status / instructions / archive
      │
      ├─ Superpowers skills（通过 Read 加载）
      │   brainstorming、writing-plans、subagent-driven-development 等方法论
      │   └─ schema.yaml 的 instruction 里指定要 Read 哪些 skill 文件
      │
      ├─ Git / worktree
      │   创建隔离分支 + 目录，所有操作在 worktree 内完成
      │
      └─ task() 子 Agent（apply 阶段）
          分解 plan.md 的微任务，并行派 deep agent 实现
```

---

## 命令完整生命周期

```
   /opsx-ff              /opsx-apply              /opsx-finish
     │                       │                       │
     ▼                       ▼                       ▼
  ┌─────────┐     ┌─────────────────────┐     ┌──────────────────┐
  │ 创建    │ ──→ │ 实现                │ ──→ │ 收尾             │
  │ worktree│     │ 并行子 Agent TDD    │     │ 测试验证         │
  │ +       │     │ + 审查              │     │ retrospective    │
  │ artifacts│     │ + openspec status   │     │ archive          │
  │         │     │ + 提交              │     │ 合并 / PR        │
  └─────────┘     └─────────────────────┘     └──────────────────┘
       │                                            │
       │ 所有操作在 feature 分支                       │ 清理 worktree
       │ main 不受影响                                 │ 删除 feature 分支
```

### 创建阶段（FF）

| 步骤 | 谁执行 | 产出 |
|------|--------|------|
| `git worktree add` | AI 调 Git | `.worktrees/<name>/` 目录 + `feature/<name>` 分支 |
| `openspec new change` | AI 调 openspec CLI | 变更目录 scaffold |
| `openspec instructions <id>` | AI 调 openspec CLI | 获取 artifact 模板 + 指令 |
| Read Superpowers skill | AI 读文件 | 方法论指导（如 brainstorming 的设计探索流程） |
| 写 artifact 文件 | AI | brainstorm.md、proposal.md、specs.md、tasks.md、plan.md |

### 实现阶段（Apply）

| 步骤 | 谁执行 | 产出 |
|------|--------|------|
| `cd .worktrees/<name>` | AI | 进入隔离工作区 |
| Read implementer-prompt.md | AI | 构造子 Agent prompt |
| Read TDD SKILL.md | AI | 提取 RED-GREEN-REFACTOR 流程作为 prompt 前置指令 |
| `task(category="deep", ...)` | AI 调度 | 并行子 Agent 实现代码 |
| spec + code quality 审查 | AI 调 oracle 子 Agent | 检查实现 vs 规格一致性 |
| `openspec status` | AI 调 openspec CLI | 确认 artifacts 完成 |
| `git commit` | AI | 提交变更（仍在 worktree 内） |

### 收尾阶段（Finish）

| 步骤 | 谁执行 | 产出 |
|------|--------|------|
| 测试套件 | AI 调测试工具 | 验证 worktree 自身完好 |
| Read finishing-a-development-branch skill | AI | 合并策略方法 |
| `openspec archive` | AI 调 openspec CLI | 归档变更目录 |
| `git rebase + merge + worktree remove` | AI | 合并到 main，清理 worktree |

---

## Schema 的设计作用

`schema.yaml` 是整个流程的核心契约文件。它定义了：

1. **artifact 类型**— brainstorm、proposal、specs、tasks、plan、verify、retrospective
2. **依赖顺序**— `requires: [brainstorm]` 等字段，确保按序生成
3. **模板路径**— 每个 artifact 对应的 template 文件
4. **生成指令**— `instruction` 字段告诉 AI 如何生成该 artifact（读哪些 skill、按什么流程）
5. **apply 阶段指令**— `apply.instruction` 定义实现阶段的全流程
6. **验收标准**— 最终产出是否符合 schema 定义

`openspec config.yaml` 则是指定项目用哪个 schema 的开关。

---

## 与 README 的关系

- **README.md** — 项目的「正门」：怎么安装、怎么使用、有什么功能、到哪找详细文档
- **HOW-IT-WORKS.md** — 项目的「引擎盖」：各组件如何协作、命令执行链路、谁读什么文件
