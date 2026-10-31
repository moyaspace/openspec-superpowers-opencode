# opsx-finish-test-dispatch Specification

## Purpose
TBD - created by archiving change oso-template-base-branch. Update Purpose after archive.
## Requirements
### Requirement: Test command dispatch prefers project-declared entry

The `template/.opencode/commands/opsx-finish.md` Step 3b SHALL dispatch the test command by preferring the project's own declared entry point over language-guessed commands. The priority SHALL be: project Makefile `test:` target → CI-declared explicit command → project documentation; language-default commands SHALL remain only as a fallback. When multiple candidate entries conflict or one is suspected to be a subset of another, the workflow SHALL ask the user which is the full-suite entry.

#### Scenario: project-declared entry used instead of language guess

- **WHEN** a project declares `make test` as its test entry and the finish workflow runs Step 3b
- **THEN** it runs the project-declared entry (e.g. `make test`) rather than a language-guessed `go test ./...`

#### Scenario: conflicting candidates prompt the user

- **WHEN** Step 3b finds more than one candidate test entry or a suspected subset
- **THEN** it asks the user (via the `question` tool) which candidate is the full-suite entry before running

### Requirement: Test failure classification distinguishes environment from regression

When the chosen test command fails, Step 3b SHALL first determine whether the failure is environmental (missing toolchain / build artifacts / spawn environment) before concluding a code regression. Environmental failures SHALL lead to fixing the environment or switching to an equivalent entry and re-running; only a genuine assertion failure after that SHALL be treated as a regression.

#### Scenario: environment failure is not judged as regression

- **WHEN** the test command fails because of a missing environment artifact rather than a failing assertion
- **THEN** Step 3b classifies it as environmental, retries with a corrected environment or equivalent entry, and does not immediately STOP as a regression

### Requirement: Template finish contains no machine-local absolute paths and keeps the placeholder

After the whole-file replacement, `template/.opencode/commands/opsx-finish.md` SHALL contain no machine-local absolute path (e.g. `C:\Users\...`) and SHALL retain the `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md` placeholder for the Superpowers skill path.

#### Scenario: replacement restores the placeholder

- **WHEN** the V1 production `opsx-finish.md` is copied into the template
- **THEN** its hard-coded skill path is replaced with `{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md` and no `C:\Users` string remains

