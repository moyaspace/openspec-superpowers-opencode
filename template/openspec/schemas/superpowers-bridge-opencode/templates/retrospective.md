# Retrospective: <change-name>

> Written: <YYYY-MM-DD> (after verify passed)
> Commit range: `<CHANGE_BASE_COMMIT>..<HEAD_COMMIT>`
> Worktree: <path or "merged to main">

---

## 0. Evidence

> 量化前置数据 — 后续 Wins / Misses bullets 直接引用,避免每行重复 [evidence: ...]。
> 冷写场景(retro 写于 cycle 结束之后一段时间),只用 `git log` + `tasks.md` +
> commit messages 也应能重建本节。

- **Commit range**: `<CHANGE_BASE_COMMIT>..<HEAD_COMMIT>` (<n> commits)
- **Diff size**: <+X / -Y lines across N files>
- **Tasks done**: <x>/<y> (`grep -cE '^\s*- \[x\]' tasks.md` → x;regex 容许 sub-task 缩排)
- **Active hours**: <estimate>
- **Subagent dispatches**: <count or "n/a">
- **New external dependencies**: <list, with license + version, or "none">
- **Bugs encountered post-merge**: <count, one-line each, or "none">
- **OpenSpec validate state at archive**: <pass / fail / not-run>
- **Test coverage signal**: <e.g. jacoco %, pytest count, vitest count, or "n/a">

Commit chain (时序):

```
<CHANGE_BASE_COMMIT> <one-line summary>
...
<HEAD_COMMIT> <archive commit one-line>
```

---

## 1. Wins

- [evidence: <commit/file/test>] <description>

## 2. Misses

- 🔴 [blocking | evidence: ...] <description>
- 🟡 [painful  | evidence: ...] <description>
- 📌 [nit      | evidence: ...] <description>

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.2       | ...          | ... |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        |      |
| superpowers:writing-plans                        |      |
| superpowers:using-git-worktrees                  |      |
| superpowers:subagent-driven-development          |      |
| (transitive) superpowers:test-driven-development |      |
| (transitive) superpowers:requesting-code-review  |      |
| superpowers:finishing-a-development-branch       |      |

> **Default expectation**: 全部 ✓。每个 skill 都是 schema 设计的一部分,
> 跳过属于异常情境。任一项 ✗ 都必须在下方
> `### Deliberately Skipped Skills` subsection 提出原因与预防方案。

### Deliberately Skipped Skills

> 跳过 skill 是设计的 escape hatch,不是常规路径。每个 ✗ 必须回答以下三题;
> 整节空白(全绿)是预期状态。

- **`<skill name>`**
  - **What was skipped**: <具体跳过了整个 skill,还是某个 sub-step>
  - **Why this cycle**: <具体 cycle 条件 — 不可写「不需要」/「太小」/「没时间」/「被外部 dep 挡住」/「skill 输出看起来不对」之类含糊理由;要写实际 trigger(具体 commit / log line / 观察到的行为)>
  - **How to prevent recurrence**: 下一个 cycle 在同类条件下怎么不再跳?选一:
    - `schema graph fix` — 写具体要改 schema.yaml 的哪一段
    - `skill description tightening` — 写具体要改哪个 skill 的 frontmatter / instruction
    - `CLAUDE.md trigger` — 写具体要在 adopter CLAUDE.md.fragment 加哪段判读规则
    - `scope-judgment rule` — 写具体 cycle 的 scope 应该被怎么判读
    - `one-off — schema boundary case, no prevention possible` — 但需明写为何 boundary(不接受含糊保留)

> **与 §6 Promote candidates 的关系**:多个 cycle 同 skill 同 `How to prevent`
> 答案 → 该模式应 promote 到 §6,直接触发 schema / skill PR,不可累积成「常态」。

## 5. Surprises

- <assumption that turned out wrong>

## 6. Promote candidates → long-term learning

每条 candidate 用 `- [ ]` checklist:

- 标题:严重程度 emoji(🔴/🟡/📌)+ 一句话 learning
- `→ **Promote to** <destination>`(memory / CLAUDE.md / schema / skill / one-off)

> **目的地按你的 harness 映射**(上游词汇保留,便于与 superpowers 上游对齐):
>
> | 上游目的地 | OpenCode 落点 | Claude Code 落点 | 装什么 |
> | --- | --- | --- | --- |
> | `memory` | `~/.config/opencode/AGENTS.md`(跨项目) | `~/.claude/memory/` | 「我该怎么做事」的个人偏好 |
> | `CLAUDE.md` | 项目根 `AGENTS.md` 的**非托管区** | `CLAUDE.md` | 本项目约定、技术栈、禁忌 |
> | `schema` | 同名:`openspec/schemas/<schema>/schema.yaml` | 同左 | 步骤顺序、门禁、artifact 契约 |
> | `skill` | 同名:Superpowers skill 文件 | 同左 | 可复用的操作流程 |
> | `one-off` | 同名:就地记录,不投放 | 同左 | 不会重演的具体情况 |
>
> **判定规则一句话**:这条规则约束的是「**流程该怎么走**」还是「**我该怎么想**」?
> 前者 → `schema`;后者 → `memory` / `CLAUDE.md`。
>
> 若某目的地在本环境不存在(例如没有 `~/.config/opencode/AGENTS.md`),MUST NOT 假装投放 ——
> 改判 `one-off` 并在 `> **Why**:` 里写明「本环境无对应载体」。
>
> **不要往 `AGENTS.md` 的托管区块里写**:`<!-- openspec-superpowers-opencode_instructions -->`
> 之间那一段由 `oso init` 重新生成,重跑即丢失。自定义规则只能加在托管区块之外。

- 两行 body(对应 superpowers feedback memory body schema):
  - `> **Why**: <reason; often a past incident or strong preference>`
  - `> **How to apply**: <when/where this guidance kicks in>`

未勾选的 `- [ ]` 表示 candidate 尚未 promote — 可带到下一个 cycle 的 retro 重评估,
或保留作为跨 cycle 的观察点。

> **Carry-forward 机制**:下个 cycle 写 retro 时,可
> `grep -A 5 '^- \[ \]' openspec/changes/archive/*/retrospective.md` 取出
> 既往 unchecked candidates,逐笔判断要 carry-forward 到本 cycle §6、就地
> promote、或标 stale 不再追踪。

范例:

- [ ] 🔴 **<short rule>** → **Promote to memory** (type: feedback)
  > **Why**: <past incident or strong preference that motivated this rule>
  > **How to apply**: <which file / cycle phase / decision moment this kicks in>

- [ ] 🟡 **<another candidate>** → **Promote to project CLAUDE.md** (`<path/to/CLAUDE.md>` 段)
  > **Why**: ...
  > **How to apply**: ...

- [ ] 📌 **<third candidate>** → **One-off** (记录即可,不 promote)
  > **Why**: <why it doesn't generalize>
