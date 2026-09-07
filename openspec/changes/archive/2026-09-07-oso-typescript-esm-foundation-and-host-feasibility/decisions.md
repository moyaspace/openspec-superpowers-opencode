# Decision 记录（阶段 0A 实测发现）

## D-1: @opencode-ai/plugin 固定 1.14.48；未发布包的开发期加载路径

- **发现（证据）**：
  1. `@opencode-ai/plugin@1.18.29` → `effect@4.0.0-beta.83` → `ini@7.0.0`，engines 要求 `node ^22.22.2 || ^24.15.0 || >=26.0.0`；本机/CI Node v24.14.0 安装时产生 EBADENGINE 警告。
  2. `@opencode-ai/plugin@1.14.48`（本仓库 `.opencode/package.json` 既有版本）→ `effect@4.0.0-beta.59` → `ini@6.0.0`（engines `^20.17.0 || >=22.9.0`）。全依赖树 engines 交集为 `>=22.9.0`，Node 24.14.0 满足且安装零警告。
  3. OpenCode 1.18.29 对 `plugin: ["<bare-name>"]` 在启动时用 bun 从 **npm registry** 安装；未发布包**静默失败**（无日志、无错误、插件不加载）。实测 bare name / file:// 目录 URL / 相对路径均不加载本地未发布包。
  4. `.opencode/plugins/*.js` 本地插件由 OpenCode 直接加载（Bun），其 import 从项目 node_modules 解析——tarball 安装产物经此路径**真实加载成功**（工具注册、调用、事件全通）。
- **决定**：
  1. 探针与 0B 基线固定 `@opencode-ai/plugin@1.14.48`；与宿主 opencode 1.18.29 的兼容由探针证明（非同版本不构成问题——插件包仅提供类型与 tool 辅助）。
  2. 最低 Node 版本按全依赖 engines 交集冻结为 **>=22.9.0**（实际 CI/开发版本 24.14.0）；待升级 Node ≥24.15 后可评估升级 plugin 包（另行回归探针）。
  3. 开发期（包未发布）宿主加载走 `.opencode/plugins/` 本地桥 re-export tarball 产物；**生产路径**（发布 npm 后）为 `opencode.json` 的 `plugin: ["@moyaspace/..."]` registry 加载——机制相同（同为 Bun 加载 ESM 入口），发布后须用已发布包重跑本探针（记入阶段 10 发布门任务边界）。
- **影响的 IMP 任务**：IMP-IMP-0004（Hook/工具验证通过，加载路径按上述）、IMP-IMP-0006（双入口隔离验证不受影响）、IMP-IMP-0010（版本冻结）。
- **规范依据**：分册 10.1 表格"同一 ESM npm 包同时提供 CLI、Core 和插件——有条件可行"；本决定即该条件实测结果，不改变包结构（仍为单包双入口）。

## D-2: `chat.message` Hook 在 headless（`opencode run`）下不提供 `messageID`

- **发现（证据）**：探针 hook 记录 `message_id_present: false`（opencode 1.18.29，`opencode run` 单消息模式）；类型签名 `messageID?: string` 本就可选。TUI 模式下该字段是否提供未在本轮验证（headless 为 CI 可重复路径）。
- **决定**：V1 Adapter 的 pending 登记不得以 `chat.message` 的 `messageID` 为唯一幂等键。 Adapter 必须实现派生标识策略（如 sessionID + 消息序号/内容 hash），并在阶段 5 接入真实 TUI 时补测 TUI 场景的 messageID 行为后固化主键策略。
- **影响的 IMP 任务**：IMP-IMP-0005（pending 登记最小路径——"稳定 Session/Message 标识"在 headless 下部分满足：sessionID 稳定，messageID 缺失）、阶段 5 的 IMP-IMP-0503（Message ID 缺失时按兼容结论拒绝完整模式——现在有了实测依据）。
- **规范依据**：分册 8.1.2/8.2；主册 2.3"稳定 Session/Message 标识"要求。此发现不推翻 pending-first 方案（登记本身可行），仅影响幂等键设计，留待阶段 5 按规范"Message ID 缺失或不稳定时必须按阶段 0 的兼容结论拒绝完整模式"执行。
