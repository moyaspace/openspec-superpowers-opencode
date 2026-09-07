# 阶段 0：TypeScript + ESM 统一迁移与宿主可行性 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先用隔离最小探针证明真实 OpenCode/npm tarball 能加载 TypeScript 7 编译的 ESM 插件与 CLI 双入口（0A），再在行为刻画测试保护下把现有 CommonJS 包等价迁移为 TypeScript + ESM（0B），直至阶段 0 Gate 通过。

**Architecture:** 单 npm 包双 ESM 薄入口（`dist/cli/index.js` 与 `dist/opencode-plugin/index.js`）复用同一最小共享 Core；`src/` 全量 `.ts`（NodeNext + 严格选项，相对导入写 `.js` 运行时扩展名）；shim 保持原生脚本资产入 `assets/shims/`；行为基线测试先于迁移并通过 tarball 对比验证等价。

**Tech Stack:** TypeScript 7.0.2（起始）、Node ≥ 22（0A 实测冻结）、tsx（测试运行器）、node:test、@opencode-ai/plugin（探针验证实际版本）、@moyaspace/openspec-superpowers-opencode 现有 1.1.1 功能面。

## Global Constraints

- 禁止创建 `template/.opencode/package.json`；禁止把插件或 Core 源码部署到 `template/.opencode/`。
- 禁止用测试替身代替真实 OpenCode 宿主行为与 npm tarball 加载；Stub/Fake/Mock 只能隔离当前测试范围外的依赖。
- 迁移是形式转换：setup/registry/shim/CLI 业务行为不变；不混入需求治理功能重构。
- TypeScript 7.0.2 起始，禁止切回 TypeScript 6；不得改回 CommonJS；`target` 起始 ES2022，只能提高不能降低严格性。
- 不清除、不覆盖与本阶段无关的现有修改。
- 全部工作在 worktree `feature/oso-typescript-esm-foundation-and-host-feasibility` 中进行。
- 0A Gate 未通过不得开始 0B 迁移。
- 每完成一组迁移立即跑对应行为测试；每个 Task 结束提交一次。

---

### Task 1: IMP-IMP-0001 盘点与迁移映射清单

**Files:**
- Create: `openspec/changes/oso-typescript-esm-foundation-and-host-feasibility/migration-map.md`

- [ ] **Step 1:** 扫描 `bin/`、`lib/`、`scripts/` 全部 `.js` 文件，记录每个文件的 `require`、`module.exports`、`__dirname`、`__filename`、动态 `require()`、进程副作用（install 钩子、process.exit、同步 IO）
- [ ] **Step 2:** 生成映射表：现有文件 → 迁移后 `src/` 路径 → 覆盖它的行为测试文件；写入 `migration-map.md`
- [ ] **Step 3:** Commit: `git add -A && git commit -m "docs: IMP-15 migration map"`

### Task 2: 0A 探针基础设施（tsconfig + 最小 Core + 双入口）

**Files:**
- Create: `tsconfig.json`（规范原文配置，include `src/**/*.ts`、`tools/**/*.ts`、`test/**/*.ts`）
- Create: `tsconfig.build.json`（noEmit:false、rootDir src、outDir dist、declaration/declarationMap/sourceMap、exclude test/tools）
- Create: `src/oso-core/index.ts`（最小共享 Core：一个纯函数，如 `export function coreVersion(): string`）
- Create: `src/cli/index.ts`（薄 CLI 入口：解析 argv，打印版本后退出，不注册任何 Hook）
- Create: `src/opencode-plugin/index.ts`（薄插件入口：默认导出 async 插件函数，注册一个最小工具，不解析 CLI 参数）
- Modify: `package.json`（`type: "module"`；`exports` 含 `.`/`./cli`/`./plugin` 指向 dist；`bin.oso` → `dist/cli/index.js`；scripts: typecheck/build/test/prepack；devDependencies: typescript@7.0.2、@types/node、tsx）

