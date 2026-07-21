# Superpowers `subagent-driven-development` 版本对比: v5.1.0 → v6.1.1

> 基于 `~/.cache/opencode/packages/` 中安装的 superpowers 版本对比。
> v5.1.0 是 pinned 版本，v6.1.1 是未固化时的最新版本。

## 版本链

```
v5.1.0 (2025-03-03) → v5.1.x ... → v6.0.0 → v6.0.1 → v6.0.2 → v6.0.3 → v6.1.0 → v6.1.1
```

对比覆盖所有版本差异，核心变更集中在 **v6.0.0**（子代理驱动开发重写）和 **v6.0.3**（SDD 暂存文件移出 `.git/`）。

---

## 一、文件结构变化

| v5.1.0 | v6.1.1 | 说明 |
|--------|--------|------|
| `SKILL.md`（279 行） | `SKILL.md`（418 行） | 大幅扩展，新增 5 个章节 |
| `spec-reviewer-prompt.md` | ❌ 删除 | 合并为 `task-reviewer-prompt.md` |
| `code-quality-reviewer-prompt.md` | ❌ 删除 | 同上 |
| ❌ 不存在 | `task-reviewer-prompt.md` 🆕 | 二合一审查模板，一次 dispatch 返回两个 verdict |
| ❌ 不存在 | `scripts/task-brief` 🆕 | 从 plan 中提取单个 task 到独立文件 |
| ❌ 不存在 | `scripts/review-package` 🆕 | 生成 diff 包（commit list + stat + full diff）写入文件 |
| ❌ 不存在 | `scripts/sdd-workspace` 🆕 | 解析 `.superpowers/sdd/` 路径（进度持久化） |
| `implementer-prompt.md`（113 行） | `implementer-prompt.md`（139 行） | 上下文传递从粘贴改为文件路径，新增 TDD 证据格式 |

---

## 二、核心架构变化

### 2.1 审查流程: 两阶段 → 二合一

**v5.1.0 流程（2 次 dispatch / 任务）：**

```
实现 → [spec-reviewer-prompt] spec 审查 → [code-quality-reviewer-prompt] 质量审查
```

**v6.1.1 流程（1 次 dispatch / 任务）：**

```
实现 → task-brief & review-package（写文件）→ [task-reviewer-prompt] spec + 质量一次返回
```

| 维度 | v5.1.0 | v6.1.1 |
|------|---------|--------|
| 每次任务审查 dispatch 次数 | 2 次 | 1 次 |
| 审查返回 | 独立 verdict | 同一次返回两个 verdict |
| 修复后重审 | 两个分别走 | 一次覆盖 |
| ⚠️ Cannot verify from diff | 无 | 新增 — 标记无法从 diff 验证的跨任务项 |
| "plan-mandated" 缺陷标签 | 无 | 新增 — plan 要求的缺陷不自动放过 |

### 2.2 审查者纪律强化（v6.0.0 新增）

审查 prompt 中新增多项**禁止性规则**，防止 controller 操纵审查结果：

- 禁止提前预判 severity（"at most Minor"、"don't flag X"）
- 禁止指导审查者忽略某些项
- 禁止在 dispatch 中夹带"state after Tasks 1-3"等历史摘要（限制 42k → 99% 历史的问题）
- 审查者是只读的：不得修改工作树、index、HEAD 或分支状态
- "plan-mandated" 标签——plan 写的缺陷也是缺陷，由用户决定是否保留

### 2.3 审查者不得覆盖 implementer 已运行的测试（v6.1.1）

- 不再允许审查者重新运行 implementer 已跑过的测试套件
- 只允许在阅读代码发现**具体疑虑**时运行聚焦测试
- 测试输出中的 warning/noise 也作为缺陷上报

### 2.4 最终全局审查独立化（v6.1.1）

- 最终审查改为引用 `../requesting-code-review/code-reviewer.md`
- 审查包通过 `scripts/review-package MERGE_BASE HEAD` 生成
- 最终审查的发现集中打包给一个 fix 子代理，而非每个 finding 各派一个

---

## 三、上下文传递方式: 粘贴 → 文件

这是 v6.0.0 最核心的变更。

### v5.1.0 — 全量粘贴进 prompt

```
[FULL TEXT of task from plan - paste it here, don't make subagent read file]
```

审查时也是"读实际代码 + 读 implementer report"，全部在消息流中传递。

### v6.1.1 — 文件传递

```
1. scripts/task-brief PLAN_FILE N          →  task-N-brief.md（完整需求）
2. 实现者写入 task-N-report.md             →  返回摘要（status + commits + 测试一行摘要）
3. scripts/review-package BASE HEAD        →  生成 diff 文件（不进 controller 上下文）
4. 审查者收到三个路径：brief + report + diff
```

SKILL.md 新增 **"上下文成本"** 章节专门解释此变更——所有粘贴的内容永久驻留 context，每次后续 turn 都会重新读一遍。文件传递则完全绕过此问题。

### 副作用

