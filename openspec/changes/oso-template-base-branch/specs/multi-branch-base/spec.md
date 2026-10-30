## ADDED Requirements

### Requirement: Propose records the base branch in the registry

When `ensure-worktree` creates a change worktree, the CLI SHALL record the current branch (the branch from which the worktree was cut) as `baseBranch` on that change's registry entry. The base SHALL be read at the project root immediately after `git worktree add` succeeds, because that is the only point where the current HEAD reflects the true base.

#### Scenario: worktree created on release/1.1 records baseBranch

- **WHEN** the repository is on `release/1.1` and `ensure-worktree <name>` runs successfully
- **THEN** the entry for `<name>` in `openspec/oso-change-registry.json` contains `"baseBranch": "release/1.1"`

#### Scenario: base is not read from inside the worktree

- **WHEN** a subsequent `registry add <name> .worktrees/<name>` runs from inside the worktree without `--base`
- **THEN** it MUST NOT overwrite the previously recorded `baseBranch` (which would otherwise become `feature/<name>`)

### Requirement: Registry add uses merge semantics

The registry `add()` operation SHALL merge into an existing same-named entry rather than replacing it wholesale. Fields present on the existing entry but absent from the new call (for example `baseBranch` supplied during `ensure-worktree`) SHALL be preserved. When no `baseBranch` argument is provided, the operation SHALL NOT write a `baseBranch` key (no `undefined` empty key). An explicit `baseBranch` argument SHALL override the stored value.

#### Scenario: add without --base preserves an existing baseBranch

- **WHEN** an entry already has `baseBranch: "release/1.1"` and `registry add <name> <worktree>` is called without `--base`
- **THEN** the resulting entry still contains `baseBranch: "release/1.1"` and the other existing fields are retained

#### Scenario: add without --base creates no empty field

- **WHEN** a brand-new entry is added with `registry add <name> <worktree>` and no `--base`
- **THEN** the JSON entry contains no `baseBranch` key

#### Scenario: explicit --base overrides

- **WHEN** `registry add <name> <worktree> --base release/1.1` is called
- **THEN** the entry contains `"baseBranch": "release/1.1"`

### Requirement: Proposal carries a Base traceability header

After generating `proposal.md`, the propose workflow SHALL insert a blockquote line `> Base: <BASE_BRANCH>` at the top of the document. This header SHALL be preserved because it is the only long-term base record after the change is archived (the registry entry is removed at finish time).

#### Scenario: proposal.md records the base

- **WHEN** `propose` completes with base `release/1.1`
- **THEN** `openspec/changes/<name>/proposal.md` begins with a `> Base: release/1.1` line

### Requirement: Finish determines base from the registry and never defaults to main

The `opsx-finish` Step 6a SHALL determine the base branch in this order, without skipping: (1) read the `baseBranch` field for the change from the project-root `openspec/oso-change-registry.json`; (2) if absent, ask the user with the `question` tool; (3) if still undetermined, STOP without rebasing or merging. It MUST NOT assume `main` or `master`, and MUST NOT treat `base` and `main` as the same unless the user confirms the base is `main`. After determining the base, it SHALL restate the merge direction `feature/<name> → <base-branch>` and obtain confirmation.

#### Scenario: base read from registry and restated

- **WHEN** the registry entry for the change contains `baseBranch: "release/1.1"`
- **THEN** finish restates the merge direction as `feature/<name> → release/1.1` and proceeds without asking for a base

#### Scenario: missing baseBranch triggers a question, not a main default

- **WHEN** the registry entry has no `baseBranch`
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
