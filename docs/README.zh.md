# openspec-superpowers-opencode（简称 oso）

> **English → [README.md](../README.md)**

**将 Superpowers + OpenSpec 工作流桥接到 OpenCode 的 CLI 脚手架工具。**

- **GitHub**：`https://github.com/moyaspace/openspec-superpowers-opencode`
- **npm**：`https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode`
- **作者**：rl <robincn@gmail.com>
- **许可**：MIT

## 功能特性

| # | 特性 | 一句话 |
|---|------|--------|
| 1 | **CLI 一键初始化** | `openspec-superpowers-opencode init` → git init + 模板部署 + 配置安装 + 首次提交，一步到位 |
| 2 | **12 个 OPSX 命令** | `/opsx-ff` → `/opsx-apply` → `/opsx-finish` 覆盖变更从创建到归档的完整生命周期 |
| 3 | **Git worktree 隔离** | 每个变更在独立 `.worktrees/<name>/` 目录和 `feature/<name>` 分支中开发，main 分支始终干净 |
| 4 | **多层架构** | Superpowers（HOW）→ OpenSpec（WHAT）→ Worktree（WHERE）→ 命令（WHEN），各层独立互不侵入 |
| 5 | **绿地/棕地双模式** | 新项目自动全量部署；已有项目逐项询问覆盖决策，用户文件安全保留 |
| 6 | **棕地覆盖决策系统** | 通过 `BROWN_OVERRIDE_*` 环境变量或交互式提示控制命令和技能文件的覆盖策略 |
| 7 | **Skill lock 校验** | 锁定上游 Superpowers skill 文件的 SHA-256 哈希，部署时自动校验兼容性 |
| 8 | **跨平台 + 多语言** | Windows（`setup.ps1`）/ Linux（`setup.sh`）双脚本，`--lang zh-CN | zh-TW | en` 多语言支持 |

> 各特性的详细说明见 [docs/FEATURES.md](docs/FEATURES.md)。

## 安装

```bash
# 从 npm 安装
npm install -g openspec-superpowers-opencode

# 从本地 tgz 安装（离线/预览）
npm install -g ./openspec-superpowers-opencode-1.0.1.tgz

# 验证
openspec-superpowers-opencode --help
```

依赖：`openspec` CLI v1.3+、`opencode` CLI、`git`、Superpowers 插件。

## 用法

```powershell
# 一步初始化
mkdir my-project && cd my-project
openspec-superpowers-opencode init

# 或者指定目录名
openspec-superpowers-opencode init my-project
```

`init` 自动完成：部署模板 → git init → 首次提交。

## 前提条件

- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers 插件已安装

setup 脚本会自动检查以上工具是否可用。

## 在 OpenCode 中使用

初始化后在 OpenCode 中打开项目，完整工作流：

| 命令 | 说明 |
|------|------|
| `/opsx-ff <功能名>` | 创建变更并生成全部 artifacts |
| `/opsx-apply [变更名]` | 获取上下文，开始实现 |
| `/opsx-verify` | 验证实现 vs 规格 |
| `/opsx-finish [变更名]` | 完成变更（合并/清理） |
| `/opsx-archive` | 归档变更 |

### 并行变更

每个变更通过 git worktree 隔离在独立的目录和分支中，不会冲突。AI 自动处理所有目录切换，用户只管输命令：

```bash
# 同时创建两个变更
/opsx-ff feature-a        # → 后台: cd .worktrees/feature-a/ 创建 artifacts → 回 main
/opsx-ff feature-b        # → 后台: cd .worktrees/feature-b/ 创建 artifacts → 回 main

# 切到 feature-a 实现（AI 自动 cd，用户无感）
/opsx-apply feature-a     # → 后台: cd .worktrees/feature-a/ 编码、提交
# ... 编写代码 ...

# 切到 feature-b 实现（无需 finish feature-a）
/opsx-apply feature-b     # → 后台: cd .worktrees/feature-b/ 编码、提交
# ... 编写代码 ...

# 各自 finish，互不影响
/opsx-finish feature-a    # → 后台: 测试 → 合并 → 清理 worktree
/opsx-finish feature-b
```

