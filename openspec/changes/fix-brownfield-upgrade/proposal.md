## Why

棕地 `oso init` 升级路径以「文件存不存在」而不是「文件归谁所有」决定是否写入，导致两个生产缺陷：BUG021，目标已有 `openspec/config.yaml` 且 `openspec/schemas/` 为空时，全部 `openspec/` 前缀被 preserve，schema 模板永不落盘，7/8 `openspec schema validate` 报 `Schema not found` 并 exit 1；BUG022，`.opencode/commands/` 已存在时走询问分支，用户维持默认后 v1.1.1 → v1.1.2 的 10 个命令改动送不到。二者都会让老项目无法升级到新版本，必须按产权分类修复。

## What Changes

**BUG021：openspec/ 产品资产补 existsSync 守卫并按路径细分**

- From: `openspec/` 前缀在棕地一律 preserve（不看目标是否存在），`openspec/schemas/**` 与 `openspec/config.yaml` 共用同一门禁。
- To: `openspec/changes/**` / `openspec/specs/**` 永久 preserve；`openspec/schemas/**`（产品资产）无条件 write；其余 `openspec/*`（含 `config.yaml`）仅当目标存在时才走「询问 + 答 n 保留」。
- Reason: schema 模板必须能补齐，否则 7/8 永远失败。
- Impact: 非破坏；老项目首次补齐 schema，已有 `config.yaml` 仍受保护。

**BUG022：.opencode/commands/ 与 .opencode/skills/ 改为产品资产**

- From: `.opencode/commands/` / `.opencode/skills/` 已存在时询问，支持 `BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 的 yes/no 与逐文件 `ask` 决策。
- To: 二者按产品资产无条件覆盖 / 新建，不再询问；`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 保留解析但只打印一行废弃说明。
- Reason: 产品命令与 schema 模板属于 OSO 资产，升级时必须送达。
- Impact: 行为变更（用户此前的 `no` 不再生效）；用户自建命令不受影响，因为本变更从不删除文件。

**升级可见性：输出列出被更新的产品资产**

- From: 覆盖已有文件时与新建一样输出 `✓ <path>`，无法区分「新装」与「升级」。
- To: 产品资产目标已存在且内容与渲染结果不同时输出「已更新：<相对路径>」；内容相同不输出；新建仍输出 `✓ <path>`。
- Reason: 升级需要可审计，用户要知道哪些文件被替换。
- Impact: 非破坏；只影响输出。

**测试基线：修复假 runner 并补棕地升级夹具**

- From: `test/setup-brownfield.test.js` 的 `initRunner()` 对 `schema validate` 恒返回 0，7/8 在全部棕地用例中永远不会失败；缺少「已安装旧版本」夹具。
- To: `schema validate` 真实检查 `openspec/schemas/superpowers-bridge-opencode/schema.yaml` 是否存在；新增 `seedInstalledProject(t)` 与 4 个升级用例；改写 3 个建立在旧语义上的既有用例。
- Reason: 不修 runner 则 BUG021/BUG003 永远测不出；不补夹具则 BUG022 无法回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `brownfield-init-safety`: 修改「openspec 询问条件」与「已有 commands 答 n 不变」两条需求，新增「产品资产无条件刷新」与「升级可见性输出」两条需求；受管根文件、用户数据保护的既有需求保持不变。

## Impact

- 代码：`src/setup/planner.ts`（路径分类、`changed` 标记）、`src/setup/index.ts`（删除 commands / skills 询问、openspec 询问条件收窄、输出「已更新」、弃用环境变量提示）。
- 测试：`test/setup-brownfield.test.js`（假 runner + 新夹具 + 4 个新用例 + 2 个旧用例改写）、`test/setup-api.test.js`（per-file ask 用例改写）、`test/setup-planner.test.js`（如路径分类影响既有断言则同步）。
- 文档：`docs/FEATURES.md` 的 `BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 行需标注为忽略。
- 不受影响：`openspec/config.yaml` 的询问语义、`.opencode/opencode.json` 的 merge、受管根文件 marker 合并、`openspec/changes/**` 与 `openspec/specs/**` 的永久保护；`openspec/schemas/` 与 `openspec/config.yaml` 的 schema 内容语义（属 T004）。
- 依赖与 API：无新增依赖，无公开 API 变更。
