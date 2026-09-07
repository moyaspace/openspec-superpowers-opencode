# Brainstorm: oso-typescript-esm-foundation-and-host-feasibility

## Design Summary

<!-- Validated design from brainstorming session -->

本 Change 的设计**已经在实施规范中冻结并经用户批准**，不需要重新探索。设计来源（唯一权威，按优先级）：

1. `local/docs/2026-08-31-OSO需求探索与Sprint规划实施方案.md`（主册：实施基线、固定技术决策、目标仓库布局）
2. `local/docs/2026-08-31-OSO需求探索与Sprint规划实施方案-程序实现与验收.md`（分册第十章"阶段 0：TypeScript + ESM 统一迁移和宿主可行性验证"）
3. `local/docs/2026-08-31-OSO需求探索与Sprint规划实施方案-附录.md`（共用术语；阶段 0 不实现 Readiness/领域规则）

核心设计（分册第十章阶段 0，已冻结）：

- **0A / 0B 两个顺序 Gate**：0A 用隔离的最小 TypeScript + ESM 构建、插件与 tarball 验证 OpenCode/CLI 加载链路；0A Gate 通过后，0B 才在行为保护测试下等价迁移现有 CommonJS 代码。0A 失败时停止并形成设计 Decision，不得开始迁移。
- **技术栈固定**：TypeScript 7.0.2 起始、`module: NodeNext`、`moduleResolution: NodeNext`、`strict` 全开、`verbatimModuleSyntax`、相对导入写 `.js` 运行时扩展名；`dist/` 只含编译产物；npm 的 CLI 入口（`dist/cli/index.js`）与 OpenCode 插件入口（`dist/opencode-plugin/index.js`）为两个互相隔离的薄 ESM 入口。
- **迁移是技术形式转换**：不改变 setup/registry/shim/CLI 业务行为；shim 脚本保持原生格式迁入 `assets/shims/`；迁移后删除 CommonJS 源码与过渡入口，禁止同一业务模块的 CommonJS/ESM 双版本。
- **真实宿主验证不可替代**：真实 OpenCode 行为与 npm tarball 加载不得用测试替身冒充；Host Compatibility Probe 记录真实 Hook 名称、参数、返回值、调用次数、await 行为与时序，形成能力矩阵（required-supported / required-missing / optional-*）。
- **执行记录分工**：阶段定义只在规范中维护；`docs/tasks.md` 保存跨阶段进度摘要；`local/implementation/oso-v1/stages/stage-0-typescript-esm-and-host-feasibility/stage-gate-report.md` 保存 Gate 持久摘要（local 私有 Git 跟踪）。

## Alternatives Considered

<!--
依 openspec/config.yaml 的 brainstorm rule：須涵蓋 2-3 個替代方案並說明取捨。
（以下方案已在实施规范评审中评估并由规范给出结论；此处记录结论与理由。）
-->

### 方案 A：直接开始业务功能开发，迁移延后
- **做法**：在现有 CommonJS 上直接实现 OSO Core/Adapter，之后再考虑模块格式。
- **优点**：短期进度最快。
- **缺点**：长期维持两套运行体系；宿主兼容性问题在最重的业务代码之后才暴露；规范明确禁止（主册"TypeScript + ESM 迁移原则"：V1 不长期维持两套运行体系）。
- **为何未採用**：违反规范冻结决策；风险后置。

### 方案 B：0A 与 0B 并行——迁移与宿主验证同时进行
- **做法**：不等 0A Gate，一边搭 TS+ESM 骨架一边批量转换现有代码。
- **优点**：总工期可能缩短。
- **缺点**：宿主加载失败时已产生大量无依据的转换工作；违反规范"0A 未通过时不得开始 0B"的顺序 Gate 要求。
- **为何未採用**：规范明确禁止；失败回退成本高。

### 方案 C：拆分为多个 npm 包（CLI 包 + 插件包）
- **做法**：CLI 与 OpenCode 插件分成两个包发布。
- **优点**：入口隔离最彻底。
- **缺点**：包间依赖与版本同步成本；规范要求"同一 ESM npm 包同时提供 CLI、Core 和插件"为首选，仅当单包无法隔离时才形成拆包 Decision。
- **为何未採用**：规范首选单包双入口；拆包是 0A 验证失败后的备选 Decision，不是默认方案。

## Agreed Approach

采用规范冻结的方案：**单包 TypeScript + ESM，双薄入口，0A/0B 顺序 Gate**。0A 先以最小探针（隔离 `tsconfig`、临时 `dist`、最小共享 Core、真实 npm tarball、真实 OpenCode）验证加载链路；通过后在行为刻画测试保护下按"无状态工具 → registry/worktree → setup/verify → shim 安装器 → CLI 入口"的顺序迁移现有代码（0B）。shim 脚本作为非 TypeScript 资产迁入 `assets/shims/`。

## Key Decisions

- TypeScript 7.0.2 为 0A 起始稳定版；Gate 通过后冻结精确补丁版本与最低 Node 版本（规范固定，实施者不得切换 TypeScript 6）。
- `package.json` 增加 `type: "module"`、`exports`（CLI/插件双入口）、`bin` 指向 `dist/cli/index.js`；`files` 只含发布产物。
- 脚本语义：`typecheck`（tsc 严格检查不产出）、`build`（先清 dist 再编译并校验发布清单）、`test`（先 typecheck 再 `tsx --test`）、`prepack`（干净构建 + 包内容测试）。
- 测试路径枚举用小型 TypeScript 测试入口显式发现，不依赖 shell 展开 `**`。
- 真实 OpenCode 宿主行为与 npm tarball 加载不用测试替身代替；可重复单元测试可用 Stub/Fake/Mock，但只能隔离当前测试范围外的依赖。
- 不创建 `template/.opencode/package.json`；不把插件或 Core 源码部署到 `template/.opencode/`。
- 上下文压缩 Hook 归入可选能力，缺失不单独导致 Gate 失败，但降级恢复测试失败阻止通过。

## Open Questions

- 0A 探针执行时才能确定的事实（按规范记录到能力矩阵与 stage-gate-report.md）：
  - 目标 OpenCode 版本对 ESM npm 插件的真实 Hook 名称/参数/时序（`chat.message` 等）。
  - 真实 npm tarball 在 OpenCode/Bun 中的加载副作用。
  - 可选 Hook（`tool.execute.after`、`session.idle`、压缩 Hook）在当前版本是否可用。
- 若真实宿主行为与方案假设冲突：先给出证据、受影响 IMP 任务和最小设计 Decision，不在代码中暗自改方案。
