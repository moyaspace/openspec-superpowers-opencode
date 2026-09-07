## ADDED Requirements

### Requirement: CLI 与插件入口隔离

同一 ESM npm 包 MUST 提供两个 `dist/` 薄入口：CLI 入口（`bin` 与 `exports` 的 CLI 路径）与 OpenCode 插件入口。加载插件入口 MUST NOT 执行 CLI 初始化、参数解析、文件修改或进程退出；执行 CLI MUST NOT 注册 OpenCode Hook。二者 MUST 复用同一最小共享 Core。若单包无法隔离，MUST 形成拆包 Decision 并修订 exports 与发布方案后重新通过 0A。

#### Scenario: 插件加载不触发 CLI 逻辑

- **WHEN** 真实 OpenCode/Bun 加载 tarball 中的插件入口
- **THEN** CLI 参数解析与进程退出逻辑未被执行，未发生文件修改

#### Scenario: CLI 执行不注册 Hook

- **WHEN** 从 tarball 执行 CLI 命令
- **THEN** 无 OpenCode Hook 被注册（探针断言加载侧无插件初始化副作用）

---

### Requirement: npm tarball 安装副作用验证

0A MUST 从真实 npm tarball 安装到干净测试项目，验证插件与 CLI 入口均可加载，且安装过程无非预期副作用（未创建 `.opencode/package.json`、未部署插件或 Core 源码到用户项目、`files` 白名单外的文件不进入 tarball）。

#### Scenario: tarball 双入口加载

- **WHEN** 在干净项目安装真实 tarball 并分别加载插件入口与执行 CLI 入口
- **THEN** 两个入口均成功加载，项目目录不出现 Adapter/Core 源码副本或 `.opencode/package.json`

#### Scenario: 安装副作用检查

- **WHEN** 对比安装前后的项目目录与配置
- **THEN** 除 npm 自身的 node_modules/lockfile 外无其他文件变化
