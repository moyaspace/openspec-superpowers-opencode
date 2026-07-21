# Superpowers 双版本兼容方案

> Superpowers v5 → v6 之间的 `subagent-driven-development` skill 文件结构发生了重大变化。
> 本项目（`openspec-superpowers-opencode`）的模板文件（opsx-apply.md、schema.yaml）引用了这些 skill 文件，
> 必须同时兼容 v5 和 v6 两个版本的用户。

## 背景

在将 Superpowers pin 到 v5.1.0 后发现，v5.1.0 和 v6.1.1 的
`subagent-driven-development` 目录发生了以下结构性变化：

| 文件 | v5 | v6 |
|------|----|----|
| `SKILL.md` | 279 行 | 418 行，大幅扩展 |
| `implementer-prompt.md` | 113 行 | 139 行，重写上下文传递方式 |
| `spec-reviewer-prompt.md` | ✅ 存在 | ❌ 删除（合并为 task-reviewer-prompt.md） |
| `code-quality-reviewer-prompt.md` | ✅ 存在 | ❌ 删除（同上） |
| `task-reviewer-prompt.md` | ❌ 不存在 | 🆕 新增（一次 dispatch 返回两个 verdict） |
| `scripts/task-brief` | ❌ 不存在 | 🆕 新增（提取任务到独立文件） |
| `scripts/review-package` | ❌ 不存在 | 🆕 新增（生成 diff 包到文件） |
| `scripts/sdd-workspace` | ❌ 不存在 | 🆕 新增（解析 .superpowers/sdd/ 路径） |

详情见 [docs/superpowers-sdd-version-comparison.md](superpowers-sdd-version-comparison.md)。

## 影响范围

本项目中有 4 组文件引用了 `subagent-driven-development` 的 skill 文件：

| 文件 | 引用的 SDD 文件 | v5 有？ | v6 有？ |
|------|-----------------|---------|---------|
| `template/.opencode/commands/opsx-apply.md` | `implementer-prompt.md` | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ |
| `template/openspec/schemas/.../schema.yaml` (apply段) | `SKILL.md` | ✅ | ✅ |
| | `implementer-prompt.md` | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ |
| `template/skills.lock.json` | `spec-reviewer-prompt.md` (hash) | ✅ | ❌ |
| | `code-quality-reviewer-prompt.md` (hash) | ✅ | ❌ |
| | 其余 5 个 file locks (hash) | ✅ | ✅（但内容变了） |
| `scripts/setup.ps1` | 锁校验逻辑 | ✅ 能校验 | ❌ 遇到缺失文件报红 |

**不受影响的部分**：brainstorm、proposal、specs、tasks、plan、verify、retrospective artifact 流程；
opsx-ff、opsx-new、opsx-finish、opsx-archive 命令；template/_AGENTS.md（只引用 TDD）。

## 设计原则

1. **无侵入**：v5 用户的体验完全不变
2. **自适应**：v6 用户的模板自动走 v6 流程
3. **最小认知负担**：每份文件都保持简单，复杂度在 init 时消化
4. **最小重复**：不因 < 15 行差异复制 500+ 行代码

## 最终方案（混合策略）

不同文件采用不同的策略，因它们的特性不同：

| 文件 | 策略 | 理由 |
|------|------|------|
| `opsx-apply.md` | **单文件 + 条件分支** | 144 行中仅 ~12 行不同，不拆保持同步简单 |
| `schema.yaml` | **单文件 + 条件分支** | 531 行中仅 ~12 行不同，拆分会导致 520 行重复 |
| `skills.lock.json` | **拆为 v5/v6 两个文件** | 内容是 hash 数据，无重叠可共享；v2 分组格式增加复杂度 |
| `setup.ps1` / `setup.sh` | **检测版本 → 选对应 lock 文件** | init 时读取 superpowers version，决定加载哪个 lock |

## 方案详述

### A. `opsx-apply.md` — 保持单文件，内联条件分支

**Step 4a Pre-flight**（第 58-69 行）：

```
当前（v5 only）：
  Read implementer-prompt.md
  Read spec-reviewer-prompt.md          ← v5 only
  Read code-quality-reviewer-prompt.md  ← v5 only

改为：
  Read implementer-prompt.md（v5/v6 共有）

  检测 task-reviewer-prompt.md 是否存在：
    ✅ 存在（v6）→ 记下 v6 模式，审查时用它
    ❌ 不存在（v5）→ 回退到 spec-reviewer-prompt.md + code-quality-reviewer-prompt.md

  再检测 scripts/task-brief 是否存在：
    ✅ 存在（v6）→ 上下文传递走文件模式
    ❌ 不存在（v5）→ 走粘贴全文模式
```

