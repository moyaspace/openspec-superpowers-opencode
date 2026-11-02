# multi-branch-base Specification

## Purpose
本 capability 定义 change 的基础分支如何被创建命令（propose / ff / new）在 worktree 存在前捕获并写入注册表、如何经 `openspec list --json` 暴露，以及 finish 如何据此确定合并方向且禁止默认落到 `main`。
## Requirements
### Requirement: Creating commands record the base branch in the registry

The change-creating workflows `opsx-propose`, `opsx-ff`, and `opsx-new` SHALL read the current branch at the project root before any worktree exists (propose 2d, ff 2d, new 3d), carry that value through worktree creation, and write it into the change's registry entry via `registry add <name> .worktrees/<name> --base <BASE_BRANCH>` (propose 4a, ff 4a, new 5a). Each SHALL display it in its `Output` as the base branch. `ensure-worktree` SHALL NOT read or write the base. The recorded value SHALL NOT be derived from the worktree's own HEAD, which is `feature/<name>` at that point.

#### Scenario: propose writes baseBranch via registry add

- **WHEN** the repository is on `release/1.1` and propose reaches Step 4a
- **THEN** the entry for `<name>` in `openspec/oso-change-registry.json` contains `"baseBranch": "release/1.1"`

#### Scenario: ff and new record the base too

- **WHEN** the repository is on `release/1.1` and `/opsx-ff` reaches Step 4a or `/opsx-new` reaches Step 5a
- **THEN** the registry entry for `<name>` contains `"baseBranch": "release/1.1"`

#### Scenario: base is read at the project root, not inside the worktree

- **WHEN** the registry add step runs from inside `.worktrees/<name>`
- **THEN** it passes the value captured before worktree creation (project-root HEAD) and MUST NOT derive it from the current HEAD

### Requirement: Registry add uses merge semantics

The registry `add()` operation SHALL merge into an existing same-named entry rather than replacing it wholesale. Fields present on the existing entry but absent from the new call (for example `baseBranch` supplied by an earlier `registry add --base`) SHALL be preserved. When no `baseBranch` argument is provided, the operation SHALL NOT write a `baseBranch` key (no `undefined` empty key). An explicit `baseBranch` argument SHALL override the stored value.

#### Scenario: add without --base preserves an existing baseBranch

- **WHEN** an entry already has `baseBranch: "release/1.1"` and `registry add <name> <worktree>` is called without `--base`
- **THEN** the resulting entry still contains `baseBranch: "release/1.1"` and the other existing fields are retained

#### Scenario: add without --base creates no empty field

- **WHEN** a brand-new entry is added with `registry add <name> <worktree>` and no `--base`
- **THEN** the JSON entry contains no `baseBranch` key

#### Scenario: explicit --base overrides

- **WHEN** `registry add <name> <worktree> --base release/1.1` is called
- **THEN** the entry contains `"baseBranch": "release/1.1"`

### Requirement: openspec list --json exposes baseBranch

The oso `openspec list --json` shim SHALL include the change's `baseBranch` (as recorded in the project-root `openspec/oso-change-registry.json`) in each change object it emits, and SHALL omit the key entirely when no base was recorded. Command text SHALL obtain the base through this command rather than by parsing the registry file directly.

#### Scenario: recorded base appears in list output

- **WHEN** the registry entry for `demo` contains `baseBranch: "release/1.1"` and `openspec list --json` runs
- **THEN** the emitted change object for `demo` contains `"baseBranch": "release/1.1"`

#### Scenario: absent base is omitted, not null

- **WHEN** the registry entry for `demo` has no `baseBranch` and `openspec list --json` runs
- **THEN** the emitted change object for `demo` contains no `baseBranch` key

### Requirement: Finish determines base from openspec list --json and never defaults to main

The `opsx-finish` Step 6a SHALL determine the base branch in this order, without skipping: (1) read the `baseBranch` field for the change from `openspec list --json`; (2) if absent, ask the user with the `question` tool; (3) if still undetermined, STOP without rebasing or merging. It MUST NOT assume `main` or `master`, and MUST NOT treat `base` and `main` as the same unless the user confirms the base is `main`. After determining the base, it SHALL restate the merge direction `feature/<name> → <base-branch>` and obtain confirmation.

#### Scenario: base read from list output and restated

- **WHEN** `openspec list --json` reports `baseBranch: "release/1.1"` for the change
- **THEN** finish restates the merge direction as `feature/<name> → release/1.1` and proceeds without asking for a base

#### Scenario: missing baseBranch triggers a question, not a main default

- **WHEN** the change has no recorded `baseBranch`
- **THEN** finish asks the user for the base branch via the `question` tool and MUST NOT fall back to `main`

### Requirement: Template commands use the current or original branch as base

The template OPSX commands `opsx-propose`, `opsx-finish`, `opsx-ff`, `opsx-new`, and `opsx-continue` SHALL NOT hard-code a bare `main` reference nor contain operational `main` instructions (`git checkout|switch|merge|rebase ... main`). They SHALL refer to the original/current branch instead, while retaining backticked `main` only in guard sentences (e.g. "MUST NOT merge into `main` unless the base is `main`").

#### Scenario: no bare or operational main in the five template commands

- **WHEN** the five template command files are scanned
- **THEN** the count of bare `main` (not wrapped in backticks) is 0 and operational `git ... main` instructions are 0

### Requirement: Main-based flow remains unregressed

Existing workflows that legitimately use `main` as the base SHALL continue to work. The change MUST NOT alter the behavior of the main-based propose → finish flow beyond reading the recorded base (which equals `main` in that case).

#### Scenario: main base still merges to main

- **WHEN** a change is created while on `main`, so its `baseBranch` is `main`
- **THEN** finish merges `feature/<name> → main` exactly as before

