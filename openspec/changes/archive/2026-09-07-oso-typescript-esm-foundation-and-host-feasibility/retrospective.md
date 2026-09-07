# Retrospective: oso-typescript-esm-foundation-and-host-feasibility

Evidence-first retrospective. Sources: verify.md (PASS), stage-gate-report.md, capability-matrix.md, decisions.md, post-gate-review-qa history (local git), 46 commits on feature branch.

## 0. Evidence

- Final `npm test` (2026-09-06, worktree HEAD): exit 0 — main suite 199/199, elevated 5/5 (shim e2e 3, symlink 1, lifecycle 1), plus openspec-cli-integration 3/3.
- Gate commands recorded in stage-gate-report.md (typecheck/build/e2e all exit 0; legacy symlink EPERM resolved by elevated orchestration).
- 46 commits ahead of origin/main; worktree clean at finish.

## 1. Wins

- **Probe-first avoided a dead end**: the 0A probe proved real-host feasibility (and surfaced ini@7/engine conflicts) before any mass migration, so 0B was mechanical.
- **Behavior baseline discipline**: freezing 203 pre-migration tests made "equivalence" checkable, not aspirational — IMP-16 tarball equivalence passed on first full run.
- **Host-probe as machine evidence**: host-probe-run.json + capability-matrix turned "opencode works" into assertions.
- **Cost fixes landed before release**: files whitelist ballooning (98.3MB→686KB) and Node 24 `.ts` mis-discovery were both caught and fixed in-repo.
- **Test architecture settled**: 199 main + 10 e2e-in-elevated (gsudo orchestrated) + host-probe on version change; one-pass `npm test`, always green on any permission level.

## 2. Misses

- **Transition-era scaffolding lingered**: src/package.json / post-build.mjs / clean-dist.mjs survived the migration for days until questioned; root-cause: finish-checklist lacked a "temporary scaffolding?" review item.
- **files whitelist regression went unnoticed for days**: probe's node_modules entered the tarball via `test/` whitelist after the host-probe move (98.3MB). Only surfaced when a lifecycle test packed the repo. Root-cause: no size/content assertion on the tarball.
- **Shell-hygiene incidents recurred** (stray files from quoting accidents, logs in repo root). Mitigation landed (.gitignore `*.log`), but the discipline point stands: prefer file-based scripts over inline one-liners in this environment.
- **verify.md was skipped during apply** (Q2); it had to be produced at finish time. The retrospective/verify PRECHECKs caught it — but the gap was known earlier.

## 3. Plan deviations

- **Spec 10.2.1 amended (user-approved)**: stage-gate-report additionally mirrored into the change directory; probe-usage-guide + runtime-model relocated to local/docs as global references. Reason: global-value docs initially lived in a stage-scoped directory.
- **D-1 revised post-gate**: plugin pinned 1.14.48 during stage 0 (npm-side engine conflict), decision corrected after evidence showed deployment path is Bun-based (no user Node impact); final decision: switch to 1.18.29 at phase 5 behind probe re-run.
- **E2E-2 assertion rewritten**: original manual-checklist assertion (schemas/ dir deployed by CLI) was wrong — schema consumption is proven via CLI output and .openspec.yaml content, not directory presence.
- All deviations were user-approved before implementation; none silently altered spec guarantees.

## 4. Skill / workflow compliance

- TDD (RED→GREEN→REFACTOR) followed for 0B migration batches; probe tests written before host-probe dependencies were trusted.
- `/opsx-*` flow used end-to-end: propose → apply → verify (artifact produced at finish) → finish. No manual artifact simulation.
- Worktree isolation held: main untouched (46 commits ahead), registry entry intact until finish.
- `### Deliberately Skipped Skills`
  - `finishing-a-development-branch` was read at finish (not before) — acceptable, but reading it at apply time would have surfaced the elevated-suite design earlier.
  - No other skills skipped; no anti-pattern justifications needed.

## 5. Surprises

- **opencode consumes bare-name plugins via bun from npm registry** — unpublished packages fail silently; local-bridge workaround discovered and documented (runtime-model doc).
- **Node 24 default test discovery includes `.ts`** — moving host-probe under `test/` made node --test execute probe sources as tests; fixed with explicit globs.
- **headless `chat.message` lacks messageID** (D-2) — pending-first design already anticipated it, so it cost nothing now and saved phase 5.
- **Empty-project `opencode run` Bun panic** — environment-level, tracked as phase-5 pre-work item C.

## 6. Promote candidates → long-term learning

- **"Probe before migrate"** for host-tool integrations: an isolated real-environment probe package beats fixing integration mid-migration. (Already promoted: host-probe is a permanent asset.)
- **"files whitelist is a release surface"**: any test-fixture dependency added under a whitelisted directory must re-verify tarball size/contents. Candidate: add tarball size guard to `npm test`.
- **"Transition-era scaffolding needs an explicit demolition list"**: at finish, grep for `过渡期/transition/temporary` comments and remove the scaffolding they mark. (Applied this change; candidate for AGENTS.md.)
- **"Windows symlink tests need an elevation story"**: skip-with-notice or orchestrated elevation, never raw EPERM failures. (Implemented: test/elevated + run.mjs.)
