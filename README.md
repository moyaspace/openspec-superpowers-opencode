# oso (openspec-superpowers-opencode)

**An AI coding toolset — the orchestration layer for OpenSpec + Superpowers on OpenCode.**

- **oso** decides who does the work, where, when, and how it lands.
- **Superpowers** decides how.
- **OpenSpec** decides what, and in what order.

The last two never talk to each other. That's why oso exists.

[![GitHub last commit](https://img.shields.io/github/last-commit/moyaspace/openspec-superpowers-opencode?style=flat-square&logo=github&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![GitHub Stars](https://img.shields.io/github/stars/moyaspace/openspec-superpowers-opencode?style=flat-square&color=yellow&logo=github)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![npm Version](https://img.shields.io/npm/v/@moyaspace/openspec-superpowers-opencode?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Total Downloads](https://img.shields.io/npm/dt/@moyaspace/openspec-superpowers-opencode?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![License](https://img.shields.io/github/license/moyaspace/openspec-superpowers-opencode?style=flat-square&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![macOS](https://img.shields.io/badge/macOS-000?style=flat-square&logo=apple&logoColor=white)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/moyaspace/openspec-superpowers-opencode)

> If you find this useful, consider giving it a ⭐ on GitHub!

**🌐 Read this in other languages:** [English](README.md) | [中文](README.zh-CN.md)

---

## The Problem

Install **OpenSpec** and **Superpowers** separately, and you get two powerful but disconnected tools.

OpenSpec gives you artifact-driven development — brainstorm → specs → tasks → plan.

Superpowers gives you battle-tested methodologies — brainstorming, writing-plans, TDD.

But out of the box, they don't talk to each other. OpenSpec generates generic artifacts, Superpowers skills sit in a separate cache directory, and there's nothing connecting them into a unified workflow.

You can use both, but you'll spend more time stitching them together than actually building features.

And even if you do wire them up, you're still stuck with a **single working tree** — one change at a time. Want to add login and search simultaneously? Context collision, partial commits, reverting. You either wait, or you break things.

**So you have both installed — and still nobody:**

- drives a change through its stages
- gives each change its own working directory
- decides which agent does the work
- gets it merged without losing the tree that was tested

That layer is oso.

## The oso Solution

oso does two kinds of work:

- **Its own engineering** — deploying the workflow, giving each change an isolated worktree, tracking live changes, installing the `openspec` shim, health checks, cross-platform quirks.
- **Coordination** — moving a change through its stages, deciding which agent does what, keeping a fix loop on the same agent while context is still hot, and landing the result atomically.

```
          ┌─ .worktrees/feature-a/  (feature/feature-a branch)
main ─────┼─ .worktrees/feature-b/  (feature/feature-b branch)
          └─ .worktrees/feature-c/  (feature/feature-c branch)
```

<!-- TODO: 30s terminal GIF — show /opsx-propose feature-a → /opsx-propose feature-b → apply each, no interference -->

```bash
# Create two changes simultaneously
/opsx-propose feature-a
/opsx-propose feature-b

# Work on feature-a
/opsx-apply feature-a     # AI auto-cds into .worktrees/feature-a/
# ... write code ...

# Switch to feature-b (no need to finish feature-a first)
/opsx-apply feature-b     # AI auto-cds into .worktrees/feature-b/
# ... write code ...

# Finish independently
/opsx-finish feature-a    # test → merge → cleanup
/opsx-finish feature-b
```

## Quick Start

```bash
# 1. Install
npm install -g @moyaspace/openspec-superpowers-opencode

# 2. Init a project
mkdir my-project && cd my-project
oso init                                  # or: openspec-superpowers-opencode init

# 3. Open in OpenCode, then create a change
/opsx-propose add-user-auth   # create the change + every planning artifact, in its own worktree

# 4. Implement it
/opsx-apply                   # AI implements inside .worktrees/add-user-auth/

# 5. Verify, then merge and archive
/opsx-verify                  # implementation vs specs, tasks, design
/opsx-finish                  # test → merge → cleanup → archive
```

### Two ways to fill in the artifacts

| Command | What it does | When to use it |
|---|---|---|
| `/opsx-propose` | **Create.** Makes the change, its worktree, and every planning artifact in one step. Stops if the name is already taken. | Starting something new. |
| `/opsx-ff` | **Converge.** Takes the change to apply-ready from *any* state — creates what's missing, skips what's done. Safe to re-run. | Resuming after an interruption, or topping up a half-finished change. |

`/opsx-ff` is also the faster option when you already know the full scope and don't need to review each artifact. If you'd rather approve them one at a time, use `/opsx-new` to scaffold the change, then `/opsx-continue` for each artifact.

`oso init` auto-checks and installs the `openspec` shim. If it can't, init still completes and prints the exact command to run (system npm on Unix: `sudo oso install-shims`; nvm/user-level prefix: no sudo; Windows: run as Administrator). No need to re-run init afterwards.

## Upgrading

Upgrading an existing project is a two-command job — `oso init` is idempotent and refreshes everything OSO owns:

```bash
npm install -g @moyaspace/openspec-superpowers-opencode@latest
cd your-project
oso init
```

What `oso init` does on an existing project:

- **Refreshes OSO-owned assets** — `.opencode/commands/` and `openspec/schemas/` are overwritten with the current versions. This is how command-layer fixes reach you.
- **Reports every file it changed** — each refreshed file is listed as `Updated: <path>`, so upgrades are auditable.
- **Leaves your work alone** — `openspec/changes/**` and `openspec/specs/**` are never touched. Managed blocks in `AGENTS.md`, `.gitignore`, `.gitattributes`, `.editorconfig` only have their marker section replaced; everything outside the markers is preserved.
- **Merges `openspec/config.yaml` and `.opencode/opencode.json`** rather than replacing them.

To opt out of refreshing a specific asset class, set the corresponding switch before running init:

```bash
BROWN_OVERRIDE_COMMANDS=no oso init     # keep your own .opencode/commands/
BROWN_OVERRIDE_COMMANDS=ask oso init    # ask per file
BROWN_OVERRIDE_OPENSPEC=no oso init     # keep your own openspec/config.yaml
```

Preview first if you want to see the plan without writing anything:

```bash
oso dry-run
```

### Upgrading from 1.1.1: rebuild the `openspec` shim

1.1.2 moves the implementation from `lib/` to `dist/`, and the shim's health check is tied to that directory. After upgrading, the old shim detects the missing `lib/` on its first invocation, restores the original `openspec` CLI, and removes itself — so `openspec` keeps working, but the registry-aware `openspec list` interception stays off until the shim is rebuilt:

```bash
oso install-shims     # or just run `oso init`, which repairs it automatically
```

Verify:

```bash
oso --version         # 1.1.2
openspec --version    # your real openspec CLI version, e.g. 1.3.1
oso verify            # the openspec (shim) item must pass
```

### Multiple Node installations (nvm, Volta, system npm)

The shim stores an **absolute** path to the installed package. If you switch Node versions, or have both a system Node and an nvm-managed one, `npm i -g` may install into one prefix while the `openspec` on your PATH lives in another. Compare:

```bash
npm root -g           # where the package actually landed
which openspec        # macOS / Linux
where openspec        # Windows
```

If they disagree, install with the npm that owns that bin directory, or run `oso install-shims` to re-point the shim at the current package.

### Removing the shim safely

`oso uninstall-shims` restores `openspec` from the `openspec-orig` backup and deletes the shim files. Run it **before** uninstalling the package, because the command itself lives in the package:

```bash
oso uninstall-shims
openspec --version                                  # should be the real CLI now
npm uninstall -g @moyaspace/openspec-superpowers-opencode
```

Do not remove the package while `openspec-orig` is missing: the 1.1.x shim falls back to invoking itself when its backup is absent, which can leave `openspec` unusable. Check first:

```bash
ls "$(dirname "$(which openspec)")/openspec-orig"
```

The same self-heal applies to 1.1.2 (its shim checks `dist/registry-utils.js`), so deleting the package without running `oso uninstall-shims` is also safe — as long as `openspec-orig` exists.

## Features

| # | Feature | One-liner |
|---|---------|-----------|
| 1 | **13 OPSX commands** | `/opsx-propose` → `/opsx-apply` → `/opsx-verify` → `/opsx-finish` — full change lifecycle |
| 2 | **Git worktree isolation** | Each change in its own `.worktrees/<name>/` dir + `feature/<name>` branch |
| 3 | **One-command init** | `oso init` → deploy templates + config + `git init` + first commit |
| 4 | **Bridged OpenSpec + Superpowers** | Pre-configured schema + skill mapping + lock verification; supports Superpowers **v5 / v6 / v7** |
| 5 | **Greenfield/brownfield** | Auto-deploy on new projects; safe merge on existing ones |
| 6 | **Cross-platform + i18n** | Unified TypeScript installer (`src/setup/`) on Windows/Linux/macOS, `--lang zh-CN \| zh-TW \| en` |
| 7 | **Visible upgrades** | Re-running `oso init` lists every refreshed file instead of rewriting silently |
| 8 | **Layered architecture** | oso (who · where · when · how it lands) ← Superpowers (how) + OpenSpec (what + order) |
| 9 | **Full worktree + openspec change support** | Auto-register on change creation, smart `openspec list` interception, `verify` one-click health check |
| 10 | **High-performance Worktree code search** | CodeGraph integrated in worktree, auto-indexed for high-performance code search |
| 11 | **Delegates, doesn't copy** | On v6+, `/opsx-apply` hands execution to Superpowers' own controller; oso maintains the adapter, not a copy of the rules |

> Detailed features → [docs/FEATURES.md](docs/FEATURES.md)

## Documentation

| Doc | Description |
|-----|-------------|
| [Quick start](docs/QUICKSTART.md) | 10-minute first change |
| [How it works](docs/HOW-IT-WORKS.md) | Command execution chain explained |
| [Worktree creation](docs/WORKTREE-CREATION.md) | Three-layer code-level guarantees |
| [Design decisions](docs/DESIGN.md) | ADRs: architecture tradeoffs |
| [Testing](docs/testing.md) | Test layers, commands, and conventions |
| [Releasing](docs/RELEASING.md) | Release process: bump, verify, tag, publish |
| [Why oso](docs/WHY-OSO.md) | Deep dive: 6 gaps between OpenSpec and Superpowers |

## Prerequisites

- Node.js >= 22.9.0
- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers plugin (v5 / v6 / v7)

Run `oso verify` to check your environment.

## Local Development

```bash
npm run build && node dist/cli/index.js init test-project   # test locally
npm publish                                                 # publish to npm
```

## Community

Join the oso WeChat community to connect with developers using oso, OpenSpec, Superpowers, and OpenCode.

**In the group you can:**

- Get hands-on help and setup guidance for oso
- Stay up to date with releases and feature announcements
- Share AI-assisted development workflow practices
- Report issues and shape the roadmap with your feedback

**How to join: add the maintainer**

Scan the QR code below to add the maintainer on WeChat with the note **"oso"**, and you will be invited to the group. Please be patient if there are many pending requests.

<div align="center">
  <img src="docs/images/wechat-group-join-qrcode.png" alt="oso maintainer WeChat" width="200">
</div>

**Group guidelines:**

- Be respectful. No spam, self-promotion, or off-topic content.

## Partners

<div align="center">
  <img src="https://moyaspace.com/home/favicon.png" alt="MoyaAI" width="120">
</div>

> **MoyaAI** ([moyaspace.com](https://moyaspace.com)) is a partner of oso, providing an OpenAI-compatible AI API relay that puts mainstream models behind a single API key.

One key, every mainstream model. MoyaAI aggregates GPT, DeepSeek, GLM, Kimi, Qwen, Grok and more, backed by multi-node load balancing and automatic failover for stable, low-latency access. Pay-as-you-go with transparent per-token billing (Alipay supported, no credit card needed), and track every request in real time on the dashboard.

**Get started in 3 steps:**

1. **Register and create a token** — Sign up at [moyaspace.com](https://moyaspace.com), open the **API Keys** page, and generate an API key (starts with `sk-`).
2. **Get the Base URL** — OpenAI-compatible endpoint: `https://moyaspace.com/v1`
3. **Configure your tool** — Paste the Base URL and API key into Claude Code, Cursor, Codex, NextChat, etc. and start using it.

> **Keep your key safe.** Never commit real API keys to this or any repository — use placeholders or environment variables.

**Questions or feedback about MoyaAI?** Discussions are welcome in the [oso community group](#community) above.

---

**GitHub**: https://github.com/moyaspace/openspec-superpowers-opencode<br>
**npm**: https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode<br>
**Author**: rl robincn@gmail.com<br>
**License**: MIT
