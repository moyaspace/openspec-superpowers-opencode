# opsx-ff Idempotent Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/opsx-ff` converge a change to apply-ready from any state, and make `/opsx-propose` / `/opsx-new` abort cleanly when the name is already taken.

**Architecture:** Three template command files change; no `src/` change. Existence is judged by `test -d openspec/changes/<name>` inside the worktree. `ff` gates creation behind that check and gates the commit behind `git diff --cached --quiet`. `propose` / `new` stop on an occupied name and print two continuation paths.

**Tech Stack:** Markdown template commands, Node's built-in test runner (`node --test`), OpenSpec CLI 1.3.1, git worktrees.

**Spec:** `openspec/changes/opsx-ff-idempotent-converge/specs/opsx-change-convergence/spec.md` and `openspec/changes/opsx-ff-idempotent-converge/specs/opsx-template-command-parity/spec.md` (see also `design.md`).

## Global Constraints

- Only `release/1.1` is touched. Base branch is `release/1.1`; merge direction is `feature/opsx-ff-idempotent-converge → release/1.1`. Never run `git checkout main` / `git switch main`.
- `src/` gets zero changes. If a change there seems required, STOP and report (BUG020 regression).
- Do not modify existing assertions in `test/setup-template-invariants.test.js`: `assertBaseReadStep`, `assertRegistryAddCarriesBase`, `BASE_AWARE_COMMANDS`. Add new cases only.
- Any new comment in `opsx-ff.md` MUST NOT contain the literal `registry add` (`assertRegistryAddCarriesBase` uses `.find()` on the first matching line).
- Do not touch `opsx-ff.md` Step 2d, Step 3, or Step 4a.
- Do not touch `README.md` / `README.zh-CN.md` (owned by T005) or `.opencode/commands/` (deployed copy, gitignored).
- Templates MUST NOT contain machine-local absolute paths.
- Node >= 22.9.0. Prefer `npm test`; if it fails with a Windows 9009 spawn error (not an assertion failure), use `node --test --test-concurrency=1 "test/*.test.js"` and record the deviation.
- No `as any`, no `@ts-ignore`, no deleting or skipping failing tests.

## Review Focus

- A change that exists on disk but is absent from the registry: the check must still find it (`test -d`, not `openspec list`).
- A same-named archived change (`openspec/changes/archive/<date>-<name>/`): must NOT be treated as occupied.
- Re-running a fully complete change: must not fail, must not create an empty commit.
- `opsx-new.md` must remain scaffold-only (no `TodoWrite`, no `个 artifacts`, no `Artifact Creation Guidelines`).
- Any added note must not accidentally satisfy/poison the `registry add` single-line assertion.

---

## Task 1: Add failing template-invariant tests (RED)

**Files:**
- Modify: `test/setup-template-invariants.test.js` (append new `describe` blocks; do not edit existing cases)
- Test: same file

**Interfaces:**
- Consumes: existing helpers `readCommand(file)`, `sectionOf(file, content, startMarker, endMarker)`, `fencedCommands(body)`.
- Produces: new `describe` blocks named `opsx-ff.md converges from any state` and `creating commands stop on an occupied name`.

- [ ] **Step 1: Append the ff convergence tests**

Insert after the existing `opsx-new.md stays scaffold-only` case (inside the same `describe`), or as a new top-level `describe` at the end of the file:

```js
describe('opsx-ff.md converges from any state', () => {
    it('Step 4 gates creation behind `test -d`', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        assert.ok(
            step4.includes('test -d openspec/changes/<name>'),
            'opsx-ff.md: Step 4 must check `test -d openspec/changes/<name>`',
        );
        const commands = fencedCommands(step4);
        assert.equal(
            commands[0],
            'test -d openspec/changes/<name>',
            `opsx-ff.md: Step 4 first fenced command must be the existence check, got ${JSON.stringify(commands)}`,
        );
    });

    it('Step 4 does not run `openspec new change` unconditionally', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        const commands = fencedCommands(step4);
        assert.ok(
            commands.includes('openspec new change "<name>"'),
            'opsx-ff.md: Step 4 must still create the change when missing',
        );
        assert.notEqual(
            commands[0],
            'openspec new change "<name>"',
            'opsx-ff.md: creation must be behind the existence check',
        );
        assert.ok(step4.includes('不存在'), 'opsx-ff.md: Step 4 must branch on the missing case');
    });

    it('Step 4 forbids `openspec list` and archive checks', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        assert.equal(
            step4.includes('openspec list'),
            false,
            'opsx-ff.md: Step 4 must not use `openspec list` as an existence check',
        );
        assert.equal(
            step4.includes('test -d openspec/changes/archive'),
            false,
            'opsx-ff.md: Step 4 must not test archived changes',
        );
    });

    it('Step 6 guards the commit with `git diff --cached --quiet`', () => {
        const content = readCommand('opsx-ff.md');
        const step6 = sectionOf('opsx-ff.md', content, '### Step 6', '### Output');
        assert.ok(
            step6.includes('git diff --cached --quiet'),
            'opsx-ff.md: Step 6 must skip the commit when nothing is staged',
        );
        assert.equal(
            step6.includes('git add -A && git commit'),
            false,
            'opsx-ff.md: Step 6 must not chain `git add -A && git commit`',
        );
    });
});
```

