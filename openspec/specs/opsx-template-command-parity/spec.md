# opsx-template-command-parity Specification

## Purpose
本 capability 保证模板版 `opsx-propose` / `opsx-ff` 与生产版在完整产物生成循环、输出格式与 Artifact Creation Guidelines 上的一致性，同时明确 `opsx-new` 仅做脚手架、不生成全量产物。
## Requirements
### Requirement: Propose and ff generate the full artifact set until apply requirements are done

The template command files `opsx-propose.md` and `opsx-ff.md` SHALL describe the full-artifact generation loop that matches the production version: using `TodoWrite` to track artifact progress, iterating per artifact in dependency order, and looping until every artifact in `openspec status --change <name> --json` whose id is listed in `applyRequires` has status `done`.

#### Scenario: propose loops until all applyRequires are done

- **WHEN** `/opsx-propose` runs on a change
- **THEN** it keeps creating artifacts (using TodoWrite tracking) until every `applyRequires` artifact reports `done`, rather than stopping after proposal + design + tasks

### Requirement: Output section reports an artifact count

The `Output` section of `opsx-propose.md` and `opsx-ff.md` SHALL report the number of artifacts created (an "N artifacts" style count) instead of enumerating specific file names.

#### Scenario: output counts artifacts

- **WHEN** the propose or ff command finishes generating artifacts
- **THEN** its Output section reports the count of created artifacts (e.g. `<N> 个 artifacts`)

### Requirement: Artifact Creation Guidelines block is present

`opsx-propose.md` and `opsx-ff.md` SHALL each contain an `Artifact Creation Guidelines` section matching the production version (context/rules as constraints not content, read dependencies first, ask via `question` when unclear, confirm each file is written, suggest `/opsx-continue` for duplicates).

#### Scenario: guidelines section parity

- **WHEN** the two template files are compared against the production command files
- **THEN** both contain an equivalent `Artifact Creation Guidelines` section

### Requirement: opsx-new stays scaffold-only

`opsx-new.md` SHALL NOT become a full-artifact generator. It creates the change, shows the first artifact's template and instruction, and commits the scaffold; it MUST NOT gain the full-artifact loop, an artifact-count Output, or an `Artifact Creation Guidelines` section.

#### Scenario: new does not generate all artifacts

- **WHEN** `/opsx-new` runs
- **THEN** it stops after showing the first artifact and committing the scaffold, and does not loop over `applyRequires`

