## ADDED Requirements

### Requirement: Verify PRECHECK derives commit evidence from the change's baseBranch

The verify artifact instruction in both `template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` and `openspec/schemas/superpowers-bridge-opencode/schema.yaml` MUST determine the commit-evidence baseline in this order:

1. Read the change's `baseBranch` through `openspec list --json`.
2. If `baseBranch` is absent, fall back to `origin/main` and require `verify.md` §5 to record `baseline: origin/main (registry had no baseBranch)`.
3. Count with `git log --oneline <base>..HEAD | wc -l`.

The `origin/main` form MUST NOT be the primary path. Both schema files MUST carry the same wording, so the repository's self-hosted copy and the copy deployed by `oso init` do not diverge.

#### Scenario: baseBranch is used when present

- **WHEN** the change's registry entry contains `baseBranch: "release/1.1"` and verify runs
- **THEN** the commit count is computed with `git log --oneline release/1.1..HEAD | wc -l`
- **AND** `origin/main` is not used as the baseline

#### Scenario: missing baseBranch falls back and is annotated

- **WHEN** the change's entry has no `baseBranch`
- **THEN** the baseline falls back to `origin/main`
- **AND** `verify.md` §5 records `baseline: origin/main (registry had no baseBranch)`

#### Scenario: both schema copies use the new wording

- **WHEN** the two `schema.yaml` files are inspected by `test/setup-template-invariants.test.js`
- **THEN** each verify PRECHECK references `openspec list --json` and `baseBranch`
- **AND** neither uses the `origin/main` merge-base form as its primary command