**Interfaces:**
- Produces: `dist/cli/index.js`（可执行）、`dist/opencode-plugin/index.js`（可加载）、`npm run typecheck`、`npm run build`

- [ ] **Step 1:** 写 tsconfig 两件套（规范原文逐字）并 `npm i -D typescript@7.0.2 tsx @types/node`
- [ ] **Step 2:** 写三个最小 `.ts` 源文件（上方 Interfaces 路径）
- [ ] **Step 3:** `npm run typecheck` 期望 exit 0；`npm run build` 期望 dist 生成 ESM
- [ ] **Step 4:** `node dist/cli/index.js --version` 期望打印版本；`node -e "import('.../dist/opencode-plugin/index.js').then(m=>console.log(typeof m.default))"` 期望 `function`
- [ ] **Step 5:** Commit: `feat: minimal TS+ESM dual-entry probe scaffold`

### Task 3: tarball 双入口隔离与安装副作用测试（IMP-IMP-0006）

**Files:**
- Create: `test/probe/tarball-dual-entry.test.ts`
- Modify: `package.json`（`files` 收敛为发布产物；`prepack` 链接 build）

- [ ] **Step 1:** 写失败测试：`npm pack` 后在 `fs.mkdtemp` 临时目录 `npm install <tarball>`；断言 (a) `node -e import('<pkg>/dist/opencode-plugin/index.js')` 成功；(b) tarball 的 `bin` 可执行；(c) 加载插件入口时未发生 CLI 参数解析副作用（探针入口设置全局标记，CLI 入口检查标记未设置）；(d) 安装后项目目录无 `.opencode/package.json`、无源码副本
- [ ] **Step 2:** 运行确认失败 → 修正 `exports`/`files`/入口分隔 → 通过
- [ ] **Step 3:** Commit: `test: tarball dual-entry isolation and install side effects`

### Task 4: Host Compatibility Probe（IMP-IMP-0004–IMP-0007）

**Files:**
- Create: `tools/host-probe/`（探针插件源码：真实加载 `@opencode-ai/plugin`，注册 `chat.message` 等钩子记录名称/参数/时序，注册最小自定义工具，写入 JSONL 事件日志）
- Create: `tools/host-probe/run-probe.ts`（搭建临时测试项目 → 安装探针 tarball → 以 headless/server 模式启动真实 opencode → 发消息 → 收集事件 → 断言）
- Create: `test/probe/host-probe.test.ts`（封装 run-probe，断言 Hook 触发顺序、await 行为、Session/Message 标识稳定性、重复加载无重复处理器）
- Create: `openspec/changes/.../capability-matrix.md`（能力矩阵：真实 Hook 名称/参数/返回值/调用次数/await/时序，三分法定级）

- [ ] **Step 1:** 写探针插件（不 mock；事件记录含时间戳与参数 JSON）
- [ ] **Step 2:** 写 run-probe 与测试；在真实 opencode 1.18.29 上运行
- [ ] **Step 3:** 记录能力矩阵；若必需能力缺失（required-missing）→ 停止、形成设计 Decision、向用户报告，不得继续 0B
- [ ] **Step 4:** Commit: `feat: host compatibility probe and capability matrix`

### Task 5: 0A Gate

- [ ] **Step 1:** 依序运行：`npm run typecheck` → `npm run build` → `npm test`（探针部分）→ tarball 测试 → host probe 测试；全部 exit 0
- [ ] **Step 2:** 记录命令与退出码到 tasks.md（勾选 1.9）与 stage-gate-report 草稿
- [ ] **Step 3:** Commit: `gate: 0A passed`（或失败时 `blocked: 0A` + Decision）

### Task 6: 版本冻结（IMP-IMP-0010）

**Files:**
- Modify: `package.json`（engines.node 按实测；devDependencies 精确版本）
- Modify: `package-lock.json`（`npm install` 生成）

