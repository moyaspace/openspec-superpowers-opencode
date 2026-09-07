---
stage: 0
change: oso-typescript-esm-foundation-and-host-feasibility
status: passed
tested_commit: 2f68f4003945723f34b9826b0baecf4ceb766f65
started_at: 2026-09-05T09:00:00+08:00
completed_at: 2026-09-05T21:30:00+08:00
versions:
  node: 24.14.0
  typescript: 7.0.2
  opencode: 1.18.29
  plugin: 1.14.48
gate_commands:
  - command: npm run typecheck
    exit_code: 0
    result: pass
    evidence_ref: worktree .worktrees/oso-typescript-esm-foundation-and-host-feasibility 运行
  - command: npm run build
    exit_code: 0
    result: pass
    evidence_ref: dist/ 干净重建 + post-build 复制 ESM type 标记
  - command: npm test
    exit_code: 1
    result: pass-with-known-preexisting
    evidence_ref: "205 tests / 204 pass / 1 fail；唯一失败 = test/shims-installer.test.js 'preserves symlink when openspec is a symlink'（Windows 非管理员 symlink EPERM；迁移前基线冻结于 git aaefc6cd1，main 分支同样失败——已验证非本次变更引入）"
  - command: cd probe && npm run typecheck && npm run build && node --import tsx --test test/tarball-dual-entry.test.ts
    exit_code: 0
    result: pass
    evidence_ref: tarball 白名单 + CLI/插件双入口正向/反向隔离 + 安装副作用为零
  - command: cd probe && node --import tsx --test test/host-probe.test.ts
    exit_code: 0
    result: pass
    evidence_ref: 真实 OpenCode 1.18.29 端到端（插件只加载一次 / typed 工具带参调用 / 工具上下文完整 / session.idle 可观察）；机器证据 openspec/changes/oso-typescript-esm-foundation-and-host-feasibility/host-probe-run.json
  - command: node --test test/imp16-tarball-equivalence.test.js
    exit_code: 0
    result: pass
    evidence_ref: 从真实 tarball 对比迁移前行为基线（CLI 版本/help/create-project 委托/registry+setup 完整 API 面/shim 资产与 dist 委托/零安装副作用/错误输入退出码）
unresolved: []
---

# 阶段 0 验收记录

## 当前结论

阶段 0 Gate 全部通过（0A + 0B）。TypeScript 7.0.2 严格类型检查通过；干净 ESM 构建通过；真实 npm tarball 的 CLI/插件双入口在 Node 24.14.0 + OpenCode 1.18.29 组合中加载且互不产生副作用；必需 Hook 与工具能力有自动断言；现有 CommonJS 代码全部等价迁移并删除（bin/、lib/ 已不存在，无双格式副本，`test/no-cjs.test.js` 固化扫描）；迁移前行为基线（203 tests 冻结于 git aaefc6cd1 + 新增 no-cjs/imp16 测试 = 205/204/1）在迁移后从 tarball 重复验证一致。**允许进入阶段 1。**

## Gate 执行记录

所有命令在 worktree `.worktrees/oso-typescript-esm-foundation-and-host-feasibility` 内执行；`tested_commit` 为最终验证时主仓库 HEAD。分批提交历史见 worktree git log（0A 探针 3 提交、0B 三批 9 提交、Gate 记录若干）。

## 与实施方案的偏差和 Decision

