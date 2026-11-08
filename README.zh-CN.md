# openspec-superpowers-opencode（简称 oso）

**一个 AI Coding 开发者工具集 —— OpenSpec + Superpowers 在 OpenCode 上的编排层。**

- **oso** 管谁来做、在哪做、什么时候做、怎么落地。
- **Superpowers** 管怎么做。
- **OpenSpec** 管做什么、按什么顺序。

后两者彼此不通气。这就是 oso 存在的理由。

[![GitHub last commit](https://img.shields.io/github/last-commit/moyaspace/openspec-superpowers-opencode?style=flat-square&logo=github&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![GitHub Stars](https://img.shields.io/github/stars/moyaspace/openspec-superpowers-opencode?style=flat-square&color=yellow&logo=github)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![npm Version](https://img.shields.io/npm/v/@moyaspace/openspec-superpowers-opencode?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![npm Total Downloads](https://img.shields.io/npm/dt/@moyaspace/openspec-superpowers-opencode?style=flat-square&logo=npm&color=cb3837)](https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode)
[![License](https://img.shields.io/github/license/moyaspace/openspec-superpowers-opencode?style=flat-square&color=blue)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![macOS](https://img.shields.io/badge/macOS-000?style=flat-square&logo=apple&logoColor=white)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat-square&logo=windows&logoColor=white)](https://github.com/moyaspace/openspec-superpowers-opencode)
[![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat-square&logo=linux&logoColor=black)](https://github.com/moyaspace/openspec-superpowers-opencode)

> 如果觉得有用，请在 GitHub 上给个 ⭐！

**🌐 Read this in other languages:** [English](README.md) | [中文](README.zh-CN.md)

---

## 问题

分别安装 **OpenSpec** 和 **Superpowers**，你得到的是两个强大但互不通信的工具。

OpenSpec 提供 artifact 驱动的开发流程——brainstorm → specs → tasks → plan。

Superpowers 提供久经考验的方法论——brainstorming、writing-plans、TDD。

但开箱状态下，两者之间没有任何连接。OpenSpec 生成通用 artifact，Superpowers skills 躺在缓存目录里，没有人把它们整合成统一的工作流。

你可以两个都用，但大部分时间会花在缝合工具上，而不是真正开发功能。

而且就算勉强配好了，你仍然受限于**单一工作目录**——一次只能做一个变更。想同时加登录和搜索功能？上下文冲突、半成品提交、回退。要么排队等，要么搞乱。

**于是你两样都装了，却仍然没有人：**

- 把一个变更从第一步推到归档
- 给每个变更一个独立的工作目录
- 决定这次活儿派给谁
- 让结果合并进来，同时不弄丢刚验证过的那份代码

这一层就是 oso。

## oso 的解法

oso 做两类工作：

- **自己的工程** —— 部署工作流、给每个变更一个隔离的 worktree、追踪活跃变更、安装 `openspec` 垫片、健康检查、跨平台适配。
- **协调编排** —— 把变更从一步推到下一步、决定哪个 agent 做什么、在上下文还热的时候让同一个 agent 接着修、把结果原子地落地。

```
          ┌─ .worktrees/feature-a/  (feature/feature-a 分支)
base ─────┼─ .worktrees/feature-b/  (feature/feature-b 分支)
          └─ .worktrees/feature-c/  (feature/feature-c 分支)
```

<!-- TODO: 30s 终端录屏 GIF — 展示 /opsx-propose feature-a → /opsx-propose feature-b → 各自 apply，互不干扰 -->

```bash
# 同时创建两个变更
/opsx-propose feature-a
/opsx-propose feature-b

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
oso init                                  # 或: openspec-superpowers-opencode init

# 3. 在 OpenCode 中打开，创建变更
/opsx-propose add-user-auth   # 创建变更 + 全部规划 artifacts，并在独立 worktree 中

# 4. 实现
/opsx-apply                   # AI 在 .worktrees/add-user-auth/ 内实现

# 5. 验收，然后合并与归档
/opsx-verify                  # 实现 vs specs、tasks、design
/opsx-finish                  # 测试 → 合并 → 清理 → 归档
```

### 填充 artifacts 的两条路径

| 命令 | 做什么 | 什么时候用 |
|---|---|---|
| `/opsx-propose` | **创建。** 一步建好变更、worktree 和全部规划 artifacts。名字被占用时中止。 | 开始一件新事。 |
| `/opsx-ff` | **补完。** 从**任意状态**把变更推进到可实施——缺什么补什么，已完成的跳过。可安全重跑。 | 中断后续跑，或补齐半成品。 |

如果你已经清楚全貌、不需要逐个确认，`/opsx-ff` 也更快。若想逐个确认 artifact，用 `/opsx-new` 建骨架，再用 `/opsx-continue` 一个个生成。

`oso init` 会自动检查并安装 `openspec` 垫片。装不上时 init 仍会完成，并打印可直接照抄的命令（Unix 系统 npm：`sudo oso install-shims`；nvm/用户级 prefix：无需 sudo；Windows：以管理员身份运行）。之后不需要重跑 init。

## 升级

升级已有项目只需两条命令——`oso init` 是幂等的，会刷新 OSO 自己拥有的一切：

```bash
npm install -g @moyaspace/openspec-superpowers-opencode@latest
cd your-project
oso init
```

`oso init` 在已有项目上会：

- **刷新 OSO 资产** —— `.opencode/commands/` 与 `openspec/schemas/` 用当前版本覆盖。命令层的修复就是这样送到你手里的。
- **列出每个改动的文件** —— 每个被刷新的文件都会打印 `已更新：<path>`，升级可审计。
- **不动你的东西** —— `openspec/changes/**` 与 `openspec/specs/**` 永不触碰。`AGENTS.md`、`.gitignore`、`.gitattributes`、`.editorconfig` 只替换 marker 区块，区块外内容原样保留。
- **合并而非替换** `openspec/config.yaml` 与 `.opencode/opencode.json`。

要放弃刷新某一类资产，可在运行 init 前设置对应开关：

```bash
BROWN_OVERRIDE_COMMANDS=no oso init     # 保留你自己的 .opencode/commands/
BROWN_OVERRIDE_COMMANDS=ask oso init    # 逐文件询问
BROWN_OVERRIDE_OPENSPEC=no oso init     # 保留你自己的 openspec/config.yaml
```

想先看计划而不写盘：

```bash
oso dry-run
```

版本特定的升级注意事项——从 1.1.1 升级后重建垫片、多个 Node 安装、安全移除垫片——见 [docs/UPGRADING.zh-CN.md](https://github.com/moyaspace/openspec-superpowers-opencode/blob/release/1.1/docs/UPGRADING.zh-CN.md)。

## 功能特性

| # | 特性 | 一句话 |
|---|------|--------|
| 1 | **13 个 OPSX 命令** | `/opsx-propose` → `/opsx-apply` → `/opsx-verify` → `/opsx-finish` — 完整变更生命周期 |
| 2 | **Git worktree 隔离** | 每个变更加载独立 `.worktrees/<name>/` 目录 + `feature/<name>` 分支 |
| 3 | **一键初始化** | `oso init` → 部署模板 + 配置 + `git init` + 首次提交 |
| 4 | **桥接 OpenSpec + Superpowers** | 预配置 schema + skill 映射 + 锁校验；支持 Superpowers **v5 / v6 / v7** |
| 5 | **绿地/棕地双模式** | 新项目自动部署；已有项目安全合并 |
| 6 | **跨平台 + 多语言** | Unified TypeScript 安装器（`src/setup/`）支持 Windows/Linux/macOS，`--lang zh-CN \| zh-TW \| en` |
| 7 | **可见的升级** | 重跑 `oso init` 会逐条列出被刷新的文件，而不是静默重写 |
| 8 | **分层架构** | oso（谁 · 在哪 · 何时 · 怎么落地）← Superpowers（怎么做）+ OpenSpec（做什么 + 顺序） |
| 9 | **worktree + openspec change 全面支持** | 创建变更自动注册、`openspec list` 智能拦截、`verify` 一键健康检查 |
| 10 | **支持 Worktree 代码高性能检索** | Worktree 内集成 CodeGraph，自动索引，支持高性能的代码检索 |
| 11 | **委托而非复刻** | v6+ 上 `/opsx-apply` 把执行权交给 Superpowers 自己的流程引擎；oso 只维护接入层，不复刻规则 |

> 详细功能说明 → [docs/FEATURES.md](docs/FEATURES.md)

## 文档

| 文档 | 说明 |
|------|------|
| [快速开始](docs/QUICKSTART.md) | 10 分钟完成第一个变更 |
| [工作原理](docs/HOW-IT-WORKS.md) | 命令执行链路详解 |
| [Worktree 创建机制](docs/WORKTREE-CREATION.md) | 三层代码级保障 |
| [设计决策](docs/DESIGN.md) | ADR：架构权衡记录 |
| [测试说明](docs/testing.md) | 测试分层、命令与约定 |
| [发布流程](docs/RELEASING.md) | 版本号、验证、tag、publish 全流程 |
| [为什么用 oso](docs/WHY-OSO.md) | 深度分析：OpenSpec 和 Superpowers 之间的 6 道鸿沟 |

## 前置条件

- Node.js >= 22.9.0
- `openspec` CLI v1.3+
- `opencode` CLI
- `git`
- Superpowers 插件（v5 / v6 / v7）

运行 `oso verify` 可检查环境是否就绪。

## 本地开发

```bash
npm run build && node dist/cli/index.js init test-project   # 本地测试
npm publish                                                 # 发布到 npm
```

## 社区

欢迎加入 oso 微信交流群，与使用 oso、OpenSpec、Superpowers 和 OpenCode 的开发者一起交流。

**在群里你可以：**

- 获得 oso 的使用帮助与配置答疑
- 第一时间获取版本更新与功能公告
- 交流 AI 辅助开发工作流的实践心得
- 反馈问题与建议，参与 roadmap 讨论

**进群方式：添加维护者微信**

扫描下方二维码添加维护者微信，备注 **oso**，由维护者邀请进群。好友申请较多时请耐心等待。

<div align="center">
  <img src="docs/images/wechat-group-join-qrcode.png" alt="oso 维护者微信" width="200">
</div>

**进群须知：**

- 请友善交流，禁止广告、拉群与无关话题

## 合作伙伴

<div align="center">
  <img src="https://api.oasig.space/home/logo.webp" alt="OASIG API" width="120">
</div>

> **OASIG API**（[api.oasig.space](https://api.oasig.space)）是 oso 的合作伙伴，提供兼容 OpenAI 协议的 AI API 网关。

- **兼容 OpenAI 协议** —— 换模型只需改一个字符串。
- **按量计费** —— 没有月费，注册即用。
- **私有 GPU** 助力模型推理。
- **一个模型，多条通路** —— 请求由多个上游卖家共同承载。
- **LLM 多卖家支持。**
- **让每个人都能享受模型的乐趣。**
- **微信支付与支付宝** 两个站点均已支持。

**三步开始使用：**

1. **创建令牌** —— 在 [api.oasig.space](https://api.oasig.space) 注册并生成 API Key。
2. **获取 Base URL** —— OpenAI 兼容端点：`https://api.oasig.space/v1`
3. **配置你的工具** —— 把 Base URL 和 Key 填进 Claude、Cursor、Codex、NextChat 等即可使用。

> **妥善保管你的密钥。** 不要把真实 API Key 提交到本仓库或任何仓库 —— 请使用占位符或环境变量。

---

<div align="center">
  <img src="https://moyaspace.com/home/favicon.png" alt="MoyaAI" width="120">
</div>

> **MoyaAI**（[moyaspace.com](https://moyaspace.com)）是 oso 的合作伙伴，提供兼容 OpenAI 协议的 AI API 中转服务——一个 Key 即可使用主流大模型。

一个 Key，解锁全部主流模型。MoyaAI 聚合 GPT、DeepSeek、GLM、Kimi、Qwen、Grok 等模型，多节点负载均衡与自动故障转移保障稳定低延迟。按量计费、价格透明，支持支付宝（无需信用卡），仪表盘实时展示余额与消耗明细。

**三步接入：**

1. **注册并创建令牌** — 访问 [moyaspace.com](https://moyaspace.com) 注册账号，在「API 密钥」页面创建并生成 API Key（`sk-` 开头）。
2. **获取接入地址** — OpenAI 兼容接口 Base URL：`https://moyaspace.com/v1`
3. **配置你的工具** — 在 Claude Code、Cursor、Codex、NextChat 等工具中填入 Base URL 与 API Key，即可开始使用。

> **注意保护密钥。** 切勿将真实 API Key 提交到本仓库或任何仓库——请使用占位符或环境变量。

**想了解或反馈 MoyaAI？** 欢迎在上方[社区](#社区)微信交流群中讨论。

---

**GitHub**：https://github.com/moyaspace/openspec-superpowers-opencode<br>
**npm**：https://www.npmjs.com/package/@moyaspace/openspec-superpowers-opencode<br>
**作者**：rl robincn@gmail.com<br>
**许可**：MIT