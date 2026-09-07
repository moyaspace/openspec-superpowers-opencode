## 1. 0A：最小 TypeScript + ESM 探针（IMP-IMP-0001–IMP-0009）

- [x] 1.1 IMP-IMP-0001 盘点 bin/、lib/、setup、registry、verify、shim 安装器和测试，形成"现有文件 → 迁移后文件 → 行为保护测试"映射清单，列出所有 require、module.exports、__dirname、__filename、动态加载、安装副作用和同步加载假设（openspec/changes/.../migration-map.md）
- [x] 1.2 IMP-IMP-0003 建立隔离最小 TypeScript + ESM 探针：严格 tsconfig（NodeNext/strict）、构建到临时 dist、不同 ESM CLI/插件薄入口、最小共享 Core；不批量转换现有模块（probe/ 包）
- [x] 1.3 IMP-IMP-0006 打包真实 npm tarball，验证 CLI/插件双入口可从 tarball 加载且互相隔离（插件加载不执行 CLI 逻辑，CLI 执行不注册 Hook）；验证安装副作用（不创建 .opencode/package.json、不部署源码副本）（probe/test/tarball-dual-entry.test.ts，正向+反向隔离断言）
- [x] 1.4 IMP-IMP-0004 建立 Host Compatibility Probe：真实 OpenCode（headless/可自动化模式）验证 ESM 插件只加载一次、自定义工具可调用、工具上下文完整、Session/Message 标识稳定、await 行为与时序；能力矩阵记录真实 Hook 名称/参数/返回值/调用次数/时序（probe/test/host-probe.test.ts + capability-matrix.md）
- [x] 1.5 IMP-IMP-0005 验证"用户消息 Hook 真实触发且发生在模型处理前"与 pending 登记最小路径；不可靠时停止完整 Adapter 模式并形成 Decision（chat.message 实测触发于模型流前；D-2：headless 下 messageID 缺失——decisions.md）
- [x] 1.6 IMP-IMP-0007 建立可重复探针命令（Windows 本机 + Linux CI 可运行；无法自动化的 TUI 部分用 headless/server 探针 + 一次人工基线记录）（探针测试全部用 spawnSync 可重复执行；人工基线 = 本报告中的命令与版本记录）
- [x] 1.7 IMP-IMP-0008 探测可选宿主结构化日志 API 与 flush 时序；支持则建最小 Host Log Sink 测试，不支持记 optional-missing（capability-matrix.md #12：optional-missing，阶段 5 前复核）
- [x] 1.8 IMP-IMP-0009 探测可选 Hook（tool.execute.after、session.idle、压缩 Hook）；验证时机与副作用边界或既定降级路径（tool.execute.after + session.idle 实测 optional-supported；压缩 Hook 类型存在、optional）
- [x] 1.9 0A Gate：严格类型检查通过、ESM 构建成功、真实 tarball 双入口在 Node/OpenCode 组合中加载且无副作用、必需 Hook/工具能力有自动断言、能力矩阵产出；失败则停止并形成设计 Decision（全部通过；D-1/D-2 记录）

## 2. 0B：现有代码等价迁移（IMP-IMP-0010–IMP-0015）

- [x] 2.1 IMP-IMP-0010 冻结版本组合：TypeScript 精确补丁版本、最低 Node 版本与实际 CI 版本、@types/node、@types/proper-lockfile、tsx；落实 package.json type/exports/bin/files 与 build/typecheck/test 脚本和 lockfile（TS 7.0.2、Node >=22.9.0（依赖树 engines 交集）、@types/node 26.4.1、tsx 4.23.13；@types/proper-lockfile 属阶段 2 事务依赖，本阶段未引入）
- [x] 2.2 IMP-IMP-0002 补齐迁移前行为刻画测试（CLI 参数/输出/退出码、setup 计划与部署、registry 聚合、worktree、三平台 shim、verify、重复执行、错误输入、Windows/Linux 路径），在 CommonJS 代码上全部通过并冻结为基线（基线 203/202/1 冻结于 git aaefc6cd1；补 create-project + console-reporter 两个无覆盖文件的最小刻画测试）
- [x] 2.3 IMP-IMP-0013 建立主册目录树 src/、dist/、resources/、assets/ 和 TypeScript 测试结构；构建清理并重新生成 dist/，复制所需资源，生成声明/source map（src/ 全量 .ts；assets/shims/；resources/ 属阶段 1+ 业务资源，本阶段无需）
- [x] 2.4 IMP-IMP-0011 按依赖顺序迁移：无状态工具 → registry/worktree → setup/verify → shim 安装器 → CLI 入口；每组迁移后立即运行对应行为测试（三批共 19 个模块，每批提交前 203/202/1）
- [x] 2.5 IMP-IMP-0012 将 shim 脚本迁入 assets/shims/（非 TypeScript 资产），由 src/shims-installer.ts 安装；等价性由同一测试证明（三份 shim 委托路径 lib→dist 已批准变化；shim-intercept/instailler 测试通过）
- [x] 2.6 IMP-IMP-0014 删除被等价替代的 CommonJS 源码与过渡入口；扫描发布文件确认无 require/module.exports 业务代码、无双格式副本、无 dist 反向引用（bin/、lib/ 全删；test/no-cjs.test.js 固化扫描）
- [x] 2.7 IMP-IMP-0015 从真实 tarball 重复运行全部入口并对比迁移前行为基线；输出、退出码、文件结果和失败行为一致（除已批准的发布结构变化）（test/imp16-tarball-equivalence.test.js 通过）

## 3. 阶段 0 最终 Gate 与记录

- [x] 3.1 运行完整阶段 0 Gate（typecheck + 干净构建 + 全部测试 + tarball 冒烟 + CommonJS 扫描 + 探针），记录实际命令与退出码（stage-gate-report.md gate_commands 6 条全记录）
- [x] 3.2 生成能力矩阵（三分法定级 + 证据）写入变更目录；验证压缩 Hook 缺失时降级恢复测试仍通过（capability-matrix.md；压缩 Hook optional，探针事件流证明无 Hook 时业务路径正常）
- [x] 3.3 填写 stage-gate-report.md（local/implementation/oso-v1/stages/stage-0-typescript-esm-and-host-feasibility/，local 私有 Git）与 docs/tasks.md 进度摘要（IMP 完成状态、锁定版本、Gate 命令与结果）（local git 0316ae8）
- [x] 3.4 判断并报告：是否满足进入阶段 1 的条件（所有必需能力 required-supported、行为等价断言全部通过、无未解决阻塞）（满足——允许进入阶段 1）