- **D-1（详见 openspec/changes/.../decisions.md）**：`@opencode-ai/plugin` 固定 1.14.48（1.18.29 的传递依赖 ini@7 要求 Node ^24.15.0，与 24.14.0 冲突；1.14.48 依赖树 engines 交集 >=22.9.0，据此冻结最低 Node 版本）。开发期（包未发布）OpenCode 加载 tarball 产物走 `.opencode/plugins/` 本地桥 re-export——实测 bare name 走 npm registry、未发布包静默失败；包发布 npm 后 bare name 即生产路径，发布时须用已发布包重跑 Host Probe（记入阶段 10 发布门）。
- **D-1 演进注记（2026-09-06，Gate 后评审；依据 local/docs/2026-09-06-node-opencode-plugin-runtime-model.md）**：exp118 零 Node 实验证实 plugin **1.18.29 与 1.14.48 在 OSO 用到的 API 面上运行时行为等价**（tool.schema 工具真实调用、参数完整、事件 Hook、上下文字段），且部署路径由 opencode 内嵌 Bun 安装运行、**不构成用户 Node 门槛变化**（修正 Gate 时"固定 1.14.48"的评估前提——ini@7 的 Node 要求只约束探针 npm 路径，不约束 Bun 部署路径）。**已定案：阶段 5 Adapter 实现期间部署模板切换 1.18.29**，随"更换 plugin 版本必过探针"的既有任务回归，并复核 README/engines/发布说明；在此之前部署模板维持 1.14.48。本报告的验收结论与 gate_commands 不受影响（Gate 时交付物基于 1.14.48 的事实不变）。
- **D-2**：`chat.message` Hook 在 headless（`opencode run`）下不提供 `messageID`（实测 message_id_present=false）。Adapter 幂等键不得依赖它；阶段 5 按规范"Message ID 缺失时拒绝完整模式"执行并补测 TUI 场景。
- **能力矩阵关键实测**（capability-matrix.md）：`chat.message` 签名与规范假设一致（input: sessionID/agent?/model?/messageID?/variant?, output: message+parts）；`tool.execute.after`、`session.idle` optional-supported；压缩 Hook optional（类型 `experimental.session.compacting` 存在）；宿主结构化日志 API optional-missing（阶段 5 前复核）；**工具 args 必须用 tool.schema 定义**（裸对象 schema 参数不传递——实测 message=null）。
- **测试断言跟随已批准结构变化**（逐条）：cli.test.js spawn 路径 bin→dist/cli；setup-package.test.js 存在性断言 lib→dist；shims-installer.test.js 夹具 lib/shims→assets/shims；shim-intercept.test.ps1 CLI 路径——全部为迁移映射第六节"已批准的发布结构变化"，断言语义零改动。
- **工程细节**：src/package.json（{"type":"module"}）标记 src 为 ESM 供 tsc NodeNext 判定；scripts/post-build.mjs 复制该标记到 dist/；ESM 具名绑定不受 node:test mock 影响——src/registry-utils.ts 改用 default import + 属性访问（10 个 mock 测试恢复）。

## 交给下一阶段

- 统一的 TypeScript + ESM 代码库（src/ → dist/ ESM、声明文件 + source map）；typecheck/build/test 脚本语义按主册 2.1 冻结（test = typecheck + build + node --test）。
- 已验证的插件与 CLI 入口：bin 三命令名指向 dist/cli/index.js；exports 登记 `./cli`；插件入口形态（async 插件函数 + tool + event + chat.message hooks）已由探针证明；正式 `src/opencode-plugin/` 与 `src/oso-core/` 随阶段 1+ 落地。
- 宿主上下文字段：plugin ctx = { project, client, $, directory, worktree }；工具 ctx 含 directory/worktree（普通项目目录下 worktree="/"）。
- 必需/可选 Hook 边界及支持版本矩阵：capability-matrix.md（OpenCode 1.18.29 / Node 24.14.0 / plugin 1.14.48 / TS 7.0.2）。
- **长期回归资产 `probe/`**：阶段 0A 探针包，规范 IMP-0510 的执行载体（更换 opencode/plugin 版本必先过探针）；运行方法、触发矩阵与版本切换操作序见 `local/docs/2026-09-06-host-probe-usage-guide.md`。阶段 5 切换 plugin 1.18.29 时按其第五节操作序执行。
- 阶段 1 以后不得重新引入 CommonJS 业务模块（test/no-cjs.test.js 已固化）。