- [ ] **Step 1:** 实测 TypeScript 7.0.2 + @types/node@24 组合 typecheck/build 通过；不通过则按规范提高 target 并记录证据
- [ ] **Step 2:** 冻结精确版本；`npm run typecheck && npm run build` exit 0
- [ ] **Step 3:** Commit: `chore: freeze versions IMP-56`

### Task 7: 迁移前行为刻画测试基线（IMP-IMP-0002）

**Files:**
- Create: `test/behavior/`（CLI 参数/输出/退出码、setup 计划与部署、registry 聚合、worktree、三平台 shim、verify、重复执行、错误输入、Windows/Linux 路径——在 CommonJS 现状上运行的 TS 测试）

- [ ] **Step 1:** 为每个行为面写刻画测试（含正向与错误输入），先在未迁移 CommonJS 代码上跑通（tsx 可直接 import CJS）
- [ ] **Step 2:** 全部通过后冻结为基线；Commit: `test: behavior baseline on CommonJS (IMP-48)`

### Task 8: 目录结构 + 无状态工具迁移（IMP-IMP-0013 + IMP-0011 第一组）

- [ ] **Step 1:** 建 `src/`、`resources/`、`assets/` 目录骨架；build 复制资源
- [ ] **Step 2:** 迁移无状态工具模块为 `.ts`；跑对应行为测试
- [ ] **Step 3:** Commit: `refactor: stateless utils to TS+ESM`

### Task 9: registry/worktree 迁移

- [ ] **Step 1:** 迁移 `lib/registry.js`、`lib/registry-utils.js` → `src/`
- [ ] **Step 2:** 跑 registry/registry-utils/worktree 行为测试
- [ ] **Step 3:** Commit: `refactor: registry and worktree to TS+ESM`

### Task 10: setup/verify 迁移

- [ ] **Step 1:** 迁移 `lib/setup/*`、`lib/verify.js` → `src/setup/`、`src/verify.ts`
- [ ] **Step 2:** 跑 setup-* / verify 行为测试
- [ ] **Step 3:** Commit: `refactor: setup and verify to TS+ESM`

### Task 11: shim 安装器与资产（IMP-IMP-0012）

- [ ] **Step 1:** `lib/shims/` 三个脚本迁入 `assets/shims/`（内容逐字节不变）；`lib/shims-installer.js` → `src/shims-installer.ts`
- [ ] **Step 2:** 跑 shim 安装/拦截等价测试（Windows shims-installer + shim-intercept）
- [ ] **Step 3:** Commit: `refactor: shims to assets + TS installer`

### Task 12: CLI 入口迁移与删除 CommonJS（IMP-IMP-0011 收尾 + IMP-0014）

- [ ] **Step 1:** `bin/cli.js`、`bin/create-project.js` 业务逻辑迁入 `src/cli/`；bin 保留薄转发或由 bin 字段直指 dist
- [ ] **Step 2:** 删除 `bin/`、`lib/` 全部被替代 `.js` 与过渡入口；写 CommonJS 禁用扫描测试（tarball 内容无 require/module.exports 业务代码、无双格式副本、dist 无反向引用）
- [ ] **Step 3:** 全量 `npm test` 通过；Commit: `refactor: CLI to TS+ESM, remove CommonJS`

### Task 13: tarball 行为对比（IMP-IMP-0015）

- [ ] **Step 1:** 从迁移后源码 `npm pack`，在干净临时项目安装并重复 Task 7 全部行为入口
- [ ] **Step 2:** 对比基线：输出、退出码、文件结果一致（除发布结构）；不一致则修复后重跑
- [ ] **Step 3:** Commit: `test: post-migration tarball equivalence (IMP-16)`

### Task 14: 阶段 0 最终 Gate 与记录

- [ ] **Step 1:** 运行完整 Gate 序列并记录退出码（typecheck/build/test/tarball/扫描/probe）
- [ ] **Step 2:** 填写 stage-gate-report.md 与 docs/tasks.md；勾选 tasks.md 全部条目
- [ ] **Step 3:** Commit: `gate: phase 0 complete`
