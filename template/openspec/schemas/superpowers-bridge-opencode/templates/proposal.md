## Why

<!--
Explain the motivation for this change. What problem does this solve? Why now?

硬限制：50 ≤ 字元数 ≤ 1000（OpenSpec zod schema 会 validate）
- 太短：会收到 `Why section must be at least 50 characters` error
- 太长：会收到 `Why section should not exceed 1000 characters` error

建议结构：现况痛点 → 为什么现在处理 → 预期收益（各 1-2 句）
-->

## What Changes

<!--
Describe what will change. Be specific about new capabilities, modifications, or removals.

对于有明确前后对比的行为变更，使用 From/To 格式（markdown 无 inline diff）：

**<Section or Behavior Name>**
- From: <current state / requirement>
- To: <future state / requirement>
- Reason: <why this change is needed>
- Impact: <breaking / non-breaking, who's affected>

多个变更可重复此 block；纯新增或纯删除可用简单列表描述。
-->

## Capabilities

### New Capabilities
<!--
Capabilities being introduced. Replace <name> with kebab-case identifier.
命名规则见 openspec/specs/README.md：使用复合名词（至少 2 个 word），
例如 `user-auth`、`data-export`、`api-rate-limiting`，不用纯单词。
Each creates specs/<name>/spec.md
-->
- `<name>`: <brief description of what this capability covers>

### Modified Capabilities
<!--
Existing capabilities whose REQUIREMENTS are changing (not just implementation).
Only list here if spec-level behavior changes. Each needs a delta spec file.
Use existing spec names from openspec/specs/. Leave empty if no requirement changes.
-->
- `<existing-name>`: <what requirement is changing>

## Impact

<!-- Affected code, APIs, dependencies, systems -->
