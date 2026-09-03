---
description: 管理 sprint——从 features.md 拉取条目、安排、跟踪状态（oso/sprints/）
---

管理 sprint（Scrum Sprint Backlog 的执行层）。从 `oso/requirements/` 的 features.md 引用/复制工单要素，安排进 sprint、跟踪状态、看板视图。产出 `oso/sprints/sprint-<日期>.md`。

**这是 OSO 的执行层**——意图层（`/moya-interview` 产出需求）确认后，本工具管"什么时候做、做到哪了"。

**Input**: 动作 + 参数（自然语言或结构化）。

### 参数

```
/moya-sprint                      # 默认：查看当前 sprint 看板
/moya-sprint --board              # 显式看板视图（等价默认）
/moya-sprint --board --all        # 全局视图（backlog + 所有 sprint）
/moya-sprint create <功能>        # 从 features.md 拉条目进 sprint
/moya-sprint update <T> <状态>    # 更新状态（🔲 待办/⏸️ 进行中/✅ 完成）
/moya-sprint remove <T>           # 条目撤出 sprint（回 backlog，可重新拉入）
/moya-sprint cancel <T>           # 条目取消（标记 ❌，不再进行；最终态）
/moya-sprint plan                 # 计划会议：列出 features.md 待排期条目，用户选择进哪个 sprint
/moya-sprint archive              # 当前 sprint 完成 → 定稿（不再改）
```

### 产出位置

```
oso/sprints/
├── sprint-2026-08-11.md      # 当前迭代（执行中）
├── sprint-2026-08-04.md      # 上次迭代（已定稿）
└── sprint-2026-08-18.md      # 下次迭代（计划，可空）
```

文件名用日期（`sprint-<日期>.md`）：时间盒快照，一次迭代一个；天然有序、语义明确。

---

### Step 1: 确定目标 sprint 文件

```bash
# 列出现有 sprint
Get-ChildItem oso/sprints -Name 2>$null
```

- 有当前（最新日期的未定稿 sprint）→ 用它
- 无 → 用当前日期创建 `oso/sprints/sprint-<今天>.md`（初始化模板见 Step 3）
- 用户指定日期 → 用指定的

### Step 2: 理解意图

| 关键词/参数 | 操作 |
|---|---|
| 无参 / `--board` | 查看当前 sprint 看板（Step 5） |
| `--board --all` | 全局视图（Step 5b） |
| `create` / `加` / `拉入` | 从 features.md 拉条目进 sprint（Step 4） |
| `update` / `完成` / `搁置` | 更新状态（Step 4b） |
| `remove` / `撤出` | 条目撤出 sprint 回 backlog（Step 4c） |
| `cancel` / `取消` | 条目取消，标记 ❌ 不再进行（Step 4d） |
| `plan` / `计划` | 计划会议（Step 4a） |
| `archive` / `归档` | 定稿当前 sprint（Step 6） |

### Step 3: 首次初始化（sprint 文件不存在时）

把以下模板 Write 到目标路径：

```markdown
# Sprint <日期>

> 本次迭代的工单。内容引用/复制自 `oso/requirements/systems/*/features.md`。

| 编号 | 功能 | 所属系统 | 优先级 | 状态 | 验收来源 |
|:----:|------|:--------:|:------:|:----:|:--------:|
| T1 | <功能名> | <系统> | 高/中/低 | 🔲 | features.md 条目 |
| | | | | | |

**依赖关系**
（有依赖时画，无则省略）
```

### Step 4: create——从 features.md 拉条目进 sprint

1. **读 backlog 源**：读 `oso/requirements/systems/*/features.md`，列出待排期条目（未在任何 sprint 的）
2. **确认选择**：展示候选 → 用户确认拉哪些
3. **引用/复制**：把条目写入 sprint 表格（编号自动分配 T1/T2…，内容与 features.md 同源，不重盘问）
4. **记录来源**：`验收来源` 列标注对应 features.md 条目
5. 更新 `oso/requirements/README.md` 的对齐状态

**注意**：sprint 表格是**引用/复制** features.md 的内容——内容同源；如需改功能定义，回 `/moya-interview --feature` 改 features.md，再同步。

#### Step 4a: plan——计划会议

```
📦 Backlog（待排期）          ← features.md 汇总
   T5 多仓库支持（待排期）
   T6 通知重试（待排期）

