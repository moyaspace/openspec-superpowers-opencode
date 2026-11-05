# test-run-global-isolation Specification

## Purpose
TBD - created by archiving change settle-v1-residuals. Update Purpose after archive.
## Requirements
### Requirement: Removing the global shim restore fallback is evidence-gated

Removal of `restoreGlobalShim()` and its supporting code from `scripts/run-tests.mjs` MUST be preceded by all three of the following evidence items, and none may be skipped:

1. After at least five consecutive `npm test` runs (on the Windows host; the CI ubuntu/macos first-run recheck is recorded in `verify.md` as a limitation, not yet executed), the global shim `TOOL_DIR` still points at the formal installation and `openspec-shim-e2e` reliably collects all three cases.
2. Every test that calls `installShims()` has been checked and its bin resolution is fully isolated.
3. A temporary log at the restore point proves the state before and after restore is identical (a no-op).

If all three hold, the change MUST remove `restoreGlobalShim()`, `findGlobalOso()`, the `OSO_SKIP_SHIM_RESTORE` branch, the `finally` call, and the failure-exit logic, and MUST update any documentation that describes the mechanism.

#### Scenario: no-op restore is proven and the fallback is removed

- **WHEN** all three evidence items are recorded in `verify.md` and the restore is proven to be a no-op
- **THEN** the fallback functions, environment branch, `finally` call, and failure-exit logic are deleted
- **AND** `npm test` still passes with the baseline case count

#### Scenario: evidence is incomplete and the fallback stays

- **WHEN** any of the three evidence items is missing or contradicts the no-op conclusion
- **THEN** the fallback MUST NOT be deleted
- **AND** the task item is recorded as partial rather than complete

### Requirement: Remaining pollution is fixed at the source

If verification shows the global shim is still being polluted, the change MUST fix the polluting test so that its bin resolution is genuinely isolated. Keeping `restoreGlobalShim()` as a temporary mitigation is allowed, but MUST NOT be recorded as completing the item; the status MUST be `部分完成` and the polluting test and mechanism MUST be named.

#### Scenario: a polluting test is identified and isolated

- **WHEN** verification shows a test writes the global shim despite the isolation intent
- **THEN** that test is changed so `installShims()` resolves to an isolated bin directory
- **AND** the fallback may remain, with the item marked `部分完成`

#### Scenario: evidence is recorded in verify.md

- **WHEN** the change is verified
- **THEN** `verify.md` contains the run count, the per-test isolation audit, and the no-op log result

