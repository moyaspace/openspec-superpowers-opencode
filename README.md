# oso (openspec-superpowers-opencode)

> Bridges Superpowers + OpenSpec workflows into OpenCode with enforced worktree isolation.

[![CI](https://img.shields.io/github/actions/workflow/status/moyaspace/openspec-superpowers-opencode/ci.yml?style=for-the-badge&logo=github&color=2ea44f)](https://github.com/moyaspace/openspec-superpowers-opencode/actions)
[![GitHub last commit](https://img.shields.io/github/last-commit/moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=github&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![GitHub Stars](https://img.shields.io/github/stars/moyaspace/openspec-superpowers-opencode?style=for-the-badge&color=yellow&logo=github)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![npm Version](https://img.shields.io/npm/v/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Weekly Downloads](https://img.shields.io/npm/dw/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Monthly Downloads](https://img.shields.io/npm/dm/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![License](https://img.shields.io/github/license/moyaspace/openspec-superpowers-opencode?style=for-the-badge&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)

> If you find this useful, consider giving it a ⭐ on GitHub!

**🌐 Read this in other languages:** [English](README.md) | [中文](docs/README.zh.md)

---

## The Problem

Install **OpenSpec** and **Superpowers** separately, and you get two powerful but disconnected tools.

OpenSpec gives you artifact-driven development — brainstorm → specs → tasks → plan.

Superpowers gives you battle-tested methodologies — brainstorming, writing-plans, TDD.

But out of the box, they don't talk to each other. OpenSpec generates generic artifacts, Superpowers skills sit in a separate cache directory, and there's nothing connecting them into a unified workflow.

You can use both, but you'll spend more time stitching them together than actually building features.

And even if you do wire them up, you're still stuck with a **single working tree** — one change at a time. Want to add login and search simultaneously? Context collision, partial commits, reverting. You either wait, or you break things.

**oso bridges the gap and adds isolation.**

## The oso Solution

oso is a developer CLI toolset that integrates OpenSpec and Superpowers workflows into OpenCode: one-command init, enforced worktree isolation, active change registry tracking, native command interception with passthrough, and system health verification.

```
          ┌─ .worktrees/feature-a/  (feature/feature-a branch)
main ─────┼─ .worktrees/feature-b/  (feature/feature-b branch)
          └─ .worktrees/feature-c/  (feature/feature-c branch)
```

<!-- TODO: 30s 终端录屏 GIF — 展示 /opsx-ff feature-a → /opsx-ff feature-b → 各自 apply，互不干扰 -->

```bash
# Create two changes simultaneously
/opsx-ff feature-a
/opsx-ff feature-b

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
openspec-superpowers-opencode init

# 3. Open in OpenCode, then use the workflow
/opsx-ff add-user-auth    # create change + generate artifacts
/opsx-apply               # AI implements in isolated worktree
/opsx-finish              # test → merge → cleanup
```

## Features

| # | Feature | One-liner |
|---|---------|-----------|
| 1 | **12 OPSX commands** | `/opsx-ff` → `/opsx-apply` → `/opsx-finish` — full change lifecycle |
| 2 | **Git worktree isolation** | Each change in its own `.worktrees/<name>/` dir + `feature/<name>` branch |
| 3 | **One-command init** | `oso init` → deploy templates + config + `git init` + first commit |
| 4 | **Bridged OpenSpec + Superpowers** | Pre-configured schema + skill mapping + lock verification, one-command deploy |
| 5 | **Greenfield/brownfield** | Auto-deploy on new projects; safe merge on existing ones |
| 6 | **Cross-platform + i18n** | Windows `setup.ps1` / Linux `setup.sh`, `--lang zh-CN \| zh-TW \| en` |
| 7 | **SHA-256 lock** | Skill file integrity verified on deploy |
| 8 | **Layered architecture** | Superpowers (HOW) → OpenSpec (WHAT) → Worktree (WHERE) → Commands (WHEN) |
| 9 | **Full worktree + openspec change support** | Auto-register on change creation, smart `openspec list` interception, `verify` one-click health check |

> Detailed features → [docs/FEATURES.md](docs/FEATURES.md)

## Documentation

| Doc | Description |
|-----|-------------|
| [Quick start](docs/QUICKSTART.md) | 10-minute first change |
| [How it works](docs/HOW-IT-WORKS.md) | Command execution chain explained |
| [Worktree creation](docs/WORKTREE-CREATION.md) | Three-layer code-level guarantees |
| [Design decisions](docs/DESIGN.md) | ADRs: architecture tradeoffs |
| [Testing](docs/TESTING.md) | 17-phase test suite |
| [Why oso](docs/WHY-OSO.md) | Deep dive: 6 gaps between OpenSpec and Superpowers |

## Prerequisites

- Node.js >= 16 (recommended)
- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers plugin

Setup script checks these automatically.

## Local Development

```bash
node bin/cli.js init test-project   # test locally
npm publish                         # publish to npm
```

---

**GitHub**: https://github.com/moyaspace/openspec-superpowers-opencode<br>
**npm**: https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode<br>
**Author**: rl robincn@gmail.com<br>
**License**: MIT
