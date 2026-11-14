# Verification Report

> 此文件由 `openspec-verify-change` skill 在 apply 完成后产生，用以确认实作
> 与 specs / design / tasks 的一致性。失败的检查须返回对应 artifact 修正后
> 再重跑 verify。

**Change**: `<change-name>`
**Verified at**: `YYYY-MM-DD HH:mm`
**Verifier**: `<who / which agent>`

---

## 1. Structural Validation (`openspec validate --all --json`)

- [ ] 全数 items `"valid": true`

**结果**：

```text
<贴上 openspec validate --all 的输出摘要>
```

若有失败项目，列出 id + issues：

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已变为 `- [x]`

**未完成任务**（若有）：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

对每个 `openspec/changes/<name>/specs/` 下的 capability 目录，与
`openspec/specs/<capability>/spec.md` 比对：

| Capability | Sync 状态 | 备注 |
|---|---|---|
| — | ✓ 已 sync / ✗ 待 sync / N/A | — |

---

## 4. Design / Specs Coherence Spot Check

抽样比对 `design.md` 的决策是否反映在 `specs/*.md` 的 Requirements 与
Scenarios 中：

| 抽样项 | design 描述 | specs 对应 | 差距 |
|---|---|---|---|
| — | — | — | — |

**漂移警告**（非阻塞）：

- <若有，列出；无则填「无」>

---

## 5. Implementation Signal

- [ ] Worktree 内无未 staged 的文件
- [ ] 所有相关 commit 已推送

**Commit 范围**：`<CHANGE_BASE_COMMIT>..<HEAD_COMMIT>`

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

设计产出不应落在 `docs/superpowers/specs/`(brainstorm artifact 的
output redirection 会把它导到 `openspec/changes/<name>/brainstorm.md`)。

侦测:

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [ ] 无文件,或存在的文件是 schema 安装前的合法存留

**泄漏清单**（若有）：

| 文件 | 内容是否已 captured 进 change | 建议动作 |
|---|---|---|
| — | — | — |

> 不会挡住 archive。新的 schema-installed cycle 产生的泄漏,应搬进
> `openspec/changes/<name>/brainstorm.md` 或 `design.md` 后删原档。

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

对 plan.md 中标 `[~]` deferred 的手动 dogfood / smoke task,逐项列出
等价的自动化测试覆盖。若没有等价自动化测试,该项应视为**真正的 gap**
而非合理 deferral,建议在 retrospective Misses 中记录。

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | 真正 gap? |
|---|---|---|---|
| 例:§11.3 `compose up + curl /actuator/health` | `LinebcIntegrationApplicationTests` (Testcontainers,24s) | Spring context boot + Flyway 跑完 + 主要 bean 注入 | ❌ 已等价覆盖 |
| — | — | — | — |

> **判读规则**:
> - 「等价」= 自动化测试的 assertion 集合是手动 dogfood 预期 assertion 的超集
> - 「Coverage assessment」= 列出实际被触及的 layer (context / DB schema / wiring / HTTP path / etc.)
> - 任何「真正 gap = ✅」的列,Overall Decision 仍可 PASS,但须在 retrospective 留 follow-up 条目

> **何时可以整节空白**:plan.md 完全没有 `[~]` 标记的 row 时,本节不需要填(空白即 PASS)。
> 只要 plan.md 出现任何 `[~]`,本节必须逐项列出,否则 Overall Decision 应降为 FAIL。

---

## 8. Test Evidence

- [ ] 测试跑在将要归档的树上（`run at:` 之后无行为改动，或已重跑）

**主套件**：`<N>` tests / `<pass>` pass / `<fail>` fail / `<skipped>` skipped
**Elevated**：`<M>` tests / `<pass>` pass
**run at**: `<commit-sha>`
**command**: `<exact command>`

**`run at:` 之后的行为改动核对**：

    git diff --name-only <recorded-sha>..HEAD -- src test template scripts assets package.json

若有输出且未重跑，必须在此列出 `no behaviour change since <sha>: <paths>` 或重跑后更新数字。

---

## Overall Decision

- [ ] ✅ PASS — 可进入 finishing-a-development-branch 与 archive
- [ ] ⚠️ PASS WITH WARNINGS — 可进入后续步骤但需注意：`<说明>`
- [ ] ❌ FAIL — 返回失败的 artifact 修正后重跑 verify

**下一步**：

<说明下一个动作>