- 审查者不再自己跑 `git diff`，而是读审查包文件
- 审查者的 diff 上下文行就是"已读的代码"，只有被截断的 hunk 才需要额外 `Read`
- implementer 的 report 从消息返回改为写文件后返回摘要（< 15 行）
- fix 子代理的修复结果追加到同一 report 文件

---

## 四、Pre-Flight 计划审查（v6.1.1 新增）

在 Task 1 dispatch 之前，controller 需要扫描整个 plan 的冲突：

- task 之间互相矛盾的
- task 与 plan 的 Global Constraints 矛盾的
- plan 明确要求但审查者会认为缺陷的（如空断言测试、逻辑块逐字重复）

所有发现**一次性**打包给用户，而不是逐个中断。如果扫描干净则直接继续。

---

## 五、持久化进度（v6.1.1 + v6.0.3 新增）

### 问题

会话上下文压缩（compaction）后，controller 丢失了已完成任务的记录。生产中发现的案例：controller 重新派发了整个已完成的任务序列——这是最昂贵的单一故障。

### 解决方案

- 进度写入 `$(git rev-parse --show-toplevel)/.superpowers/sdd/progress.md`
- 每完成一个 task 追加一行：`Task N: complete (commits <base7>..<head7>, review clean)`
- 启动时先检查 ledger，已完成的跳过
- 压缩后依赖 ledger + `git log` 恢复，不依赖自身记忆
- **注意**: `git clean -fdx` 会删除 ledger（因为是 git-ignored），需从 `git log` 恢复

### v6.0.3 背景

v6.0.0 最初将 SDD 暂存文件（task briefs、review package、progress ledger）放在 `.git/sdd/` 下。但 Claude Code 将 `.git/` 视为受保护路径，拒绝子代理写入。v6.0.3 将其移到了工作树的 `.superpowers/sdd/`（git-ignored），并通过 `sdd-workspace` 脚本按 worktree 解析路径。

---

## 六、Model Selection 细化（v6.1.1）

| 维度 | v5.1.0 | v6.1.1 |
|------|--------|--------|
| 模型选择指导 | 简略三段式（cheap/standard/capable） | 细化加四条：显式指定模型、turn 数 vs token 价格、逐句转写用最廉价、单文件修复也用最廉价 |
| 禁止隐式继承 | 无说明 | 明确：省略 = 继承会话模型（通常是最贵），暗中违背此章节 |
| 最终审查模型 | 无特别说明 | 明确：最终审查用最 capable 模型，不是会话默认 |
| 审查模型选择 | 未区别 | 按 diff 大小/复杂度/风险选择：小的机械 diff 不需要最 capable |

---

## 七、Implementer 模板变化

| 项目 | v5.1.0 | v6.1.1 |
|------|--------|--------|
| 任务传递 | 粘贴全文 | `Read your task brief first: [BRIEF_FILE]` |
| 报告方式 | 消息中完整返回 | 写入 `[REPORT_FILE]`，返回摘要（< 15 行） |
| TDD 证据 | 无要求 | 明确 RED → GREEN 格式 |
| 修复后测试 | 无说明 | 追加到 report 文件，审查者不会重跑 |
| 测试策略 | 无 | 开发中只跑聚焦测试，commit 前跑一次全量 |
| 测试输出 | 无要求 | 必须 pristine（无 stray warning/noise） |

---

## 八、Red Flags 章节变化

v5.1.0: 14 条"Never"
v6.1.1: 17 条"Never"，新增：

- 不得跳过 task review，或接受缺少任一 verdict 的报告
- 不得在 dispatch prompt 中告诉审查者"不要标记 X"或预判 severity
- 不得在无 diff 文件的情况下 dispatch 审查者——必须先跑 `scripts/review-package`
- 不得重新派发 ledger 已标记完成的任务——先检查 ledger 和 `git log`
- 审查者发现问题 → dispatch 同一个 implementer 修复（与 v5.1.0 一致，但措辞更严格）

---

## 九、与 RELEASE-NOTES.md 的对应

| 变更 | 对应发布说明 |
|------|------------|
| 双审查 prompt 合并为 `task-reviewer-prompt.md` | v6.0.0 Visible Changes |
| `scripts/task-brief` + `scripts/review-package` 新增 | v6.0.0 Subagent-Driven Development |
| `.superpowers/sdd/` + `scripts/sdd-workspace` | v6.0.3 SDD scratch files moved out of `.git/` |
| 审查者纪律强化（禁止预判 severity、只读模式等） | v6.0.0 Subagent-Driven Development |
| Model Selection 细化 + 必须显式指定 model | v6.0.0 Subagent-Driven Development |
| 进度账本持久化 | v6.0.0 Durable Progress |
| 审查者不再重跑 implementer 已跑的测试 | v6.1.1 Subagent-Driven Development |

---

## 参考

- [OpenCode Plugin Cache Analysis](OPencode-plugin-cache-analysis.md) — 插件缓存路径调查
- [RELEASE-NOTES.md on GitHub](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md)