📋 Sprint 2026-08-11（当前）   有 2 个空位
```

展示 backlog + 各 sprint 容量 → 用户选择哪些条目进哪个 sprint → 写入对应 sprint 文件。

#### Step 4b: update——更新状态

```
/moya-sprint update T2 完成     # 或 /moya-sprint T2 做完了
/moya-sprint update T3 搁置     # 或 /moya-sprint 搁置 T3
```

| 操作 | sprint 文件中的变化 |
|---|---|
| `完成` / `✅` | 🔲/⏸️ → ✅ |
| `搁置` / `⏸️` | 🔲 → ⏸️ |
| `待办` / `🔲` | ⏸️/✅ → 🔲 |
| `取消` / `❌` | 任意状态 → ❌（不再进行，最终态） |

更新后同步 `oso/requirements/README.md` 的对齐状态。

#### Step 4c: remove——条目撤出 sprint

```
/moya-sprint remove T4     # 或 /moya-sprint 撤出 T4
```

- 条目从 sprint 表格移除，**回到 backlog**（features.md 待排期区），可重新拉入
- 编号让位（不再占用），后续 create 重新分配
- 场景：plan 时选错、需求暂时搁置不排期

#### Step 4d: cancel——条目取消

```
/moya-sprint cancel T3     # 或 /moya-sprint 取消 T3
```

- 条目保留在 sprint 表格，状态标 **❌ cancelled**（不再进行，最终态）
- **不回到 backlog**（区别于 remove）——需求取消，不是待排期
- 场景：需求废弃、明确不做
- 看板中 ❌ 单独列出或灰显，不参与 🔲/⏸️/✅ 统计

### Step 5: 看板视图（默认动作）

读当前 sprint 文件，按状态渲染列布局：

```
/moya-sprint

📋 Sprint 2026-08-11（当前）
┌──────────────┬─────────────────┬──────────────┐
│ 🔲 To Do     │ ⏸️ In Progress  │ ✅ Done      │
├──────────────┼─────────────────┼──────────────┤
│ T3 采纳统计  │ T2 评审带证据   │ T1 PR触发评审 │
│ T4 通知重试  │                 │              │
└──────────────┴─────────────────┴──────────────┘
```

#### Step 5b: 全局视图（--board --all）

```
/moya-sprint --board --all

📦 Backlog（未排期）          ← features.md 汇总
   T5 多仓库支持（待排期）

📋 Sprint 2026-08-04（已归档）  T1 ✅
📋 Sprint 2026-08-11（当前）   T2 ⏸️  T3 🔲
📋 Sprint 2026-08-18（计划）   空
```

### Step 6: archive——定稿当前 sprint

- 当前 sprint 所有任务 ✅（或用户确认归档）→ 定稿：不再修改该文件
- 未完成任务移到下一个 sprint 文件（日期最新的），编号不变
- 更新 README.md 对齐状态

### Guardrails

- **不盘问需求**——功能定义在 features.md（`/moya-interview --feature` 管）；sprint 只管"排期 + 状态"
- **内容同源**——sprint 表格引用/复制 features.md；改功能定义回 interview，不直接在 sprint 里改
- **时间盒**——一个 sprint 一个文件，定稿后不再改（git 管历史）
- **状态驱动**——状态只允许 🔲 待办 / ⏸️ 进行中 / ✅ 完成 / ❌ 已取消
- **用户确认**——create/plan/archive/remove/cancel 前必须用户确认
- **不看板臆测**——看板是渲染视图，数据以 sprint 文件为准
