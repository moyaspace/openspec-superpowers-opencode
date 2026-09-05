## Why

当前 OSO 包是 Node.js CommonJS 单体系（`bin/` + `lib/`），而 V1 方案要求 TypeScript + ESM 作为唯一运行体系，且禁止长期维持 CommonJS/ESM 混合。在新增数千行业务代码前，必须先用最小探针证明真实 OpenCode 与 npm tarball 能加载 TypeScript 编译的 ESM 插件与 CLI 双入口；证明成立后才把现有代码在行为保护测试下等价迁移。否则宿主兼容性问题会在业务代码最重时才暴露，返工成本最高。实施依据为实施规范三册（阶段 0，IMP-<PII type="CASE_ID" id="123"/> 至 IMP-0015）。

## What Changes

**模块体系**
- From: 纯 CommonJS（`bin/*.js`、`lib/**/*.js`、`require/module.exports`、`engines: node >= 16`）
- To: TypeScript + ESM 单包（`src/**/*.ts`、`import/export`、`module: NodeNext`、TypeScript 7.0.2 起始、严格类型检查、`dist/` 编译产物）
- Reason: V1 全部后续阶段只在这套基线上编码
- Impact: breaking（包内部结构），用户可见行为保持等价

**npm 包入口**
- From: `bin` 直接指向 CommonJS 脚本
- To: `exports`/`bin` 指向 `dist/` 中两个互相隔离的薄 ESM 入口（CLI `dist/cli/index.js`、OpenCode 插件 `dist/opencode-plugin/index.js`），复用同一 Core
- Reason: 插件加载不得执行 CLI 初始化/退出，CLI 执行不得注册 Hook
- Impact: 发布结构变化；安装副作用须验证无非预期变化

**宿主可行性验证（新增）**
- 新增 Host Compatibility Probe：真实 OpenCode 验证 ESM 插件加载、自定义工具调用、Hook 名称/参数/时序、Session/Message 标识稳定性、await 行为、双入口隔离、npm 安装副作用、宿主日志转发
- 产出能力矩阵（required-supported / required-missing / optional-*）

**shim 资产**
- From: `lib/shims/`（openspec、.cmd、.ps1）
- To: `assets/shims/`（非 TypeScript 资产），由 `src/shims-installer.ts` 安装，脚本内容与委托关系等价

**删除**
- 迁移完成后删除全部被等价替代的 CommonJS 业务源码与过渡入口；禁止同一业务模块 CommonJS/ESM 双版本

## Capabilities

### New Capabilities
- `typescript-esm-build-baseline`: TypeScript 7 严格类型检查、NodeNext ESM 构建、dist 产物、typecheck/build/test/prepack 脚本、版本冻结（Node/TS/@types/tsx）、CommonJS 禁用扫描
- `host-compatibility-probe`: 真实 OpenCode 宿主探测程序与可重复探针命令（Windows/Linux）、能力矩阵、Hook/工具/标识/await 时序断言、宿主日志探测
- `dual-esm-entry-isolation`: 同一 ESM tarball 的 CLI/插件双入口隔离验证与 npm 安装副作用验证
- `behavior-equivalence-migration`: 迁移前行为刻画测试基线、按依赖顺序的 0B 等价迁移、迁移前后行为对比

### Modified Capabilities

（无——本仓库尚无 openspec/specs/ 主规格；现有 OPSX/setup/registry 行为要求保持等价，不构成规格级需求变更。）

## Impact

- **代码**：`bin/`、`lib/` 全部迁移为 `src/**/*.ts`；新增 `src/cli/`、`src/opencode-plugin/`、`src/oso-core/`（最小共享 Core）、`src/setup/`、`src/registry-utils.ts`、`src/shims-installer.ts`、`src/verify.ts`；`assets/shims/` 接收 shim 资产
- **构建/依赖**：新增 devDependencies（typescript 7.0.2、@types/node、@types/proper-lockfile、tsx）；`package.json` 增加 `type: module`、`exports`、脚本语义；lockfile 冻结补丁版本
- **测试**：现有 20 个测试文件迁移为 TypeScript 并保持全部通过；新增 0A 探针测试、行为刻画基线测试、双入口隔离测试、tarball 冒烟测试
- **API**：`oso` CLI 命令行行为、setup/registry/worktree/shim/verify 的可观察行为不变
- **系统**：Windows/Linux CI 均须通过；真实 OpenCode（1.18.29）与 Node（v24.14.0）组合被验证并记录
