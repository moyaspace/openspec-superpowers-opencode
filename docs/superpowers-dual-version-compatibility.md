# Superpowers 多版本兼容方案（v5 / v6 / v7）

> Superpowers v5 → v6 之间的 `subagent-driven-development` skill 文件结构发生了重大变化，
> v7 又在 v6 的基础上扩展了同目录内的配套文件。
> 本项目（`openspec-superpowers-opencode`）的模板文件（opsx-apply.md、schema.yaml）引用了这些 skill 文件，
> 必须同时兼容 v5、v6、v7 三个版本的用户。

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

**v7 的安装位置与 v6 相同。** OpenCode 侧两者的 skills 目录都落在
`~/.cache/opencode/packages/superpowers@*/node_modules/superpowers/skills`，
不存在「v7 改了安装路径」这回事，路径探测逻辑无需为 v7 增加分支。
v7 的主要差异集中在 `subagent-driven-development/` 目录内部，另有 brainstorming 语义变化与新增 diagnosing-superpowers 技能：新增 `references/` 七份文档
与 `re-review-prompt.md`，`SKILL.md` 随之把 fix loop、final review 等细节下沉到这些文件。
因此在 OSO 侧，v7 与 v6 共用同一条 apply 分支（v6+ 委托上游 SDD）。

## 三版本对照（v5 / v6 / v7）

| 项目 | v5 | v6 | v7 |
|------|----|----|----|
| SDD 目录文件 | `implementer-prompt.md`、`spec-reviewer-prompt.md`、`code-quality-reviewer-prompt.md` | `implementer-prompt.md`、`task-reviewer-prompt.md`、`scripts/{task-brief,review-package,sdd-workspace}` | 同 v6，另加 `references/`（7 份）与 `re-review-prompt.md` |
| 审查方式 | 两步：spec → code quality | 单步：spec + quality 一次 | 单步 + fix-loop + final review（细节在 `references/`） |
| OSO apply 分支 | 自编排（Read 4 个文件 + 手工构造 prompt + 两步 oracle 审查） | 委托上游 SDD（Read `SKILL.md` + 确认三脚本；三节 OSO 约定） | 同 v6 |
| 锁清单 | `skills.lock.v5.json`（拼凑值，见问题②） | `skills.lock.v6.json`（已刷新 v6.4.2） | `skills.lock.v7.json`（新增，v7.0.1） |

- v7 `references/` 七份：`preflight.md`、`batching.md`、`handling-reports.md`、`fix-loop.md`、`final-review.md`、`resuming.md`、`cannot-verify.md`。
- v7 的 `skills/` 共 15 个技能（v6.1.1 为 14 个），新增 `diagnosing-superpowers`。
- v6 与 v7 共用同一条 v6+ 分支，v5 分支保持零改动。

## 影响范围

本项目中有 4 组文件引用了 `subagent-driven-development` 的 skill 文件：

| 文件 | 引用的 SDD 文件 | v5 | v6 | v7 |
|------|-----------------|----|----|----|
| `template/.opencode/commands/opsx-apply.md` | `implementer-prompt.md` | ✅ | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `task-reviewer-prompt.md` | ❌ | ✅ | ✅ |
| `template/openspec/schemas/.../schema.yaml` (apply段) | `SKILL.md` | ✅ | ✅ | ✅ |
| | `implementer-prompt.md` | ✅ | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `task-reviewer-prompt.md` | ❌ | ✅ | ✅ |
| `template/skills.lock.v5.json` / `.v6.json` / `.v7.json` | 各版本实际存在的文件 (hash) | ✅ | ✅ | ✅ |
| `src/setup/discovery.ts` + `src/setup/index.ts` | 锁文件选择与校验 | ✅ 能校验 | ✅ 能校验 | ✅ 能校验 |

v7 与 v6 的引用关系一致；v5 的 `spec-reviewer-prompt.md` 与 `code-quality-reviewer-prompt.md`
不在任何 v6+ 锁文件中，因此不会触发误报。

**不受影响的部分**：brainstorm、proposal、specs、tasks、plan、verify、retrospective artifact 流程；
opsx-ff、opsx-new、opsx-finish、opsx-archive 命令；template/_AGENTS.md（只引用 TDD）。