- [ ] **Step 2: Append the propose/new abort tests**

```js
describe('creating commands stop on an occupied name', () => {
    it('propose Step 4 and new Step 5 both check `test -d` first', () => {
        const propose = readCommand('opsx-propose.md');
        const proposeStep4 = sectionOf('opsx-propose.md', propose, '### Step 4', '#### Step 4a');
        assert.ok(
            proposeStep4.includes('test -d openspec/changes/<name>'),
            'opsx-propose.md: Step 4 must check `test -d openspec/changes/<name>`',
        );
        assert.ok(proposeStep4.includes('/opsx-continue'), 'opsx-propose.md: must offer /opsx-continue');
        assert.ok(proposeStep4.includes('/opsx-ff'), 'opsx-propose.md: must offer /opsx-ff');
        assert.equal(
            proposeStep4.includes('openspec list'),
            false,
            'opsx-propose.md: Step 4 must not use `openspec list` as an existence check',
        );

        const newCmd = readCommand('opsx-new.md');
        const newStep5 = sectionOf('opsx-new.md', newCmd, '### Step 5', '#### Step 5a');
        assert.ok(
            newStep5.includes('test -d openspec/changes/<name>'),
            'opsx-new.md: Step 5 must check `test -d openspec/changes/<name>`',
        );
        assert.ok(newStep5.includes('/opsx-continue'), 'opsx-new.md: must offer /opsx-continue');
        assert.ok(newStep5.includes('/opsx-ff'), 'opsx-new.md: must offer /opsx-ff');
        assert.equal(
            newStep5.includes('openspec list'),
            false,
            'opsx-new.md: Step 5 must not use `openspec list` as an existence check',
        );
    });
});
```

- [ ] **Step 3: Run the file and confirm RED**

Run: `node --test test/setup-template-invariants.test.js`
Expected: the new cases fail (`Step 4 first fenced command must be the existence check` etc.), existing cases still pass. Record the failure output.

- [ ] **Step 4: Commit the failing tests**

```bash
git add test/setup-template-invariants.test.js
git commit -m "test(template): pin opsx-ff idempotent convergence invariants"
```

---

## Task 2: Implement `opsx-ff.md` (Green for Task 1 cases)

**Files:**
- Modify: `template/.opencode/commands/opsx-ff.md:103-107` (Step 4), `:146-151` (Step 6), `:153-160` (Output)
- Test: `test/setup-template-invariants.test.js`

**Interfaces:**
- Consumes: new assertions from Task 1.
- Produces: Step 4 with `test -d` first; Step 6 with guarded commit; Output with skipped count.

- [ ] **Step 1: Replace Step 4**

Replace this block:

```markdown
### Step 4: 在 worktree 内创建变更

```bash
openspec new change "<name>"
```
```

with:

```markdown
### Step 4: 确保变更存在（幂等，只判断本 worktree）

`ff` 可以在任意阶段被调用。判断依据只有一条：**当前 worktree 内是否已有该 change 目录**。

```bash
test -d openspec/changes/<name>
```

- **存在（exit 0）** → 跳过创建，直接进入 Step 4a
- **不存在（exit 1）** → 创建：

  ```bash
  openspec new change "<name>"
  ```

  - 成功（exit 0）→ 进入 Step 4a
  - 失败（exit 1）→ 停下报告，不得重试、不得手工建目录

> MUST NOT 用 `openspec list` 判断存在性：它返回的是**注册表中的活跃变更**，不是磁盘上的 change 目录；未经注册的 change 不会出现在结果里。
> 已归档的同名变更（`openspec/changes/archive/`）不视为冲突，不检测。
```

- [ ] **Step 2: Replace Step 6**

Replace:

```markdown
```bash
git add -A && git commit -m "change: <name>"
cd <project-root>
```
```

with:

