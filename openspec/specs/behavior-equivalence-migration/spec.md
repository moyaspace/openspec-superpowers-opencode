# behavior-equivalence-migration Specification

## Purpose
本 capability 定义从 CommonJS 迁移到 TypeScript + ESM 期间的行为锁定方法：先用行为刻画测试固定既有可观察行为，再按依赖顺序逐组等价迁移，确保迁移只改变实现形态，而不改变 CLI、setup、registry、worktree、shim 与 verify 的对外行为。
## Requirements
### Requirement: 迁移前行为刻画测试

0B 开始前 MUST 补齐行为刻画测试并使其在迁移前的 CommonJS 代码上通过，固定：CLI 参数/输出/退出码、setup 计划与部署、registry 聚合、worktree、三个平台 shim、verify、重复执行、错误输入和 Windows/Linux 路径行为。该基线是 0B 等价迁移的比较依据。

#### Scenario: 行为基线先于迁移通过

- **WHEN** 在未迁移的 CommonJS 代码上运行行为刻画测试套件
- **THEN** 全部通过并作为迁移前基线记录

---

### Requirement: 按依赖顺序等价迁移

0B MUST 按"无状态工具 → registry/worktree → setup/verify → shim 安装器 → CLI 入口"的顺序把现有 JavaScript 迁移到 `src/**/*.ts`。只转换类型、导入导出和 ESM 路径处理；每组迁移后 MUST 立即运行对应行为测试，不得混入需求治理功能重构。只读接口 MUST NOT 为补齐目录或缓存而改变正式事实。

#### Scenario: 每组迁移后行为测试立即通过

- **WHEN** 任一迁移组完成
- **THEN** 对应行为测试在该组代码上立即通过，失败时不得继续下一组

---

### Requirement: shim 资产等价迁移

原生 `openspec`、`openspec.cmd`、`openspec.ps1` shim 脚本 MUST 作为非 TypeScript 资产迁入 `assets/shims/`，由 `src/shims-installer.ts` 安装。迁移前后脚本内容、委托关系和跨平台行为 MUST 由同一测试证明等价。

#### Scenario: shim 行为等价

- **WHEN** 运行 shim 安装与拦截测试
- **THEN** 迁移后安装的 shim 脚本内容与迁移前一致，命令拦截与委托行为在 Windows/Linux 一致

---

### Requirement: CommonJS 源码清除与禁用扫描

迁移完成后 MUST 删除已被等价替代的 CommonJS 业务源码和过渡入口，并扫描发布文件确保：没有业务代码使用 `require`/`module.exports`，没有同一业务模块的 CommonJS/ESM 双份实现，没有从 `dist/` 反向引用开发仓库文件。

#### Scenario: 发布包无 CommonJS 业务副本

- **WHEN** 对 tarball 内容执行 CommonJS 禁用扫描
- **THEN** 扫描未发现业务代码使用 `require`/`module.exports`，且不存在同一模块的双格式副本

---

### Requirement: 迁移前后行为对比

0B MUST 从真实 tarball 重复运行 CLI、setup、registry、worktree、shim、verify 和插件探针；对比迁移前行为基线，除已批准的模块与发布结构变化外，输出、退出码、文件结果和失败行为 MUST 一致。

#### Scenario: tarball 行为与基线一致

- **WHEN** 从真实 tarball 在干净项目重复运行为为基线覆盖的全部入口
- **THEN** 除发布结构变化外，输出、退出码与文件结果与迁移前基线一致