## 设计原则

1. **无侵入**：v5 用户的体验完全不变
2. **自适应**：v6+ 用户的模板自动走 v6+ 流程
3. **最小认知负担**：每份文件都保持简单，复杂度在 init 时消化
4. **最小重复**：不因 < 15 行差异复制 500+ 行代码

## 最终方案（混合策略）

不同文件采用不同的策略，因它们的特性不同：

| 文件 | 策略 | 理由 |
|------|------|------|
| `opsx-apply.md` | **单文件 + 条件分支** | 约 250 行中仅 ~12 行不同，不拆保持同步简单 |
| `schema.yaml` | **单文件 + 条件分支** | 约 650 行中仅 ~12 行不同，拆分会造成大段重复 |
| `skills.lock.v5.json` / `.v6.json` / `.v7.json` | **按主版本拆为三个文件** | 内容是 hash 数据，无重叠可共享；按 Superpowers 主版本精确匹配 |
| `src/setup/` + `src/verify.ts` | **TypeScript 部署实现 + 健康检查** | 由早期 `setup.ps1` / `setup.sh` 迁到 `src/setup/`，`src/verify.ts` 负责校验与告警 |

## 方案详述

### A. `opsx-apply.md` — 保持单文件，内联条件分支

> 历史设计：本节描述 v5 → v6 初期的「条件自编排」方案。v6+ 现已改为委托上游 SDD（见上文三版本对照），此处的 v6 部分仅作演进记录。

**Step 4a Pre-flight**（历史行号已失效，仅示意）：

```
当前（v5 only）：
  Read implementer-prompt.md
  Read spec-reviewer-prompt.md          ← v5 only
  Read code-quality-reviewer-prompt.md  ← v5 only

改为：
  Read implementer-prompt.md（v5 与 v6+ 共有）

  检测 task-reviewer-prompt.md 是否存在：
    ✅ 存在（v6）→ 记下 v6 模式，审查时用它
    ❌ 不存在（v5）→ 回退到 spec-reviewer-prompt.md + code-quality-reviewer-prompt.md

  再检测 scripts/task-brief 是否存在：
    ✅ 存在（v6）→ 上下文传递走文件模式
    ❌ 不存在（v5）→ 走粘贴全文模式
```

**Step 5 上下文传递**（历史行号已失效，仅示意）：

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

**Step 6 审查**（历史行号已失效，仅示意）：

```
v6 模式 → task-reviewer-prompt.md（一次 dispatch 两个 verdict）
v5 模式 → spec-reviewer-prompt.md + code-quality-reviewer-prompt.md（两次 dispatch）
```

其他步骤（Step 1-3, 7-8）不受影响。

### B. `schema.yaml` — 保持单文件，内联条件分支

> 历史设计：本节描述 v5 → v6 初期的「条件自编排」方案。v6+ 现已改为委托上游 SDD（见上文三版本对照），此处的 v6 部分仅作演进记录。

与 opsx-apply.md 相同的条件分支逻辑，写入 `apply.instruction`。

仅 3 处需要改动（共 ~12 行）：

1. **Pre-flight 检查清单**（历史行号已失效，仅示意）：`task-reviewer-prompt.md` 优先，不存在则回退
2. **Executor 审查方式说明**（历史行号已失效，仅示意）：描述两种审查流程
3. 其余约 560 行 artifact instruction **完全不变**

### C. 锁清单 — 拆为三个文件（v5 / v6 / v7）

不再使用 v2 分组格式。改为 init 时按 Superpowers 主版本精确匹配并部署对应的 lock 文件：

```
template/
├── skills.lock.v5.json    ← v5.x（拼凑值，不修）
├── skills.lock.v6.json    ← v6.x（已刷新到 v6.4.2）
└── skills.lock.v7.json    ← v7.x（v7.0.1，新增）
```

三份文件的对应版本与状态：

