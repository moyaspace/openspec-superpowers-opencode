# openspec-superpowers-opencode（简称 oso）

> 将 Superpowers + OpenSpec 工作流桥接到 OpenCode，强制执行 worktree 隔离。

[![CI](https://img.shields.io/github/actions/workflow/status/moyaspace/openspec-superpowers-opencode/ci.yml?style=for-the-badge&logo=github&color=2ea44f)](https://github.com/moyaspace/openspec-superpowers-opencode/actions)
[![GitHub last commit](https://img.shields.io/github/last-commit/moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=github&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![GitHub Stars](https://img.shields.io/github/stars/moyaspace/openspec-superpowers-opencode?style=for-the-badge&color=yellow&logo=github)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![npm Version](https://img.shields.io/npm/v/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Weekly Downloads](https://img.shields.io/npm/dw/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Monthly Downloads](https://img.shields.io/npm/dm/@moyaspace/openspec-superpowers-opencode?style=for-the-badge&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![License](https://img.shields.io/github/license/moyaspace/openspec-superpowers-opencode?style=for-the-badge&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)

> 如果觉得有用，请在 GitHub 上给个 ⭐！

---

## 问题

分别安装 **OpenSpec** 和 **Superpowers**，你得到的是两个强大但互不通信的工具。

OpenSpec 提供 artifact 驱动的开发流程——brainstorm → specs → tasks → plan。

Superpowers 提供久经考验的方法论——brainstorming、writing-plans、TDD。

但开箱状态下，两者之间没有任何连接。OpenSpec 生成通用 artifact，Superpowers skills 躺在缓存目录里，没有人把它们整合成统一的工作流。

你可以两个都用，但大部分时间会花在缝合工具上，而不是真正开发功能。

而且就算勉强配好了，你仍然受限于**单一工作目录**——一次只能做一个变更。想同时加登录和搜索功能？上下文冲突、半成品提交、回退。要么排队等，要么搞乱。

**oso 填补了鸿沟，并增加了隔离。**

## oso 的解法

oso 是一个 CLI 脚手架，做两件事：

**① 桥接 OpenSpec + Superpowers** — 一条命令部署完整的集成：schema、AGENTS.md、skill 锁校验、12 个 OPSX 命令，全部预配置并经过测试。

**② 强制执行 worktree 隔离** — 每个变更拥有独立的 git worktree，并行变更零冲突。

```
          ┌─ .worktrees/feature-a/  (feature/feature-a 分支)
main ─────┼─ .worktrees/feature-b/  (feature/feature-b 分支)
          └─ .worktrees/feature-c/  (feature/feature-c 分支)
```

<!-- TODO: 30s 终端录屏 GIF — 展示 /opsx-ff feature-a → /opsx-ff feature-b → 各自 apply，互不干扰 -->

```bash
# 同时创建两个变更
/opsx-ff feature-a
/opsx-ff feature-b

# 开始实现 feature-a
/opsx-apply feature-a     # AI 自动进入 .worktrees/feature-a/
# ... 编写代码 ...

# 切到 feature-b（不需要先 finish feature-a）
/opsx-apply feature-b     # AI 自动进入 .worktrees/feature-b/
# ... 编写代码 ...

# 各自完成，互不影响
/opsx-finish feature-a    # 测试 → 合并 → 清理
/opsx-finish feature-b
```

## 快速开始

```bash
# 1. 安装
npm install -g @moyaspace/openspec-superpowers-opencode

# 2. 初始化项目
mkdir my-project && cd my-project
openspec-superpowers-opencode init

# 3. 在 OpenCode 中打开，使用工作流
/opsx-ff add-user-auth    # 创建变更 + 生成 artifacts
/opsx-apply               # AI 在隔离 worktree 中实现
/opsx-finish              # 测试 → 合并 → 清理
```

## 功能特性

| # | 特性 | 一句话 |
|---|------|--------|
| 1 | **12 个 OPSX 命令** | `/opsx-ff` → `/opsx-apply` → `/opsx-finish` — 完整变更生命周期 |
| 2 | **Git worktree 隔离** | 每个变更加载独立 `.worktrees/<name>/` 目录 + `feature/<name>` 分支 |
| 3 | **一键初始化** | `oso init` → 部署模板 + 配置 + `git init` + 首次提交 |
| 4 | **桥接 OpenSpec + Superpowers** | 预配置 schema + skill 映射 + 锁校验，一条命令部署 |
| 5 | **绿地/棕地双模式** | 新项目自动部署；已有项目安全合并 |
| 6 | **跨平台 + 多语言** | Windows `setup.ps1` / Linux `setup.sh`，`--lang zh-CN \| zh-TW \| en` |
| 7 | **SHA-256 锁** | 部署时自动校验 skill 文件完整性 |
| 8 | **多层架构** | Superpowers（HOW）→ OpenSpec（WHAT）→ Worktree（WHERE）→ 命令（WHEN） |

> 详细功能说明 → [docs/FEATURES.md](docs/FEATURES.md)

## 文档

| 文档 | 说明 |
|------|------|
| [快速开始](QUICKSTART.md) | 10 分钟完成第一个变更 |
| [工作原理](HOW-IT-WORKS.md) | 命令执行链路详解 |
| [Worktree 创建机制](WORKTREE-CREATION.md) | 三层代码级保障 |
| [设计决策](DESIGN.md) | ADR：架构权衡记录 |
| [测试说明](TESTING.md) | 12 阶段测试套件 |
| [为什么用 oso](WHY-OSO.md) | 深度分析：OpenSpec 和 Superpowers 之间的 6 道鸿沟 |

## 前置条件

- Node.js >= 16（推荐）
- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers 插件

setup 脚本会自动检查以上工具是否可用。

## 本地开发

```bash
node bin/cli.js init test-project   # 本地测试
npm publish                         # 发布到 npm
```

---

**GitHub**：[moyaspace/openspec-superpowers-opencode](https://github.com/moyaspace/openspec-superpowers-opencode)<br>
**npm**：[@moyaspace/openspec-superpowers-opencode](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)<br>
**作者**：rl (robincn@gmail.com)<br>
**许可**：MIT