**Step 5 上下文传递**（第 71-93 行）：

```
v6 模式：
  scripts/task-brief PLAN_FILE N  →  task-N-brief.md
  implementer 返回只报摘要（status + commits + 一行测试摘要）
  审查前跑 scripts/review-package BASE HEAD  →  diff 文件

v5 模式：
  粘贴任务全文到 prompt（原行为不变）
  implementer 完整返回
  审查时直接 Read 代码
```

**Step 6 审查**（第 95-111 行）：

```
v6 模式 → task-reviewer-prompt.md（一次 dispatch 两个 verdict）
v5 模式 → spec-reviewer-prompt.md + code-quality-reviewer-prompt.md（两次 dispatch）
```

其他步骤（Step 1-3, 7-8）不受影响。

### B. `schema.yaml` — 保持单文件，内联条件分支

与 opsx-apply.md 相同的条件分支逻辑，写入 `apply.instruction`。

仅 3 处需要改动（共 ~12 行）：

1. **Pre-flight 检查清单**（第 452-461 行）：`task-reviewer-prompt.md` 优先，不存在则回退
2. **Executor 审查方式说明**（第 499-501 行）：描述两种审查流程
3. 其余约 440 行 artifact instruction **完全不变**

### C. `skills.lock.json` — 拆为两个文件

不再使用 v2 分组格式。改为 init 时根据版本部署对应的 lock 文件：

```
template/
├── skills.lock.v5.json    ← v5 用户部署为 skills.lock.json
└── skills.lock.v6.json    ← v6 用户部署为 skills.lock.json
```

**`skills.lock.v5.json`**（从现有 lock 提取 v5 段）：

```json
{
  "schema": "@moyaspace/openspec-superpowers-opencode/skills-lock",
  "version": 1,
  "upstream": {
    "repo": "github.com/obra/superpowers",
    "commit": "612fbcdd01be93b7e3432f04fc8a864e2c3b8a88"
  },
  "skills": {
    "brainstorming/SKILL.md": "BBA47904A7F6BBEE3BF8A107EEBE84E65D392BE683BBB898DED736B29E415F90",
    "writing-plans/SKILL.md": "90056BAD3D5F196FA7C9FEC0FFE592E6D9C86BC983E406642A51D1A4198B7024",
    "subagent-driven-development/SKILL.md": "081AD3869E55C80BF8F890B4768A90C0E8057DAF94B1B6FADEBFC85EA5B8304A",
    "subagent-driven-development/implementer-prompt.md": "A416193F881E5A712C988FFFABFE1D5A97BFFCD091EB95577C84FE2136588617",
    "subagent-driven-development/spec-reviewer-prompt.md": "631980E472EEC5394DE8B89B69D432E54FD3F7F523ECF9AFA7EB4CDA0C9B2BAF",
    "subagent-driven-development/code-quality-reviewer-prompt.md": "06D1E7C2287E5A00BD1809BF39038ABD5F413B4CF917C37D30F00C48F6293421",
    "test-driven-development/SKILL.md": "7DEE67B4AF6BDCCC7A914CA34533184D64592D0F5B23AEAE631538168DB14994"
  }
}
```

**`skills.lock.v6.json`**（新增）：

```json
{
  "schema": "@moyaspace/openspec-superpowers-opencode/skills-lock",
  "version": 1,
  "upstream": {
    "repo": "github.com/obra/superpowers",
    "commit": "<v6.1.1 对应 commit>"
  },
  "skills": {
    "brainstorming/SKILL.md": "<待计算>",
    "writing-plans/SKILL.md": "<待计算>",
    "subagent-driven-development/SKILL.md": "<待计算>",
    "subagent-driven-development/implementer-prompt.md": "<待计算>",
    "subagent-driven-development/task-reviewer-prompt.md": "<待计算>",
    "test-driven-development/SKILL.md": "<待计算>"
  }
}
```

两个文件都是**标准的 v1 flat 结构**，setup 脚本无需处理任何分组逻辑。

### D. `setup.ps1` / `setup.sh` — 版本检测 + 自适应部署

**Step 1.5（锁校验）** 核心改动：

```
1. 读取 superpowers/package.json → major 版本号（"5" 或 "6"）

2. 根据 major 选择锁文件路径：
   - v5 → template/skills.lock.v5.json
   - v6 → template/skills.lock.v6.json

3. 读取所选锁文件，逐条校验（与现有 v1 逻辑完全一致）：
   - 文件存在 + hash 匹配 → ✓
   - 文件存在 + hash 不匹配 → ⚠ WARNING
   - 文件不存在 → ✗（但版本特有的文件本来就不会出现在对应锁文件中）
```