- `skills.lock.v5.json`：对应 Superpowers v5.x，历史拼凑值，仅保证 v5 分支可用，不作为准确基线。
- `skills.lock.v6.json`：对应 Superpowers v6.x，已刷新到 v6.4.2（`8ca22dba9a94f28898bbce59f2537ff4d87c747d`），6 条 hash 为实际文件值。
- `skills.lock.v7.json`：对应 Superpowers v7.0.1（`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`），6 条目，结构同 v6。

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
    "brainstorming/SKILL.md": { "sha256": "BBA47904A7F6BBEE3BF8A107EEBE84E65D392BE683BBB898DED736B29E415F90" },
    "writing-plans/SKILL.md": { "sha256": "90056BAD3D5F196FA7C9FEC0FFE592E6D9C86BC983E406642A51D1A4198B7024" },
    "subagent-driven-development/SKILL.md": { "sha256": "081AD3869E55C80BF8F890B4768A90C0E8057DAF94B1B6FADEBFC85EA5B8304A" },
    "subagent-driven-development/implementer-prompt.md": { "sha256": "A416193F881E5A712C988FFFABFE1D5A97BFFCD091EB95577C84FE2136588617" },
    "subagent-driven-development/spec-reviewer-prompt.md": { "sha256": "631980E472EEC5394DE8B89B69D432E54FD3F7F523ECF9AFA7EB4CDA0C9B2BAF" },
    "subagent-driven-development/code-quality-reviewer-prompt.md": { "sha256": "06D1E7C2287E5A00BD1809BF39038ABD5F413B4CF917C37D30F00C48F6293421" },
    "test-driven-development/SKILL.md": { "sha256": "7DEE67B4AF6BDCCC7A914CA34533184D64592D0F5B23AEAE631538168DB14994" }
  }
}
```

**`skills.lock.v6.json`**（已刷新到 v6.4.2）：

```json
{
  "schema": "@moyaspace/openspec-superpowers-opencode/skills-lock",
  "version": 1,
  "upstream": {
    "repo": "github.com/obra/superpowers",
    "commit": "8ca22dba9a94f28898bbce59f2537ff4d87c747d"
  },
  "skills": {
    "brainstorming/SKILL.md": { "sha256": "A32D2255354775AA124855AA7100CF276BEA096FFF4EBB3A0EDF57BE216E6C72" },
    "writing-plans/SKILL.md": { "sha256": "A6C67C1900064347C2A329990DD3C555657C51C3EC53B259A08AA01A2C26139A" },
    "subagent-driven-development/SKILL.md": { "sha256": "8DDE5589EE083FB4999106D116F01C8FDAF3116A8A9813FDEDEB80329DE49046" },
    "subagent-driven-development/implementer-prompt.md": { "sha256": "81DD9D5A3FB0B09B96B5829F03B9796842F3199EF7591D1BA1C2DB2A515F64D0" },
    "subagent-driven-development/task-reviewer-prompt.md": { "sha256": "BFED55C8F19D0FF6ED57B0FE09127C92890E9311C6C73917129598826BF9EBE8" },
    "test-driven-development/SKILL.md": { "sha256": "64B03FCE4AEE5A97A93160CEA8111F3BA13A17B7C001DB4BD5836D67FD10705D" }
  }
}
```

**`skills.lock.v7.json`**（新增，v7.0.1）：`upstream.commit` 为
`2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，共 6 条目，结构与 v6 相同。
其中 `brainstorming/SKILL.md` 与 `subagent-driven-development/SKILL.md` 的 hash 相对 v6 有变化，
其余 4 条一致。

三份文件都是标准的 v1 结构（每个技能条目为 `{ "sha256": "…" }`），setup 逻辑无需处理任何分组逻辑。

### D. 锁清单选择与校验（`src/setup/` + `src/verify.ts`）

当前实现已迁到 TypeScript：

- **`src/setup/discovery.ts`**：`selectLockFile` 只做精确匹配，按主版本拼出
  `skills.lock.v<major>.json`，文件不存在返回 `null`，绝不跨 major 回退；
  `listLockMajors` 返回模板中实际存在的锁清单 major（数值升序），供调用方判定支持范围。
- **`src/setup/index.ts`**：当 `selectLockFile` 返回 `null` 时，`reportUnsupportedLock`
  按「高于最高 / 低于最低 / 中间缺口 / 版本无法解析」给出可读提示，
  跳过完整性校验并继续 `init`，不阻塞部署。
