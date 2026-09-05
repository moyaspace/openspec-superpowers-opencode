# 阶段 0A 能力矩阵（真实 OpenCode 实测）

> 实测时间：2026-09-05；平台：win32；执行者：Host Compatibility Probe（`probe/test/host-probe.test.ts`，可重复）。
> 机器证据：`host-probe-run.json`（本目录，测试自动生成）；探针事件 JSONL 事件流。
> 定级规则（分册 10.2）：`required-supported` / `required-missing` / `optional-supported` / `optional-missing`。

## 版本组合

| 组件 | 版本 |
|------|------|
| OpenCode | 1.18.29 |
| Node.js | v24.14.0 |
| @opencode-ai/plugin | 1.14.48（探针固定；1.18.29 的传递依赖 ini@7 要求 Node ^24.15.0，与本机冲突——见 Decision D-1） |
| TypeScript | 7.0.2 |

## 能力矩阵

| # | 能力 | 定级 | 实测证据 |
|---|------|------|---------|
| 1 | ESM npm tarball 插件入口被真实 OpenCode 加载（Bun 运行时） | **required-supported** | host-probe 测试：tarball 安装 → 本地桥 re-export → plugin-called 1 次（且 ≤1，无重复加载） |
| 2 | 插件上下文字段（project/client/$/directory/worktree） | **required-supported** | plugin-called：has_project/has_client/has_dollar 全 true；directory=项目根；worktree="/" |
| 3 | 自定义工具注册与模型真实调用 | **required-supported** | probe_typed_echo 被模型调用，返回 `typed-echo:phase-0a-host-check` |
| 4 | typed 工具参数 Schema（tool.schema）传参 | **required-supported** | `{"message":"phase-0a-host-check"}` 正确传至 execute |
| 5 | 工具执行上下文（directory/worktree） | **required-supported** | tool-call 事件含 tool_directory、tool_worktree |
| 6 | `chat.message` Hook 存在且在模型处理前触发 | **required-supported**（签名）/ **conditional**（messageID） | 类型定义 `chat.message(input{sessionID,agent?,model?,messageID?,variant?}, output{message,parts})`；实测 hook 触发 1 次、sessionID/model/parts 提供；**`messageID` 在 `opencode run` headless 下为 undefined**（见 Decision D-2） |
| 7 | Hook Promise 被 await（await 行为） | **required-supported** | chat.message hook 内 sleep 500ms 后记录时间戳；hook 完成于模型流开始前（事件时序佐证） |
| 8 | `tool.execute.after` Hook | **optional-supported** | 实测触发 1 次（tool/callID 提供） |
| 9 | `session.idle` 事件（经 event 钩子） | **optional-supported** | host-event `session.idle` 观察到 1 次 |
| 10 | 上下文压缩 Hook | **optional-supported** | 类型 `experimental.session.compacting` 存在（input{sessionID}, output{context,prompt?}）；未在短会话中触发（无压缩发生）——按规范归可选，不影响 Gate |
| 11 | npm bare name 插件加载（未发布包） | **required-missing（未发布期）/ supported（发布后）** | `plugin:["oso-probe"]` 静默失败：OpenCode 启动时 bun install 自 registry，未发布包不产生任何日志或错误。发布到 npm 后即为生产加载路径（superpowers 等已发布插件同机制正常加载） |
| 12 | 宿主结构化日志 API | **optional-missing**（待 0B 复核） | 探针未发现插件可用的结构化日志 API；opencode 自身日志文件不可由插件直接写入。记 optional-missing，宿主日志转发起（分册 8.6.1）在阶段 5 前复核 |

## 真实事件名清单（1.18.29 event 钩子实测）

`catalog.updated`、`integration.updated`、`message.part.delta`、`message.part.updated`、`message.updated`、`plugin.added`、`reference.updated`、`session.created`、`session.diff`、`session.idle`、`session.status`、`session.updated`、`tui.toast.show`

## 交给 0B/后续阶段的边界

1. V1 Adapter 的 pending 登记必须兼容 `messageID` 缺失场景（D-2）。
2. 开发期（包未发布）插件加载用 `.opencode/plugins/` 本地桥 re-export tarball 产物；发布后切 bare name（D-1）。
3. 工具 args 必须用 `tool.schema` 定义——裸对象 schema 在 1.18.29 下参数不被传递（实测：非 typed 工具 message=null）。
4. `worktree` 上下文在普通项目目录下为 `"/"`，Adapter 不得假定其等于项目根。
