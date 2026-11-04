## MODIFIED Requirements

### Requirement: Output section reports an artifact count

The `Output` section of `opsx-propose.md` and `opsx-ff.md` SHALL report the number of artifacts created (an "N artifacts" style count) instead of enumerating specific file names. `opsx-ff.md` SHALL additionally report the number of already-completed artifacts skipped in this run (`<M>`), and when `<N>` is 0 it SHALL state that all artifacts are ready and suggest `/opsx-apply` or `/opsx-archive`.

#### Scenario: output counts artifacts

- **WHEN** the propose or ff command finishes generating artifacts
- **THEN** its Output section reports the count of created artifacts (e.g. `<N> 个 artifacts`)

#### Scenario: ff reports skipped artifacts and zero-created completion

- **WHEN** `/opsx-ff` finds every required artifact already done
- **THEN** its Output reports `<N>` as 0 and `<M>` as the number of skipped completed artifacts, and prompts `/opsx-apply` or `/opsx-archive`

### Requirement: Artifact Creation Guidelines block is present

`opsx-propose.md` and `opsx-ff.md` SHALL each contain an `Artifact Creation Guidelines` section matching the production version (context/rules as constraints not content, read dependencies first, ask via `question` when unclear, confirm each file is written). A duplicate change name MUST NOT be handled by a passive "suggest `/opsx-continue`" line; for `opsx-propose.md` it SHALL be handled by the Step 4 abort defined in the `opsx-change-convergence` capability.

#### Scenario: guidelines section parity

- **WHEN** the two template files are compared against the production command files
- **THEN** both contain an equivalent `Artifact Creation Guidelines` section

#### Scenario: propose does not defer duplicates to a guideline hint

- **WHEN** `opsx-propose.md` is scanned
- **THEN** its guidelines do not tell the reader to suggest `/opsx-continue` for an existing same-named change