- **`src/verify.ts`**：新增 `warn` 状态与 `detectBash`。Superpowers 主版本 ≥ 6 时追加
  bash 可用性检查项；缺失 bash 只记为 `warn`，不影响退出码。

> 早期的 `setup.ps1` / `setup.sh` 方案为历史实现，已由上述 TypeScript 模块取代。

## 三个既存问题及处置

- **① v6 锁文件曾滞后。** `template/skills.lock.v6.json` 曾停在 v6.1.1（`upstream.commit=d884ae04…`），v6.2+ 用户执行 init 会看到假 hash 警告。本 change 已把它刷新到 v6.4.2（`8ca22dba9a94f28898bbce59f2537ff4d87c747d`），6 条 hash 均按实际文件重新计算。
- **② v5 锁文件是拼凑值。** `template/skills.lock.v5.json` 的 `upstream.commit=612fbcdd…` 属于 v4 时代，部分 hash 与 v5 实际文件不符。决策是**不修**，因为 v5 已退出主流使用；本文件不得被当作 v5 的准确基线。
- **③ v5 分支依赖已删除的文件。** v5 分支引用的 `spec-reviewer-prompt.md` 与 `code-quality-reviewer-prompt.md` 自 v6 起已不存在。v6+ 用户不会走 v5 分支，但若手工指定 v5，会因文件缺失而失败。处置：不修，仅在此记录；v6+ 用户不走 v5 分支，v5 即将退出支持。

## v7 的 brainstorming 语义变化与 OSO 的覆盖

Superpowers v7 的 `brainstorming/SKILL.md` 在写作设计文档时引入了两项明确要求：

**体量分流。** SKILL.md 的 Size the Work 段按体量给出两种设计文档：

> - A small change → a short one: what you already covered together, written down
> - A project → the full written design (below)

即小改动写短设计（把双方已经谈过的内容落到纸面），大型项目写完整设计。SKILL.md 还要求先说明工作量大小，用户可以否决；如果任务中途变大，要停下来说明并升档。

**强制批准门。** SKILL.md 用 `HARD-GATE` 标记了一条硬约束：

> Nothing gets built until your human partner approves the design doc:
> the short one for a small change, the full one for a project.

只有设计文档获批之后才进入 plan（调用 `superpowers:writing-plans`）。也就是说，批准之前不得开始实现。

**OSO 的立场：明确覆盖体量分流，始终走完整 artifacts 流程。**
OSO 不采用「小改动跳过 artifacts」的做法，一律执行
brainstorm → proposal → design → specs → tasks → plan → apply 全链路。
体量只影响各 artifact 的篇幅，不影响环节是否存在。
强制批准门在 OSO 中体现为用户显式发起 `/opsx-apply`：没有这一步，就不进入实现阶段。

## 不变的内容

以下内容**不需要修改**：

- ❌ `template/_AGENTS.md` — 只引用了 `test-driven-development/SKILL.md`，v5 与 v6+ 都有
- ❌ `opsx-finish.md` — 只引用了 `finishing-a-development-branch/SKILL.md`，文件未变
- ❌ `template/_gitignore`、`_gitattributes`、`_editorconfig` — 与 Superpowers 版本无关
- ❌ Brainstorm、proposal、specs、tasks、plan、verify、retrospective 的 schema instruction — 不引用 SDD

## 执行步骤（v5 → v6 迁移的历史记录）

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

[8] 改锁清单选择与校验
    → 当前实现：`src/setup/discovery.ts` 的 `selectLockFile` / `listLockMajors`，
      `src/setup/index.ts` 的越界提示，`src/verify.ts` 的 `warn` 与 `detectBash`
    → 早期实现（历史）：`setup.ps1` / `setup.sh` 的版本检测与自适应部署

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

如果不做多版本兼容，也可以：

- **放弃 v5 支持**：只适配 v6，要求所有用户升级到 v6。简单，但破坏向后兼容。
- **放弃 v6 支持**：保持现状，只适配 v5。但大多数用户会用 npm 安装的最新版（v6+），会报错。
- **软检测不锁 hash**：去掉 lock 文件，改为运行时 Read 检测。失去完整性校验但最简单。

最终选择多版本兼容方案，是在**向后兼容**和**完整性校验**之间的平衡。
