# AGENTS.md - AI 行为指令

本项目使用 OpenSpec（`superpowers-bridge-opencode` schema）驱动开发流程，
所有功能变更遵循 artifact 生命周期管理。

## 开发规则

- 变更必须先在 worktree（`.worktrees/<name>/`）中生成 artifacts 和代码
- `main` 分支仅包含已合并的完成工作，始终保持干净
- 实现阶段使用 TDD（RED → GREEN → REFACTOR）方法论

## Superpowers Skill 载入

本 schema 使用 `Read` 替代 `skill()` 来载入 Superpowers skills。

### 基底路径

```
{{SUPERPOWERS_BASE_PATH}}
```

### skill() 不可用时

如果 `skill()` 工具不可用或报错，改用手动 `Read` 对应 skill 文件：
- `Read <基底路径>/<技能名称>/SKILL.md`
- 按 Read 到的内容执行

### 子 Agent 调度

| 任务类型 | 调用方式 |
|---------|---------|
| 实现任务 | `task(category="deep", load_skills=[], ...)` — prompt 中嵌入 TDD 指令（Read {{SUPERPOWERS_BASE_PATH}}test-driven-development/SKILL.md） |
| 代码搜索 | `task(subagent_type="explore", ...)` |
| 查文档 | `task(subagent_type="librarian", ...)` |
| 架构决策 | `task(subagent_type="oracle", ...)` |
| Code review | `task(subagent_type="oracle", ...)` |
