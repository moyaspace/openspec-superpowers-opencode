> Base: release/1.1

## Why

V1 线（`release/1.1`，基线 `c770dbb2f`）是当前要发 1.1.2 的维护线，但它仍带着 6 个已确认缺陷：棕地 `oso init` 会整文件覆盖用户的 `.gitignore` / `AGENTS.md` 等受管根文件（P0 数据丢失）、回答 y 后受管区块未替换且 `{{SUPERPOWERS_BASE_PATH}}` 残留、`openspec/` 不存在仍询问覆盖、npm 12 跳过 `install` 脚本导致垫片静默失效、8/8 自我验证漏掉注册步骤必然二次 init 失败、棕地首次使用根本不部署 commands。这些缺陷已在 `main` 上修复并验证（3299 用例 0 失败），但 `main` 带着 `oso-core` / `resources/` / 事务回滚等 2.0 设施，无法直接发布。因此必须把修复的**语义**回移到 V1 结构上，同时补上 V1 缺失的测试底座与部署后兜底检查，才能安全发布 1.1.2。

## What Changes

**棕地初始化路径统一**

- From: 棕地分支内联询问 + 直接调用 `deployOpenspec` / `deployOcodeJson` / `deployOpencodeDir` / `deployRootFile` 四个写盘函数，无完整 marker 时整文件 `writeFileSync` 覆盖。
- To: 棕地统一走 `collectBrownfieldDecisions` → `createInitPlan` → `executeOperations`，无 marker 时由 `mergeMarker` 追加托管区块；四个直接写盘函数删除。
- Reason: BUG001（数据丢失）/ BUG002（占位符残留）/ BUG003（多余询问）/ BUG006（commands 不部署）四者同一根因——棕地路径绕过了 plan。
- Impact: 非破坏性；棕地项目首次/二次 init 的写盘行为改变，绿地路径不变。

**垫片自检**

- From: `install` 脚本是生成 `openspec` 垫片的唯一途径，npm 12 默认阻断依赖安装脚本后静默失效。
- To: init 在 0/8 之后自检垫片（`isShimScript` + `findOpenspecOrig`），未生效则自动 `installShims`，失败才中止并提示 `oso install-shims`；dry-run 只报告不修复。
- Reason: BUG004（P0 静默失效）。
- Impact: 非破坏性；init 会写全局 bin（一次修复对所有项目生效）。

**8/8 自我验证补注册**

- From: 8/8 只建 change 不写注册表，垫片拦截 `openspec list` 后返回空 → `created verification change is not listed`。
- To: 注册表创建提前到 8/8 之前；8/8 建 change 后 `registry add`；`finally` 中 `registry remove` + 删目录。
- Reason: BUG005（二次 init 必然失败）。
- Impact: 非破坏性；失败路径不再残留 `oso-verify-*` 条目。

**部署后精简验证（GAP002）**

- From: V1 基线完全没有部署后验证。
- To: `initProject` 成功返回前做两项检查——模板中每个 `.md` 命令在 `<targetDir>/.opencode/commands/` 存在；`dist/cli/index.js` 存在且可被动态 import。任一失败打印缺失项并返回 `success: false`（不回滚）。
- Reason: 兜住「命令没部署」「入口加载失败」这类静默问题。
- Impact: 非破坏性；只增加失败可见性，不搬 IMP-1002 的回滚。

**V1 测试底座（GAP001）**

- From: `test/` 根目录无任何 setup 行为用例，`npm test` 只跑既有 `.js` 测试。
- To: 新增 `test/setup-brownfield.test.js`(16) / `setup-shim-check.test.js`(10) / `setup-verify-registry.test.js`(7) / `setup-post-verify.test.js`，全部 `import '../dist/...'`。
- Reason: 让 6 个修复在 V1 上可回归。
- Impact: 非破坏性；只增测试与测试耗时。

## Capabilities

### New Capabilities

- `brownfield-init-safety`: 棕地 init 的写盘安全——受管根文件走 mergeMarker（用户原有行零删除）、占位符必须渲染、仅在目标已有内容时询问 openspec 覆盖、commands 目录缺失时也完整部署。
- `init-shim-selfcheck`: init 的 `openspec` 垫片自检与自动修复（含 dry-run 只报告、无权限时明确中止并给出 `oso install-shims`）。
- `init-self-verification`: init 的 8/8 自我验证——建临时 change 后必须补注册、`openspec list` 可见、结束后注册表与临时目录无残留。
- `deployment-post-verify`: init 结束前的部署后验证——模板命令齐全性 + CLI 入口可动态 import，失败返回失败且不回滚。

### Modified Capabilities

（无。V1 现有 `openspec/specs/` 下四个 capability 均为构建/入口隔离类，本次不改其 REQUIREMENTS。）

## Impact

- **代码**：`src/setup/index.ts`（棕地路径重构、6/8 落盘校验、postVerify）、`src/setup/planner.ts` / `merge.ts`（被 plan 路径复用）、`src/setup/verify.ts`（8/8 注册与 list 断言）。
- **测试**：新增 4 个 `test/setup-*.test.js`（33 + postVerify），改写自 main 的 `.ts` 用例。
- **CLI 行为**：`oso init` 在棕地、npm 12、无权限三种场景的行为改变；新增 postVerify 失败路径。
- **不涉及**：模板内容替换（BUG007/BUG008 → T003）、Superpowers v7（T004）、版本号 bump 与发布（T005）。
- **依赖**：无新增外部依赖；不引入 `supported-versions`、`resources/`、`oso-core`、`opencode-plugin`。