| 概念 | 说明 |
|------|------|
| 每个变更一个 worktree | `.worktrees/<name>/` 目录 + `feature/<name>` 分支，完全隔离 |
| 指定名称切换 | `/opsx-apply <name>`、`/opsx-finish <name>` 定位到对应 worktree |
| 省略名称时 | 从 `.worktrees/` 自动检测；只有一个则直接用，多个则 AskUser |
| 用户不感知目录 | AI 处理所有 `cd`，用户只需输命令名 |
| main 始终干净 | 所有 artifacts 和代码在各自 worktree 中，不污染主分支 |

### 手动查看 worktree 内容

AI 操作无需切换目录，但若要在 shell 中手动查看某个变更的文件：

```bash
# 查看 worktree 目录内容
cd .worktrees/<变更名>
ls -la

# 查看变更分支的提交历史
git log feature/<变更名>

# 回到项目根目录
cd <project-root>
```

日常开发中通常不需要手动操作——编辑器可直接浏览 `.worktrees/<name>/` 下的文件。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `openspec-superpowers-opencode init` | 初始化项目 |
| `openspec-superpowers-opencode reset` | 还原到未初始化状态（按清单删除所有安装文件） |
| `openspec-superpowers-opencode dry-run` | 预览变更 |
| `openspec-superpowers-opencode ensure-worktree <name>` | 确保 worktree 已创建 |
| `create-openspec-superpowers-opencode` | 别名，等同于 init |

## 更新项目模板

`reset + init` 不会影响 Superpowers skill 文件内容——skill 文件由 Superpowers 插件自身管理。
`reset + init` 只重新复制本包中的模板文件（`AGENTS.md`、`schema.yaml`、`skills.lock.json` 等）。

因此需要区分两种更新：

| 更新内容 | 操作 | 说明 |
|---------|------|------|
| Superpowers 插件更新 | **无需操作** | skill 内容自更新，路径通常不变 |
| 本项目更新（新版 npm 包） | `reset + init` | 重新复制新模板、新锁文件、新配置 |

本项目发布新版后：

```bash
npm update -g openspec-superpowers-opencode  # 升级包
openspec-superpowers-opencode reset           # 删除旧配置
openspec-superpowers-opencode init            # 安装新模板
```

## skills.lock.json

`skills.lock.json` 记录了 7 个 Superpowers skill 文件的 SHA-256 哈希值，用于完整性校验。
它随本项目发布，锁定的是**测试时已知兼容**的 Superpowers 版本。

如果 Superpowers 更新后 SHA-256 不匹配，`init` 会显示黄色 WARNING 提示，**不阻塞，不影响工作流**。

要消除该 WARNING，需要新版 `skills.lock.json`——即等待本项目发布包含新哈希的版本。

## 相关文档

| 文档 | 说明 |
|------|------|
| [快速开始](QUICKSTART.md) | 10 分钟完成第一个变更：安装 → init → /opsx-ff → /opsx-apply → /opsx-finish |
| [工作原理](HOW-IT-WORKS.md) | 命令执行链路：从用户输入到 artifact 生成的完整链条 |
| [功能特性总览](FEATURES.md) | CLI、OPSX 命令、Worktree 隔离、多层架构等详细说明 |
| [Worktree 创建机制](WORKTREE-CREATION.md) | 三层代码级保证：确保每次变更都创建隔离 worktree |
| [设计决策记录](DESIGN.md) | ADR：opencode.json 位置、棕地优先、不覆盖策略等 |
| [实现策略](IMPLEMENTATION-STRATEGY.md) | 部署门控流程、四维度划分、各模式下的行为 |
| [测试说明](TEST.md) | 12 阶段测试套件说明 |
| [上游 schema 参考](UPSTREAM-superpowers-bridge-schema-README.md) | 上游 superpowers-bridge schema 原始定义 |

## 本地开发

```powershell
# 测试
node bin/cli.js init test-project

# 发布
npm publish
```
