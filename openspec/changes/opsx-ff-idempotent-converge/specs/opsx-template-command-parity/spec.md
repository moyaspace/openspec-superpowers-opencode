## MODIFIED Requirements

### Requirement: Propose and ff generate the full artifact set until apply requirements are done

`opsx-propose.md` SHALL describe the full-artifact generation loop that matches the production version: using `TodoWrite` to track artifact progress, iterating per artifact in dependency order, and looping until every artifact in `openspec status --change <name> --json` whose id is listed in `applyRequires` has status `done`.

`opsx-ff.md` SHALL use the convergent loop defined by the `opsx-change-convergence` capability instead: it processes only `ready` artifacts whose `requires` chain does not contain an `applyRequires` artifact, and terminates when no such artifact remains, so a missing pre-apply artifact outside the `applyRequires` closure is still topped up while `verify` and `retrospective` are not generated.

#### Scenario: propose loops until all applyRequires are done

- **WHEN** `/opsx-propose` runs on a change
- **THEN** it keeps creating artifacts (using TodoWrite tracking) until every `applyRequires` artifact reports `done`, rather than stopping after proposal + design + tasks

#### Scenario: ff tops up off-path pre-apply artifacts without generating post-apply ones

- **WHEN** every `applyRequires` artifact is `done` but a pre-apply artifact outside that closure (such as `design`) is missing
- **THEN** `/opsx-ff` creates the missing pre-apply artifact and still does not create `verify` or `retrospective`

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
