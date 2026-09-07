# 测试指南（testing.md）

> 本文档是 OSO 测试体系的单一事实来源：怎么跑、分几层、改了什么代码跑什么、写测试遵循什么约定。人类与 AI agent 共同使用（AGENTS.md「项目文档参考」链接本文档）。
>
> 原则：**测试即规范**——行为基线固化在 `test/` 的自动化用例中，Gate 必须能通过仓库命令重新执行；人工步骤书不维护，真实终端链路的人工检查用清单管理（见 §5）。

## 1. 命令速查

| 命令 | 权限 | 耗时 | 覆盖 |
|---|---|---|---|
| `npm test` | 普通用户（首次弹一次 UAC，`gsudo cache on` 可缓存） | ~5 分钟（含构建与 E2E） | typecheck + build + **199 主套件 + elevated 套件**（shim 端到端 3 + 真实 CLI 集成 3 + 生命周期 4），一遍全绿（标准 Gate） |
| `node --test "test/*.test.js"` | 普通用户 | ~3.5 分钟 | 仅 199 主套件（跳过 elevated） |
| `node --test test/<file>.test.js` | 普通用户 | 秒级 | 单文件（改哪跑哪，见 §3） |
| 宿主探针（见 §2 探针层） | 普通用户 | 1-2 分钟 + 模型调用 | 宿主兼容性（仅版本组合变化时） |

前提：Node >= 22.9（冻结 engines）；host-probe 另需本机 `opencode` CLI + 可用模型。

## 2. 测试分层矩阵

| 层 | 位置 | 验证什么 | 外部依赖 | 何时跑 |
|---|---|---|---|---|
| **自动化单测**（199 主套件） | `test/*.test.js`（node:test，import dist 产物） | 全部模块行为基线 + CommonJS 禁用扫描 + tarball 行为等价 | 无（临时目录夹具） | 每次 `npm test` |
| **E2E 端到端**（10 用例，提权套件） | `test/elevated/`（npm test 尾声经 gsudo 自动提权；npm pack→install -g→init 真实链路） | shim 全链路拦截（3）、真实 openspec CLI 集成（3）、全生命周期串联（4） | 真实全局 shim 环境、openspec CLI | 每次 `npm test`（同一遍）；无 gsudo 时 SKIPPED |
| **宿主探针**（test/host-probe/） | `test/host-probe/test/`（npm pack + 真实 opencode run） | 真实 tarball 双入口隔离、真实 OpenCode 加载/Hook/工具链路 | npm registry、opencode CLI、模型 API | **仅版本组合变化时**（换 opencode 或 @opencode-ai/plugin 版本必跑）；运行方法见 §5 本地文档 |

## 3. 「改 X 跑 Y」映射

| 改动目标 | 必跑 | 顺带建议 |
|---|---|---|
| `src/setup/planner.ts` | `node --test test/setup-planner.test.js test/setup-api.test.js` | `npm test` |
| `src/setup/deploy.ts` | `node --test test/setup-deploy.test.js` | 含 symlink 防护用例（普通权限可跑） |
| `src/setup/reset.ts` | `node --test test/setup-reset.test.js` | |
| `src/setup/manifest.ts` / `merge.ts` | `node --test test/setup-manifest.test.js test/setup-opencode-json.test.js` | manifest 路径安全用例在其中 |
| `src/setup/marker*`（合并语义） | `node --test test/setup-marker.test.js test/setup-template-invariants.test.js` | |
| `src/setup/prompt.ts` / `context.ts` / `cli-adapter.ts` | `node --test test/setup-prompt.test.js test/setup-context.test.js test/setup-cli-adapter.test.js` | |
| `src/setup/discovery.ts` | `node --test test/setup-discovery.test.js` | skills.lock 哈希告警逻辑 |
| `src/registry.ts` / `registry-utils.ts` | `node --test test/registry.test.js test/registry-utils.test.js` | 57 用例 |
| `src/verify.ts` | `node --test test/verify.test.js` | 37 用例 |
| `src/shims-installer.ts` | `node --test test/shims-installer.test.js test/elevated/shims-installer.elevated.test.js test/openspec-shim-e2e.test.js` | shim 变更后 elevated 套件由 `npm test` 自动覆盖 |
| `src/cli/index.ts` / `cli/create-project.ts` | `node --test test/cli.test.js test/create-project.behavior.test.js` | |
| `package.json`（files/exports/bin/engines） | `node --test test/setup-package.test.js test/no-cjs.test.js test/imp16-tarball-equivalence.test.js` | 发布相关，建议全量 |
| 任何 `src/**`（收尾） | `npm test` | 提交前标准动作 |
| 换 opencode / @opencode-ai/plugin 版本 | host-probe 全跑（见 §2） | 换版本必过探针 |

## 4. 编写约定

- **框架与形态**：node:test + node:assert/strict；测试文件 `test/<模块>.test.js`，行为测试以 `<模块>.behavior.test.js` 命名；ESM——测试直接 `import` `dist/` 编译产物（先 build 再 test，`npm test` 已保证顺序）。
- **夹具**：一律临时目录（`mkdtempSync` + try/finally 清理）；不写入仓库工作区、不依赖固定路径；预期值从代码/模板提取，不硬编码 hash 与绝对路径。
- **提权边界（全仓库唯一）**：`test/elevated/shims-installer.elevated.test.js`（symlink 夹具用例）需要管理员权限——`npm test` 通过 `test/elevated/run.mjs` 自动经 gsudo 提权运行它（Windows 建链为特权操作；产品代码在 Windows 不走 symlink 分支，与此用例无关）。无 gsudo 时该用例打印 SKIPPED、其余照常。Unix/CI 无需提权直接可跑。
- **红线**：`test/no-cjs.test.js` 固化扫描——`dist/` 禁止 require/module.exports/`__dirname`；新业务代码不得引入 CommonJS。
- **安全防护用例不可删**：`setup-deploy`/`setup-reset` 的 symlink 穿越、路径逃逸拒绝用例是安全基线。
- **失败纪律**：不得删除失败测试求绿；先判断是环境问题（如 EPERM→gsudo）还是回归。

## 5. 指针区

长期参考文档（本地私有，`local/docs/`，不进 GitHub，随 local 私有 Git 版本化）：

| 主题 | 文件 |
|---|---|
| test/host-probe/ 结构、触发矩阵、plugin 版本切换操作序 | `local/docs/2026-09-06-host-probe-usage-guide.md` |
| 运行时模型与宿主环境坑（Bun panic、TEMP 短名、BatBadBut） | `local/docs/2026-09-06-node-opencode-plugin-runtime-model.md` |

本地运行记录：`test-runs/YYYY-MM-DD.md`（不进 Git，仅供本机排查）。
