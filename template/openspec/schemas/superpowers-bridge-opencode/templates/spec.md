<!--
Delta spec template for a change.

此模板示范 4 种 delta section，按实际需要取用：
- ADDED / MODIFIED / REMOVED / RENAMED
档名与位置：openspec/changes/<change-name>/specs/<capability>/spec.md
（`<capability>` 对齐 openspec/specs/<capability>/ 目录名）

格式硬规则（OpenSpec 会 validate）：
- Requirement 句子 MUST 含 `SHALL` 或 `MUST`
- 每个 Requirement MUST 至少有一个 `#### Scenario:`
- Scenario MUST 用 level-4 (`####`)，level-3 或 bullet 会 silent fail
-->

## ADDED Requirements

<!-- 新增行为。列出本 change 要加到 capability 的新 Requirement。 -->

### Requirement: <!-- requirement name -->
<!-- requirement text — 须含 SHALL 或 MUST -->

#### Scenario: <!-- scenario name -->
- **WHEN** <!-- condition -->
- **THEN** <!-- expected outcome -->

---

## MODIFIED Requirements

<!--
修改既有 Requirement。**MUST 使用与 openspec/specs/<capability>/spec.md
完全相同的 normalized header**（trim 后 case-sensitive 比对），否则 archive
时的 delta apply 会因找不到对应 requirement 而失败。

**MUST 贴出修改后的完整内容**（不是只写 diff），因为 OpenSpec archive
是用全文替换的方式 apply MODIFIED。
-->

### Requirement: <!-- 与既有 spec 中相同的 header -->
<!-- 修改后的完整 requirement text — 含 SHALL 或 MUST -->

#### Scenario: <!-- scenario name（可新增、可修改） -->
- **WHEN** <!-- condition -->
- **THEN** <!-- expected outcome -->

---

## REMOVED Requirements

<!--
删除既有 Requirement。MUST 包含 Reason 与 Migration 说明，让 reviewer
理解为何废除以及既有引用方该怎么迁移。
-->

### Requirement: <!-- 要删除的 header，与既有 spec 完全相同 -->

**Reason**: <!-- 为何废除 -->

**Migration**: <!-- 既有呼叫方/依赖方应如何调整 -->

---

## RENAMED Requirements

<!--
重新命名 Requirement header。格式固定：FROM / TO 用 code-fence header。
若名称变更 + 内容变更，**同时**在 RENAMED 列出名字变更，并在 MODIFIED
用**新的** header 再写一份完整内容。

archive 时 apply 顺序：RENAMED → REMOVED → MODIFIED → ADDED
-->

- FROM: `### Requirement: <Old Name>`
- TO: `### Requirement: <New Name>`
