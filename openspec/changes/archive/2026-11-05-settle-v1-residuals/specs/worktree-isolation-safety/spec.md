## ADDED Requirements

### Requirement: ensure-worktree trusts only the git worktree registry

`runEnsureWorktree` MUST treat `git worktree list --porcelain` as the sole source of truth for whether `.worktrees/<name>` is a real worktree. It MUST NOT use `fs.existsSync` alone to decide that a worktree exists, and MUST NOT use `git rev-parse --is-inside-work-tree` as the deciding signal, because any subdirectory of the repository satisfies it. A path counts as the target worktree only when it is registered AND its own `git rev-parse --show-toplevel` equals the target directory.

#### Scenario: a plain empty directory is not reused

- **WHEN** `.worktrees/demo` exists as a plain empty directory that is not registered by git, and `ensure-worktree demo` runs
- **THEN** the command removes the empty directory, creates the real worktree through the normal path, and exits 0
- **AND** `git -C .worktrees/demo rev-parse --show-toplevel` equals `.worktrees/demo` itself

#### Scenario: a plain non-empty directory or file aborts without changes

- **WHEN** `.worktrees/demo` exists as a non-empty directory or a file and is not registered by git
- **THEN** the command exits non-zero with a clear message
- **AND** no file or directory inside the path is deleted or modified

#### Scenario: a real worktree is reused with zero side effects

- **WHEN** `.worktrees/demo` is a registered worktree on `feature/demo`
- **THEN** the command exits 0 and reports reuse
- **AND** the branch SHA and the worktree list are unchanged

### Requirement: Stale worktree metadata is pruned before judging

When the registry contains the target path but the directory no longer exists, `runEnsureWorktree` MUST run `git worktree prune`, re-read `git worktree list --porcelain`, and then decide again from the refreshed registry. It MUST NOT report success while the target directory is absent.

#### Scenario: manually deleted worktree directory is recreated

- **WHEN** `.worktrees/demo` is deleted from disk while its registration remains, and `ensure-worktree demo` runs
- **THEN** the command prunes the stale registration, re-reads the registry, actually creates the worktree, and exits 0
- **AND** `.worktrees/demo` exists afterwards as a real worktree

### Requirement: Existing branches are attached, never deleted

When `feature/<name>` exists and is not checked out by any worktree, `runEnsureWorktree` MUST create the worktree with `git worktree add <dir> feature/<name>`. It MUST NOT run `git branch -D` for `feature/<name>`, and the branch SHA MUST remain identical to the SHA before the command.

#### Scenario: removed worktree reattaches its existing branch

- **WHEN** `feature/demo` contains commits, `.worktrees/demo` was removed with `git worktree remove`, and `ensure-worktree demo` runs
- **THEN** the existing branch is attached to the new worktree
- **AND** `git rev-parse feature/demo` equals the SHA recorded before the worktree was removed

#### Scenario: a branch checked out elsewhere is not stolen

- **WHEN** `feature/demo` is already checked out at `.worktrees/demo2`
- **THEN** the command aborts with a message naming the other path
- **AND** the other worktree and the branch are left untouched

### Requirement: A reused worktree must be on the expected branch

When a registered target worktree exists, `runEnsureWorktree` MUST read its current branch via `git rev-parse --abbrev-ref HEAD` and compare it with `feature/<name>`. If they differ, the command MUST exit non-zero and print the branch it actually found. If they match, reuse MUST have zero side effects.

#### Scenario: wrong branch aborts and reports the current branch

- **WHEN** `.worktrees/demo` is a valid worktree checked out on `other`
- **THEN** `ensure-worktree demo` exits non-zero
- **AND** the output names `other` as the current branch

#### Scenario: correct branch reuses without side effects

- **WHEN** `.worktrees/demo` is a valid worktree on `feature/demo`
- **THEN** `ensure-worktree demo` exits 0 and reports reuse
- **AND** it does not change the branch, the worktree list, or any file

### Requirement: Creation and reuse run read-only post-validation

After creating or reusing a worktree, `runEnsureWorktree` MUST verify all three of the following and abort with the failing item named when any check fails:

1. `realpath(git -C <dir> rev-parse --show-toplevel)` equals `realpath(<dir>)`.
2. `git -C <dir> rev-parse --abbrev-ref HEAD` equals `feature/<name>`.
3. `realpath(git -C <dir> rev-parse --git-common-dir)` equals `realpath(<repoRoot>/.git)`.

#### Scenario: post-validation fails when the directory is not a worktree root

- **WHEN** a path is registered but its `--show-toplevel` does not equal itself
- **THEN** the command aborts and names the root-directory check as the failure

#### Scenario: successful creation passes all three checks

- **WHEN** the worktree is newly created
- **THEN** all three post-validation checks pass
- **AND** the command exits 0

### Requirement: Template commands validate worktree placement before copying

`opsx-propose.md` (Step 3a), `opsx-ff.md` (Step 3a), and `opsx-new.md` (Step 4a) MUST, after `ensure-worktree`, `cd` into the worktree with an explicit failure branch, then run two read-only checks before copying schemas and config:

- `test -z "$(git rev-parse --show-prefix)"`
- `test "$(git rev-parse --abbrev-ref HEAD)" = "feature/<name>"`

A failed `cd` or a failed check MUST stop and report, and MUST NOT enter the copy loop. The copy retry MUST be capped at one retry; a second failure MUST stop and report.

#### Scenario: cd failure stops before copying

- **WHEN** `ensure-worktree` exits 0 but `cd .worktrees/<name>` fails
- **THEN** the command stops and reports the failure
- **AND** it does not attempt to copy schemas or config

#### Scenario: wrong directory or branch stops before copying

- **WHEN** the current directory is not the worktree root, or its branch is not `feature/<name>`
- **THEN** the command stops and reports which check failed
- **AND** it does not retry the copy more than once

#### Scenario: all three templates carry both checks

- **WHEN** `opsx-propose.md`, `opsx-ff.md`, and `opsx-new.md` are inspected
- **THEN** each Step 3/4 section contains both `git rev-parse --show-prefix` and `git rev-parse --abbrev-ref HEAD` checks, an explicit `cd` failure branch, and a copy retry upper bound
