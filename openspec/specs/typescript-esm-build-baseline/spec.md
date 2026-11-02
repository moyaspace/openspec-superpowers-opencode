# typescript-esm-build-baseline Specification

## Purpose
本 capability 定义仓库的严格 TypeScript 与 ESM 构建基线：`tsconfig` 的严格选项、`dist/` 构建产物形态、版本组合冻结，以及 `typecheck` / `build` / `test` / `prepack` 的脚本语义。
## Requirements
### Requirement: 严格 TypeScript 类型检查与 ESM 构建基线

仓库 MUST 提供 `tsconfig.json`（`module: NodeNext`、`moduleResolution: NodeNext`、`strict: true`、`verbatimModuleSyntax: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes: true`）与 `tsconfig.build.json`（仅编译 `src/**/*.ts` 到 `dist/`，生成声明文件与 source map）。`npm run typecheck` MUST 在不产出文件的前提下通过；`npm run build` MUST 先删除旧 `dist/` 再编译并校验运行时资源包含在发布清单中。相对导入在源码中 MUST 写运行时 `.js` 扩展名。

#### Scenario: 严格类型检查通过

- **WHEN** 在仓库根执行 `npm run typecheck`
- **THEN** 命令以退出码 0 结束，且不产生任何输出文件

#### Scenario: 干净构建生成 ESM dist

- **WHEN** 在仓库根执行 `npm run build`
- **THEN** 旧 `dist/` 被删除后重新生成，产物为 ESM JavaScript、`.d.ts` 声明与 source map，且 `package.json` 的 `exports`/`bin` 指向的入口文件存在

---

### Requirement: 版本组合冻结

阶段 0 MUST 验证并冻结以下精确版本于 `package.json` 与 lockfile：`typescript`（7.0.2 起始，冻结通过 Gate 的精确补丁版本）、最低 Node.js 版本、`@types/node`、`@types/proper-lockfile`、`tsx`。实施者 MUST NOT 自行切换到 TypeScript 6；若真实依赖要求提高 `target` 或 Node 版本，MUST 记录证据并同步支持矩阵。用户项目 MUST NOT 安装 TypeScript 开发工具。

#### Scenario: 版本组合记录于阶段报告

- **WHEN** 阶段 0 Gate 执行时
- **THEN** stage-gate-report.md 的 `versions` 字段记录实际 Node、TypeScript、OpenCode 版本，且 lockfile 中上述依赖为冻结的精确版本

---

### Requirement: 脚本语义

根 `package.json` MUST 提供：`typecheck`（`tsc -p tsconfig.json`）、`build`（清理 + `tsc -p tsconfig.build.json` + 资源校验）、`test`（先 typecheck 再由 `tsx --test` 经显式文件发现入口运行 `test/**/*.test.ts`）、`prepack`（干净构建与包内容测试，失败时不生成 tarball）。测试路径枚举 MUST 使用显式 TypeScript 发现入口，不依赖 shell 展开 `**`。

#### Scenario: npm test 运行全部测试

- **WHEN** 在仓库根执行 `npm test`
- **THEN** 先执行 typecheck，随后所有 `test/**/*.test.ts` 被发现并运行（含新 .ts 与迁移前遗留场景），任一失败使整体失败

