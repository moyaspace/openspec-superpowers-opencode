# Verify: oso-typescript-esm-foundation-and-host-feasibility

> Post-implementation verification against the 4 delta specs (17 Scenarios), plan.md micro-tasks, and tasks.md checklist. Evidence-first: every Scenario is mapped to the automated test(s) or probe/e2e evidence that proves it, with the actual command to re-execute.

## Overall Decision

- [x] ✅ PASS
- [ ] ⚠️ PASS WITH CONCERNS
- [ ] ❌ FAIL

All 17 Scenarios across the 4 capabilities are covered by automated tests that ran green in the final full verification (`npm test` → exit 0; counts: main suite 199 pass, shim e2e 3 pass, elevated 5 pass incl. lifecycle 4). No Scenario relies on manual-only judgment.

## Capability 1: typescript-esm-build-baseline (4 Scenarios)

| Scenario | Evidence (test / command) | Result |
| --- | --- | --- |
| Strict TS config compiles to clean ESM dist | `npm run typecheck` (exit 0) + `npm run build` (exit 0); `test/no-cjs.test.js` scans dist for require/module.exports/`__dirname` | ✅ |
| package.json ESM fields frozen (type/exports/bin/files/engines) | `test/setup-package.test.js` ("exposes the Node test suite…", "ships the JavaScript setup modules…") + `test/imp16-tarball-equivalence.test.js` | ✅ |
| dist artifacts: d.ts + sourcemap + ESM marker | build output verified in final `npm test` run (post-build assets present; dist/package.json ESM marker superseded by root `type: module` after 2026-09-06 cleanup) | ✅ |
| Version matrix frozen (TS 7.0.2 / Node >=22.9 / plugin 1.14.48→1.18.29 decision) | `docs/tasks.md` phase-0 row + stage-gate-report versions; `test/host-probe` proves the matrix live | ✅ |

## Capability 2: dual-esm-entry-isolation (4 Scenarios)

| Scenario | Evidence | Result |
| --- | --- | --- |
| tarball contains only whitelisted files | `test/host-probe/test/tarball-dual-entry.test.ts` "tarball 只包含 dist/ 与 package.json（files 白名单生效）" | ✅ |
| CLI entry runs without registering plugin hooks (reverse isolation) | same file, "安装 tarball 后：插件入口可 import、CLI 可执行且互不越界、无安装副作用" | ✅ |
| plugin entry loads without executing CLI logic (forward isolation) | same test (dual-entry assertions) + global load-count markers in probe | ✅ |
| zero install side effects (no .opencode/package.json, no src copy) | same file, side-effect assertions | ✅ |

## Capability 3: host-compatibility-probe (4 Scenarios)

| Scenario | Evidence | Result |
| --- | --- | --- |
| plugin loads exactly once in real OpenCode | `test/host-probe/test/host-probe.test.ts` "真实 OpenCode：加载 ESM 插件、typed 工具调用、session.idle" (plugin-called count == 1) | ✅ |
| typed tool invoked by real model with declared args | same test (`probe_typed_echo` args.message == 'phase-0a-host-check') | ✅ |
| tool context fields complete (directory/worktree) | same test (tool_directory/tool_worktree asserted) | ✅ |
| session.idle observable; capability matrix records Hook facts | same test + `openspec/changes/.../capability-matrix.md` + `host-probe-run.json` machine evidence | ✅ |

## Capability 4: behavior-equivalence-migration (5 Scenarios)

| Scenario | Evidence | Result |
| --- | --- | --- |
| pre-migration behavior baseline frozen (203 tests @ git aaefc6cd1) | baseline freeze commit; final suite inherits all baseline cases (now 199 main after elevated split, semantics preserved) | ✅ |
| 19 modules migrated without behavior change (setup/registry/verify/shims/CLI) | `test/setup-*.test.js` (7 files), `test/registry*.test.js` (57), `test/verify.test.js` (37), `test/shims-installer.test.js` (36) | ✅ |
| shim assets relocated to assets/shims with dist delegation | `test/shims-installer.test.js` + `test/shim-intercept.test.ps1` + elevated e2e `test/openspec-shim-e2e.test.js` (3/3 real-CLI pass) | ✅ |
| CommonJS fully removed; no dual-format residue | `test/no-cjs.test.js` (dist scan) + bin/lib absence asserted in migration tests | ✅ |
| tarball behavior equivalence vs baseline (IMP-16) | `test/imp16-tarball-equivalence.test.js` (CLI version/help/create-project/registry+setup API/shim delegation/zero side effects/error exit codes) | ✅ |

## E2E (elevated, real environments)

| Suite | Count | What it proves beyond unit tests |
| --- | --- | --- |
| `test/openspec-shim-e2e.test.js` | 3/3 | real global shim interception/passthrough against installed openspec CLI |
| `test/openspec-cli-integration.test.js` | 3/3 | real openspec CLI consumes OSO schema templates (new change + instructions) |
| `test/elevated/lifecycle-e2e.test.js` | 4/4 | real npm pack → install -g → oso init → registry → reset full chain |
| `test/elevated/shims-installer.elevated.test.js` | 1/1 | symlink fixture under elevation |

## Non-blocking notes

- Windows symlink elevation handled by `test/elevated/run.mjs` (gsudo orchestration); non-elevated runs show the elevated suite via gsudo automatically.
- plugin deployment version decision (1.18.29 at phase 5) recorded in stage-gate-report D-1 note and spec docs; probe re-run required on version change (IMP-0510).

## Verification Commands (re-execute)

```powershell
npm test            # typecheck + build + main suite + elevated e2e (gsudo), exit 0
# host probe (only on opencode/plugin version change):
cd test/host-probe; npm run typecheck; npm run build; npm run test
```