```markdown
```bash
git add -A
git diff --cached --quiet || git commit -m "change: <name>"
cd <project-root>
```

- 无任何变化时（重复调用、artifacts 已齐）**跳过提交**，不视为失败。
  `git commit` 在无暂存内容时以 exit 1 退出；若直接串联 `&&`，幂等重跑会在最后一步中断。
```

- [ ] **Step 3: Extend Output**

After `- 已创建：`<N>` 个 artifacts`, add:

```markdown
- 本次跳过：`<M>` 个已完成 artifacts
- 若 `<N>` 为 0：提示「全部 artifacts 已就绪，可运行 `/opsx-apply` 开始实现，或 `/opsx-archive` 归档」
```

- [ ] **Step 4: Run the ff cases**

Run: `node --test test/setup-template-invariants.test.js`
Expected: all four `opsx-ff.md converges from any state` cases PASS; the propose/new case still fails.

- [ ] **Step 5: Commit**

```bash
git add template/.opencode/commands/opsx-ff.md
git commit -m "feat(template): make opsx-ff converge from any state"
```

---

## Task 3: Implement `opsx-propose.md` and `opsx-new.md` (Green for Task 1 propose/new case)

**Files:**
- Modify: `template/.opencode/commands/opsx-propose.md:101-105` (Step 4), last guideline line `:166`
- Modify: `template/.opencode/commands/opsx-new.md:115-119` (Step 5), last guardrail line `:165`
- Test: `test/setup-template-invariants.test.js`

**Interfaces:**
- Consumes: `/opsx-continue` and `/opsx-ff` names from Task 1 assertions.
- Produces: Step 4 / Step 5 abort blocks; rewritten guideline/guardrail lines.

- [ ] **Step 1: Replace propose Step 4**

Replace:

```markdown
### Step 4: 在 worktree 内创建变更

```bash
openspec new change "<name>"
```
```

with:

```markdown
### Step 4: 创建变更（本命令为创建语义）

`propose` 是**创建**语义：名字已被占用时停下并给出继续方式，不覆盖已有 change。

```bash
test -d openspec/changes/<name>
```

- **不存在（exit 1）** → 执行创建：

  ```bash
  openspec new change "<name>"
  ```

  成功（exit 0）→ 进入 Step 4a；失败（exit 1）→ 停下报告。

- **存在（exit 0）** → **STOP**，向用户报告：

  > 变更 `<name>` 已存在，本次未做任何改动。继续的方式：
  > - `/opsx-continue <name>` — 每次生成一个 artifact，逐个确认
  > - `/opsx-ff <name>` — 一次补齐所有剩余 artifact

  不得继续，不得覆盖已有 change。

> MUST NOT 用 `openspec list` 判断存在性（返回的是注册表内容，不是磁盘目录）。
> 已归档的同名变更不视为冲突，不检测。
```

- [ ] **Step 2: Rewrite the propose guideline line**

```diff
- - 如果同名变更已存在，建议用 `/opsx-continue`
+ - 同名变更已存在时由 Step 4 中止，不再继续
```

- [ ] **Step 3: Replace new Step 5**

Replace:

```markdown
### Step 5: 在 worktree 内创建变更

```bash
openspec new change "<name>"
```
```

with:

```markdown
### Step 5: 在 worktree 内创建变更骨架（本命令为创建语义）

`new` 是**创建**语义：名字已被占用时停下并给出继续方式。

```bash
test -d openspec/changes/<name>
```

- **不存在（exit 1）** → `openspec new change "<name>"`，成功后进入 Step 5a
- **存在（exit 0）** → **STOP**，向用户报告：

  > 变更 `<name>` 已存在，本次未做任何改动。继续的方式：
  > - `/opsx-continue <name>` — 每次生成一个 artifact，逐个确认
  > - `/opsx-ff <name>` — 一次补齐所有剩余 artifact

> 已归档的同名变更不视为冲突，不检测。
```

- [ ] **Step 4: Rewrite the new guardrail line**

```diff
- - 如果同名变更已存在，建议用 `/opsx-continue`
+ - 同名变更已存在时由 Step 5 中止，不再继续
```

- [ ] **Step 5: Run the invariant suite**

Run: `node --test test/setup-template-invariants.test.js`
Expected: all cases PASS, including existing base-branch and scaffold-only cases.

- [ ] **Step 6: Commit**

```bash
git add template/.opencode/commands/opsx-propose.md template/.opencode/commands/opsx-new.md
git commit -m "feat(template): stop propose and new when the change name is taken"
```

---

## Task 4: CHANGELOG and full regression

**Files:**
- Modify: `CHANGELOG.md` (`## [1.1.2]` → `### Changed`)

