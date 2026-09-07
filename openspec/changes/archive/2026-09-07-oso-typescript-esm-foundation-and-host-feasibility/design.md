## Context

当前仓库是 CommonJS 单体系 Node.js CLI 包：`bin/cli.js`、`bin/create-project.js`、`lib/`（setup/registry/shims-installer/verify 等 15 个模块）、`lib/shims/` 三个原生 shim 脚本、`test/` 20 个 node:test 测试文件、`scripts/shims-installer.js` 作为 npm install 钩子。已有能力：setup planner/deploy/manifest、registry 聚合、worktree 创建、OpenSpec shim 命令拦截、OPSX Markdown Command、verify 健康检查。尚无 OSO Core、OpenCode npm 插件入口和自定义工具。

V1 实施规范（三册，冻结基线）第十章规定阶段 0 先于一切业务代码：0A 用隔离最小探针证明 TypeScript + ESM 能被真实 OpenCode、CLI 和 npm tarball 正确加载；0A Gate 通过后 0B 才在行为刻画测试保护下做等价迁移。迁移是技术形式转换，不得改变 setup/registry/shim/CLI 业务行为。

已实测环境：Node v24.14.0、npm 11.9.0、opencode 1.18.29、Windows（win32）。规范固定 TypeScript 7.0.2 起始、`module/moduleResolution: NodeNext`、`target` 起始 ES2022（可根据真实依赖提高但不能改回 CommonJS）。

## Goals / Non-Goals

**Goals:**
- 0A：最小 TypeScript + ESM 探针链路——严格 tsconfig、临时 dist、ESM CLI/插件双薄入口、最小共享 Core、真实 npm tarball；Host Compatibility Probe 记录真实 Hook 名称/参数/返回值/调用次数/await 行为/时序；能力矩阵三分法定级；双入口隔离与安装副作用验证；Windows/Linux 可重复探针
- 0B：行为刻画测试先于迁移（CLI 参数/输出/退出码、setup 计划与部署、registry 聚合、worktree、三平台 shim、verify、重复执行、错误输入、Windows/Linux 路径）；按"无状态工具 → registry/worktree → setup/verify → shim 安装器 → CLI 入口"顺序等价迁移；删除 CommonJS 源码；从真实 tarball 对比迁移前后行为
- 产出 stage-gate-report.md（local 私有 Git）与 docs/tasks.md 进度摘要

**Non-Goals:**
- 不实现 Product、Interview、Sprint、Readiness、领域规则等任何业务阶段能力
- 不改变 setup/registry/shim/CLI 的业务行为（只做形式转换）
- 不创建 `template/.opencode/package.json`；不把插件或 Core 源码部署到 `template/.opencode/`
- 不把可选 Hook（`tool.execute.after`、`session.idle`、压缩 Hook）当作 V1 前提
- 不清除、不覆盖与本阶段无关的现有修改

## Decisions

1. **0A/0B 顺序 Gate**（规范固定）：0A 未通过不得开始 0B；0A 失败时停止并形成设计 Decision，不得回到长期混合模块方案。
2. **单包双入口优先**（规范固定）：同一 ESM 包提供 CLI 与插件两个 `dist/` 薄入口；若单包无法隔离，形成拆包 Decision 并修订 exports/发布方案后重新过 0A。
3. **TypeScript 7.0.2 + NodeNext + 严格选项**（规范固定）：实施者不得切换 TypeScript 6；若真实依赖要求提高 target 或 Node 版本，记录证据并同步支持矩阵。相对导入写运行时 `.js` 扩展名。
4. **测试入口显式发现文件**（规范固定）：`tsx --test` 经小型 TypeScript 测试入口枚举 `test/**/*.test.ts`，不依赖 shell 展开。
5. **真实宿主不可替身**（用户约束 + 规范）：真实 OpenCode 行为与 npm tarball 加载不用测试替身代替；可重复单元测试可用 Stub/Fake/Mock 但只隔离测试范围外依赖，不得用空壳冒充未实现能力。
6. **迁移顺序**（规范固定）：无状态工具 → registry/worktree → setup/verify → shim 安装器 → CLI 入口；每组迁移后立即运行对应行为测试。
7. **shim 保持原生格式**：作为非 TypeScript 资产迁入 `assets/shims/`，等价性由同一测试证明。

## Risks / Trade-offs

- [真实 OpenCode 对 ESM npm 插件的加载行为与假设冲突] → 0A 探针先行；冲突时输出证据、受影响 IMP 任务与最小设计 Decision，冻结依赖假设的接口，向用户确认
- [TypeScript 7 或依赖链要求更高 Node/target] → 0B 首个任务即验证并冻结版本组合；记录到 stage-gate-report.md
- [Bun（OpenCode 内嵌运行时）与 Node ESM 语义差异] → 探针同时覆盖真实 OpenCode 加载与 Node CLI 加载，两侧断言分别记录
- [迁移中行为漂移] → 迁移前行为刻画测试先全部通过并冻结为基线；每组迁移后立即重跑；最终从真实 tarball 对比
- [Windows/Linux 差异（路径、shim、换行）] → 行为刻画测试覆盖双平台路径行为；探针命令在两个平台可重复运行
- [npm install 钩子副作用] → 探针在干净目录安装 tarball 并断言无非预期文件/配置变化

## Migration Plan

0A（探针）→ 0A Gate → 0B（行为基线 → 分组迁移 → 清除 CommonJS → tarball 对比）→ 0B/阶段 0 最终 Gate → stage-gate-report.md。回滚策略：全部工作在独立 worktree（`feature/oso-typescript-esm-foundation-and-host-feasibility`）进行，main 不受影响；0A 失败时仅丢弃探针代码并形成 Decision。

## Open Questions

- 目标 OpenCode 1.18.29 的真实 Hook 签名与 await 时序（0A 探针实测后回填能力矩阵）
- TypeScript 7.0.2 与 @types/node@24 的实际兼容 target（0B 实测后冻结）
