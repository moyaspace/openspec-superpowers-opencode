## ADDED Requirements

### Requirement: Change existence is judged inside the worktree

The template commands `opsx-ff.md`, `opsx-propose.md`, and `opsx-new.md` MUST judge whether a change already exists by running `test -d openspec/changes/<name>` from inside the change worktree. They MUST NOT use `openspec list` as an existence check, because it returns the registry's active changes rather than on-disk change directories. They MUST NOT perform the check outside the worktree. A same-named directory under `openspec/changes/archive/` SHALL NOT be treated as a conflict, and a same-named change that exists only on the base branch but not in the current worktree SHALL NOT be detected.

#### Scenario: an unregistered change is still detected

- **WHEN** `.worktrees/<name>/openspec/changes/<name>/` exists but the change is absent from `openspec/oso-change-registry.json`
- **THEN** each of the three commands treats the change as existing, because the check is `test -d openspec/changes/<name>` and not a registry query

#### Scenario: an archived same-named change is not a conflict

- **WHEN** `openspec/changes/archive/<date>-<name>/` exists and `openspec/changes/<name>/` does not
- **THEN** `opsx-propose.md` and `opsx-new.md` proceed to create the change rather than aborting

#### Scenario: archived names are explicitly out of scope

- **WHEN** any of the three command files is inspected for existence checks
- **THEN** it contains no check of `openspec/changes/archive/`

### Requirement: ff converges from any state by creating only when the change is missing

`opsx-ff.md` Step 4 SHALL first run `test -d openspec/changes/<name>`. When the directory exists it MUST skip `openspec new change` and proceed directly to Step 4a. When it does not exist it SHALL run `openspec new change "<name>"`; on failure it MUST stop and report, without retrying and without creating the directory manually.

#### Scenario: ff resumes an existing change without re-creating it

- **WHEN** `/opsx-ff <name>` runs in a worktree where `openspec/changes/<name>/` already exists
- **THEN** it does not execute `openspec new change`, does not fail, and continues to the registry step and artifact loop

#### Scenario: ff creates a missing change in an existing worktree

- **WHEN** the worktree `.worktrees/<name>/` exists but `openspec/changes/<name>/` does not
- **THEN** `/opsx-ff` creates the change in that worktree and continues generating artifacts

#### Scenario: change creation failure stops the command

- **WHEN** `openspec new change "<name>"` returns a non-zero exit code
- **THEN** `/opsx-ff` stops and reports the failure, and MUST NOT retry or create the directory by hand

### Requirement: ff tops up only unfinished artifacts and treats zero created as success

`opsx-ff.md` Step 5 SHALL process only artifacts whose status is `ready` and whose transitive `requires` chain does not contain any artifact listed in `applyRequires`; post-apply artifacts are produced after the apply phase and `ff` MUST NOT generate them. Step 5 SHALL terminate when no such artifact remains, and MUST NOT terminate merely because every `applyRequires` artifact is `done` — a pre-apply artifact outside the `applyRequires` closure (for example `design`) MUST still be topped up. When no artifact remains to be created, the command SHALL finish normally and its Output SHALL state that all artifacts are ready and suggest `/opsx-apply` or `/opsx-archive`.

#### Scenario: a partially completed change is topped up

- **WHEN** a change has some artifacts done and one pre-apply artifact deleted
- **THEN** re-running `/opsx-ff` creates only the missing artifact, without duplicating or overwriting the existing ones

#### Scenario: all artifacts done is a successful no-op

- **WHEN** every non-post-apply artifact reports `done`
- **THEN** `/opsx-ff` exits successfully and prompts `/opsx-apply` or `/opsx-archive`

### Requirement: ff commits only when there are staged changes

`opsx-ff.md` Step 6 SHALL run `git add -A` and then `git diff --cached --quiet || git commit -m "change: <name>"`. When there is nothing staged, it MUST skip the commit and MUST NOT treat the absence of a commit as a failure.

#### Scenario: re-running on an unchanged, complete change creates no commit

- **WHEN** `/opsx-ff` runs again after all artifacts are committed and nothing has changed
- **THEN** `git diff --cached --quiet` succeeds, no commit is created, `git log` shows no new commit, and the command does not fail

#### Scenario: new artifacts are committed

- **WHEN** the artifact loop wrote at least one new or modified file
- **THEN** `git add -A` stages it, `git diff --cached --quiet` reports differences, and `git commit -m "change: <name>"` records the commit

### Requirement: Creating commands abort when the name is occupied

`opsx-propose.md` Step 4 and `opsx-new.md` Step 5 SHALL run `test -d openspec/changes/<name>` before creating. When the directory exists they MUST stop, MUST NOT overwrite or modify the existing change, and MUST report both continuation paths: `/opsx-continue <name>` for one artifact at a time and `/opsx-ff <name>` to fill all remaining artifacts at once. When the directory does not exist they SHALL run `openspec new change "<name>"` and stop if it fails.

#### Scenario: propose aborts on an existing change

- **WHEN** `/opsx-propose <name>` runs and `openspec/changes/<name>/` already exists in the worktree
- **THEN** it stops before creating anything, reports that the change already exists, and its output contains both `/opsx-continue` and `/opsx-ff`

#### Scenario: new aborts on an existing change

- **WHEN** `/opsx-new <name>` runs and `openspec/changes/<name>/` already exists in the worktree
- **THEN** it stops before creating anything, reports that the change already exists, and its output contains both `/opsx-continue` and `/opsx-ff`

#### Scenario: existing change files are not overwritten

- **WHEN** either creating command aborts on an occupied name
- **THEN** the pre-existing change directory and its artifacts are left unchanged

### Requirement: ff restores a missing registry entry and preserves the recorded base

`opsx-ff.md` Step 4a SHALL run the registry registration on every invocation, relying on the merge semantics of `registry add`. When the entry is missing it SHALL be recreated; when it exists, the previously recorded `baseBranch` and `createdAt` SHALL be preserved. `opsx-ff.md` MUST NOT clear or rewrite the registry before registering.

#### Scenario: registry reset is repaired by re-running ff

- **WHEN** `oso registry reset` removed the entry and `/opsx-ff <name>` runs again
- **THEN** the entry is restored with the same `baseBranch` as the first registration

#### Scenario: repeated registration is idempotent

- **WHEN** the entry already exists with a `baseBranch` and `/opsx-ff` registers again with the same base
- **THEN** the entry keeps its original `createdAt` and the same `baseBranch`