- [ ] **Step 1: Append the Changed entry**

At the end of the `### Changed` list under `## [1.1.2]`, add:

```markdown
- **`/opsx-ff` 可从任意状态补完 artifacts**：再次执行时若 change 已存在则跳过创建、只补齐未完成的 artifacts，全部完成时不产生空提交；`/opsx-propose` 与 `/opsx-new` 在名字已被占用时主动中止并给出继续方式（`/opsx-continue` 逐个 / `/opsx-ff` 一次补齐）。
```

- [ ] **Step 2: Confirm README untouched**

Run: `git status --porcelain README.md README.zh-CN.md`
Expected: no output (these files are not part of this change).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: all green; test count >= baseline plus the new cases. If Windows returns 9009 (spawn error), run `node --test --test-concurrency=1 "test/*.test.js"` and record the deviation.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): note opsx-ff idempotent convergence"
```

---

## Task 5: Real-environment verification (AC1–AC5) and static AC6

**Files:**
- No repository files change in this task; it produces evidence only.

**Interfaces:**
- Consumes: the three updated template files.
- Produces: recorded command output for AC1–AC6.

- [ ] **Step 1: Create a temp project with the local build**

Run from the repo root:

```bash
node dist/cli/index.js init "$env:TEMP\oso-ff-acceptance"
```

Expected: init completes (8/8) and the temp project has `.opencode/commands/opsx-ff.md` with the new Step 4 (verify by reading the file).

- [ ] **Step 2: AC1 — resume a partially completed change**

In the temp project: create `demo`, generate artifacts, then delete one unfinished artifact. Execute the new `opsx-ff.md` steps literally (or via `/opsx-ff demo`).
Expected: `openspec new change` is skipped, only the missing artifact is recreated, no error. Then run again with all artifacts done: command ends normally and Output prompts `/opsx-apply` or `/opsx-archive`.

- [ ] **Step 3: AC2 — worktree exists, change missing**

```bash
node dist/cli/index.js ensure-worktree demo2   # no `openspec new change`
```

Then execute `/opsx-ff demo2` steps.
Expected: the change is created inside the worktree, then artifacts are generated.

- [ ] **Step 4: AC3 — registry entry missing**

```bash
node dist/cli/index.js registry reset
```

Then execute `/opsx-ff demo` steps.
Expected: the registry entry is restored and its `baseBranch` equals the first registration's value.

- [ ] **Step 5: AC4 — no empty commit**

Run `/opsx-ff` again on a complete change; run `git log --oneline -3` in the worktree.
Expected: no new commit; the command does not fail.

- [ ] **Step 6: AC5 — propose/new abort**

Run `/opsx-propose demo` and `/opsx-new demo` (change already exists).
Expected: both stop; output contains `/opsx-continue` and `/opsx-ff`; `openspec/changes/demo/` contents unchanged.

- [ ] **Step 7: AC6 — static judgement check**

```bash
grep -n "test -d openspec/changes/<name>" template/.opencode/commands/opsx-ff.md template/.opencode/commands/opsx-propose.md template/.opencode/commands/opsx-new.md
grep -n "openspec list" template/.opencode/commands/opsx-ff.md template/.opencode/commands/opsx-propose.md template/.opencode/commands/opsx-new.md
```

Expected: the first grep shows the `test -d` check in all three files; the second shows no `openspec list` in any of the three.

- [ ] **Step 8: Record evidence**

Write the AC1–AC6 commands, outputs, and conclusions into the change's `verify.md` during the verify phase. Do not commit `verify.md` early.

---

## Self-Review

- **Spec coverage:** `opsx-change-convergence` requirements map to Task 1/2 (existence, ff creation, top-up, commit guard, propose/new abort, registry restore) and Task 3 (propose/new). `opsx-template-command-parity` modified requirements map to Task 2 Step 3 (Output count + skipped) and Task 3 Steps 2/4 (guidelines/guardrails no longer suggest `/opsx-continue` passively).
- **Step scan:** each step names the file, the exact replacement text, and the command whose output decides pass/fail.
- **Type consistency:** helper names (`readCommand`, `sectionOf`, `fencedCommands`) and markers (`### Step 4`, `#### Step 4a`, `### Step 5`, `#### Step 5a`, `### Step 6`, `### Output`) match the files as they exist.
- **Review Focus:** all five items have a test or an acceptance step (archived name → Task 1 Step 1 archive assertion; unregistered change → AC6/Task 1; no empty commit → Task 1 Step 1 + AC4; scaffold-only → existing invariant + Task 3 Step 5; `registry add` collision → Global Constraints).
