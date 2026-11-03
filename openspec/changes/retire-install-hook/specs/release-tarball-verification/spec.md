## ADDED Requirements

### Requirement: V2 迁移遗留测试 MUST 删除

仓库 MUST 删除 `test/imp16-tarball-equivalence.test.js`。删除后 `npm test` 主套件计数 MUST 从 318 变为 317；若减少更多，MUST 视为静默少收集并排查，MUST NOT 当作通过。

#### Scenario: 遗留测试文件不存在

- **WHEN** 检查 `test/imp16-tarball-equivalence.test.js`
- **THEN** 该文件不存在

#### Scenario: 主套件计数只减少一条

- **WHEN** 删除前运行 `npm test` 并记录主套件计数，删除后再次运行
- **THEN** 删除后计数等于删除前计数减 1（预期 318 → 317）

#### Scenario: 打出的 tarball 不含该测试

- **WHEN** 执行 `npm pack` 并读取 tarball 文件列表
- **THEN** 列表不含 `package/test/imp16-tarball-equivalence.test.js`

### Requirement: 独有断言 MUST 迁入 CI

`ci.yml` 的 `Verify tarball contents` 步骤 MUST 包含两条原属 imp16 的断言：`assets/shims/openspec.ps1` 不含 `Join-Path $TOOL_DIR "lib"`；tarball 不含 `package/src/` 与 `package/tsconfig.json`。任一条被违反时 CI MUST 以非 0 退出。

#### Scenario: ps1 引用旧 lib 路径时 CI 失败

- **WHEN** tarball 中的 `assets/shims/openspec.ps1` 含 `Join-Path $TOOL_DIR "lib"`
- **THEN** `Verify tarball contents` 步骤以非 0 退出

#### Scenario: tarball 含源码或 tsconfig 时 CI 失败

- **WHEN** tarball 列表包含 `package/tsconfig.json` 或 `package/src/` 下的文件
- **THEN** `Verify tarball contents` 步骤以非 0 退出

### Requirement: 删除后覆盖 MUST 保持等价

删除 imp16 后，其非独有断言 MUST 仍有等价覆盖：CLI `--version` / `--help` / `create-project --help` 由 `ci.yml` 的 CLI 步骤覆盖；`dist/registry*.js` 与 `dist/setup/index.js` 导出面由 `test/registry.test.js` 与 `test/setup-api.test.js` 覆盖；shim 三件套由 `ci.yml` 既有断言覆盖；未知命令非零退出由 `test/cli.test.js` 覆盖；「安装后能跑」由 `test/elevated/lifecycle-e2e.test.js` 覆盖。

#### Scenario: 覆盖对照全部通过

- **WHEN** 执行主套件、elevated 套件与 CI 的 CLI/tarball 步骤
- **THEN** 上述每一项断言均有至少一个通过的执行位置
