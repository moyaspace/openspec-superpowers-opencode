# openspec-superpowers-opencode (aka oso)

> **中文版 → [docs/README.zh.md](docs/README.zh.md)**

**CLI scaffold that bridges Superpowers + OpenSpec workflows into OpenCode.**

- **GitHub**: `https://github.com/moyaspace/openspec-superpowers-opencode`
- **npm**: `https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode`
- **Author**: rl <robincn@gmail.com>
- **License**: MIT

## Features

| # | Feature | One-liner |
|---|---------|-----------|
| 1 | **One-command init** | `openspec-superpowers-opencode init` → deploy templates + config + first commit |
| 2 | **12 OPSX commands** | `/opsx-ff` → `/opsx-apply` → `/opsx-finish` covers the full change lifecycle |
| 3 | **Git worktree isolation** | Each change lives in its own `.worktrees/<name>/` dir and `feature/<name>` branch; main stays clean |
| 4 | **Layered architecture** | Superpowers (HOW) → OpenSpec (WHAT) → Worktree (WHERE) → Commands (WHEN) |
| 5 | **Greenfield/brownfield** | Auto-deploy on new projects; per-file overwrite prompts on existing ones |
| 6 | **Brownfield override system** | `BROWN_OVERRIDE_*` env vars or interactive prompts control overwrite decisions |
| 7 | **Skill lock verification** | SHA-256 hashes of upstream Superpowers skill files are validated on deploy |
| 8 | **Cross-platform + i18n** | Windows (`setup.ps1`) / Linux (`setup.sh`), `--lang zh-CN | zh-TW | en` |

> Detailed feature descriptions → [docs/FEATURES.md](docs/FEATURES.md).

## Install

```bash
# From npm
npm install -g @moyaspace/openspec-superpowers-opencode

# From local tgz (offline/preview)
npm install -g ./<name>-<version>.tgz

# Verify
openspec-superpowers-opencode --help
```

Requirements: `openspec` CLI v1.3+, `opencode` CLI, `git`, Superpowers plugin.

## Usage

```powershell
# One-step init
mkdir my-project && cd my-project
openspec-superpowers-opencode init

# Or specify a target directory
openspec-superpowers-opencode init my-project
```

`init` automatically: deploys template files → `git init` → first commit.

## Prerequisites

- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers plugin installed

The setup script will check these automatically.

## Using in OpenCode

Open the initialized project in OpenCode, then use the full workflow:

| Command | Description |
|---------|-------------|
| `/opsx-ff <name>` | Create a change and generate all artifacts |
| `/opsx-apply [name]` | Get context, start implementation |
| `/opsx-verify` | Verify implementation vs spec |
| `/opsx-finish [name]` | Complete change (merge/cleanup) |
| `/opsx-archive` | Archive completed changes |

### Parallel changes

Each change is isolated in its own git worktree. AI handles all directory switching:

```bash
# Create two changes simultaneously
/opsx-ff feature-a        # → background: cd .worktrees/feature-a/ create artifacts → back to main
/opsx-ff feature-b        # → background: cd .worktrees/feature-b/ create artifacts → back to main

# Switch to feature-a (AI auto-cds)
/opsx-apply feature-a     # → background: cd .worktrees/feature-a/ code, commit
# ... write code ...

# Switch to feature-b (no need to finish feature-a first)
/opsx-apply feature-b     # → background: cd .worktrees/feature-b/ code, commit
# ... write code ...

# Finish independently
/opsx-finish feature-a    # → background: test → merge → cleanup worktree
/opsx-finish feature-b
```

| Concept | Description |
|---------|-------------|
| One worktree per change | `.worktrees/<name>/` dir + `feature/<name>` branch, fully isolated |
| Named switch | `/opsx-apply <name>`, `/opsx-finish <name>` targets the right worktree |
| Omitting name | Auto-detected from `.worktrees/`; single → use it, multiple → AskUser |
| Transparent directories | AI handles all `cd`, user only types command names |
| Main stays clean | All artifacts and code stay in their worktrees |

### Browsing worktree content manually

```bash
# List worktree directory
cd .worktrees/<name>
ls -la

# View change branch history
git log feature/<name>

# Back to project root
cd <project-root>
```

Usually not needed—editors can browse `.worktrees/<name>/` directly.

## CLI Commands

| Command | Description |
|---------|-------------|
| `openspec-superpowers-opencode init` | Initialize a project |
| `openspec-superpowers-opencode reset` | Revert to uninitialized state (removes all installed files) |
| `openspec-superpowers-opencode dry-run` | Preview changes |
| `openspec-superpowers-opencode ensure-worktree <name>` | Ensure a worktree exists |
| `create-openspec-superpowers-opencode` | Alias, equivalent to init |

## Updating Project Templates

`reset + init` does NOT touch Superpowers skill files—those are managed by the Superpowers plugin itself.
`reset + init` only redeploys packaged template files (`AGENTS.md`, `schema.yaml`, `skills.lock.json`, etc.).

Two types of updates:

| What updates | Action | Notes |
|-------------|--------|-------|
| Superpowers plugin | **Nothing needed** | Skills update themselves, paths usually unchanged |
| This package (new version) | `reset + init` | Redeploy new templates, lock file, config |

After a new release:

```bash
npm update -g @moyaspace/openspec-superpowers-opencode  # upgrade package
openspec-superpowers-opencode reset           # remove old config
openspec-superpowers-opencode init            # install new templates
```

## skills.lock.json

`skills.lock.json` records SHA-256 hashes of 7 Superpowers skill files for integrity verification.
It ships with this package, locking the **tested-compatible** Superpowers version.

If Superpowers updates and SHA-256 doesn't match, `init` shows a yellow WARNING. **Non-blocking, workflow unaffected.**

To clear the WARNING, wait for a new package release with updated hashes.

## Related Docs

| Doc | Description |
|-----|-------------|
| [Quick start](docs/QUICKSTART.md) | 10-minute first change: install → init → /opsx-ff → /opsx-apply → /opsx-finish |
| [How it works](docs/HOW-IT-WORKS.md) | Command execution chain from user input to artifact generation |
| [Features](docs/FEATURES.md) | CLI, OPSX commands, worktree isolation, layered architecture |
| [Worktree creation](docs/WORKTREE-CREATION.md) | Three-layer code-level guarantees for isolated worktrees |
| [Design decisions](docs/DESIGN.md) | ADRs: opencode.json location, brownfield-first, no-overwrite policy |
| [Implementation strategy](docs/IMPLEMENTATION-STRATEGY.md) | Deployment gate flow, four-dimension partitioning, mode behaviors |
| [Testing](docs/TEST.md) | 12-phase test suite |
| [Upstream schema reference](docs/UPSTREAM-superpowers-bridge-schema-README.md) | Original superpowers-bridge schema definition |

## Local Development

```powershell
# Test
node bin/cli.js init test-project

# Publish
npm publish
```