**新增加的 init 步骤**：在部署阶段：

```
检测到 superpowers v6 → 把 skills.lock.v6.json 部署为 skills.lock.json
检测到 superpowers v5 → 把 skills.lock.v5.json 部署为 skills.lock.json
```

> 注意：`skills.lock.json` 本身不在目标项目中使用（仅在 init 时校验用）。
> 部署到 `template/skills.lock.json` 是为了 Step 1.5 的校验流程能读取到。

## 不变的内容

以下内容**不需要修改**：

- ❌ `template/_AGENTS.md` — 只引用了 `test-driven-development/SKILL.md`，两版本都有
- ❌ `opsx-finish.md` — 只引用了 `finishing-a-development-branch/SKILL.md`，文件未变
- ❌ `template/_gitignore`、`_gitattributes`、`_editorconfig` — 与 Superpowers 版本无关
- ❌ Brainstorm、proposal、specs、tasks、plan、verify、retrospective 的 schema instruction — 不引用 SDD

## 执行步骤

```
[1] 升级到 v6（取消 pin）
    → 编辑 ~/.config/opencode/opencode.json，去掉 #v5.1.0
    → 删除 packages/superpowers@git+https_/ 缓存
    → 重启 OpenCode → 确认版本为 v6.1.1

[2] 计算 v6 文件 hash
    → 获取 v6.1.1 的 git commit hash
    → 对 skills.lock.v6.json 中每个文件算 SHA-256

[3] 创建 skills.lock.v6.json
    → flat v1 结构，只列 v6 存在的文件

[4] 改 skills.lock.v5.json
    → 从原有 skills.lock.json 提取

[5] 删除原有 skills.lock.json（改为两个 v5/v6 文件）

[6] 改 opsx-apply.md
    → Pre-flight 增加版本检测
    → Step 5 增加 task-brief 分支
    → Step 6 改为条件分支审查

[7] 改 schema.yaml
    → apply.instruction 中 3 处改为条件分支

[8] 改 setup.ps1 + setup.sh
    → 锁校验阶段：检测版本 → 选择对应 lock 文件 → 原逻辑校验
    → init 部署阶段：根据版本选择部署哪个 lock 文件

[9] 验证
    → 当前 v6 环境 → setup → 所有 ✓
    → 切换到 v5 环境 → setup → 所有 ✓
    → opsx-apply 在两个版本中正常运行
```

## 方案依据

以上对 v6 流程的描述（task-brief、review-package、task-reviewer-prompt 一次审查两个 verdict）
均来自 v6.1.1 `SKILL.md` 的原文，逐条验证如下：

### `scripts/task-brief` — 「提取任务到文件，dispatch 只传路径」

§Context Cost（第 225-227 行）：

> **Task brief:** before dispatching an implementer, run this skill's
> `scripts/task-brief PLAN_FILE N` — it extracts the task's full text to a
> **uniquely named file** and prints the path.

### `scripts/review-package BASE HEAD` — 「先跑脚本生成 diff 文件」

§Handling Implementer Status（第 136 行）：

> **DONE:** Generate the review package (`scripts/review-package BASE HEAD` …),
> then **dispatch the task reviewer with the printed path.**

§Constructing Reviewer Prompts（第 181-188 行）：

> **Hand the reviewer its diff as a file:** run this skill's
> `scripts/review-package BASE HEAD` and pass the reviewer the path it prints.

### `task-reviewer-prompt.md` — 「一次 dispatch 两个 verdict」

§Prompt Templates（第 269 行）：

> [task-reviewer-prompt.md](task-reviewer-prompt.md) — Dispatch task reviewer
> subagent (**spec compliance + code quality**)

### v5 → v6 文件变更

§RELEASE-NOTES.md v6.0.0 Visible Changes：

> The two per-task reviewer prompts became one. `spec-reviewer-prompt.md` and
> `code-quality-reviewer-prompt.md` are gone, replaced by a single `task-reviewer-prompt.md`.

## 备选方案

如果不做双版本兼容，也可以：

- **放弃 v5 支持**：只适配 v6，要求所有用户升级到 v6。简单，但破坏向后兼容。
- **放弃 v6 支持**：保持现状，只适配 v5。但大多数用户会用 npm 安装的最新版（v6），会报错。
- **软检测不锁 hash**：去掉 lock 文件，改为运行时 Read 检测。失去完整性校验但最简单。

最终选择双版本兼容方案，是在**向后兼容**和**完整性校验**之间的平衡。
