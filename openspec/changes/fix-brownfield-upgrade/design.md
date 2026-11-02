## Context

`oso init` 对棕地项目（目标目录已有内容）走 `collectBrownfieldDecisions` → `createInitPlan` → `executeOperations` 三段式。产权判定散落在两处：

- `src/setup/index.ts:316-359`：决定「问不问」，并把答案写进 `InitDecisions`。
- `src/setup/planner.ts:127-181`：决定「写不写」，按 `portablePath` 前缀发 `preserve` 或 `write`。

缺陷来自两处判定都按「路径前缀 + 决策变量」而不是「文件产权」：

1. `planner.ts:131-134` 对 `openspec/` 全前缀发 preserve，**没有 `fs.existsSync(target)` 守卫**。目标 `config.yaml` 存在、答案 n 时，连不存在的 `openspec/schemas/**` 也被 preserve。7/8 的 `openspec schema validate` 必然 `Schema not found`。
2. `index.ts:328-359` 与 `planner.ts:150-175` 把 `.opencode/commands/` 与 `.opencode/skills/` 当用户资产，已存在就询问；默认答案（无 prompt 环境下 `resolveDecision` 返回 `no`）意味着永不覆盖。

约束（来自用户裁决与仓库规范）：

- 只改 ① 类产品资产；②③④ 类语义 MUST NOT 变。
- 不使用 `as any` / `@ts-ignore`；不删除或跳过失败测试。
- base 固定 `release/1.1`（`70d02296`），不碰 `main`。
- 不改 `openspec/schemas/` 与 `openspec/config.yaml` 的 schema 内容语义（T004 范围）。

## Goals / Non-Goals

**Goals:**

- BUG021：目标 `openspec/schemas/superpowers-bridge-opencode/` 为空时，10 个（`lang: en` 过滤后）schema 模板文件必须在答 n 后全部落盘，`config.yaml` 字节不变，7/8 通过、exit 0。
- BUG022：v1.1.1 已安装项目重跑 init 后，10 个变更命令与当前模板逐字一致；输出恰好 10 条「已更新」。
- 保持 ②③④ 类既有语义与既有 305 主套件 + 5 elevated 全绿。
- 让「假 runner 恒成功」这一测试盲区消失：`schema validate` 必须能真实失败。

**Non-Goals:**

- 不引入 manifest 驱动的产权判定（方案 C，见 brainstorm）。
- 不新增删除逻辑：不清理模板中已移除的旧命令（另立变更评估）。
- 不改 `reset` / `verify` / shim 行为。
- 不改 `.opencode/opencode.json` 的 merge 语义、受管根文件 marker 语义、`openspec/changes/**` / `openspec/specs/**` 的永久保护。
- 不调整 `openspec/schemas/` 与 `openspec/config.yaml` 的 schema 内容（T004）。

## Decisions

### D1：产权分类是唯一判据，落地为路径谓词

在 `planner.ts` 内定义四个只读谓词（不导出，避免成为公开 API）：

```ts
const isOpenSpecData = (p: string) => p.startsWith('openspec/changes/') || p.startsWith('openspec/specs/');
const isOpenSpecSchema = (p: string) => p.startsWith('openspec/schemas/');
const isCommand = (p: string) => p.startsWith('.opencode/commands/');
const isSkill = (p: string) => p.startsWith('.opencode/skills/');
const isProductAsset = (p: string) => isOpenSpecSchema(p) || isCommand(p) || isSkill(p);
```

`isOpenSpecSchema` 只匹配 `openspec/schemas/`（模板中只有 `superpowers-bridge-opencode` 一个 schema），不匹配整个 `openspec/`。这样 `config.yaml` 不会被误伤。

**替代方案**：用 `portablePath.startsWith('openspec/') && !portablePath.endsWith('config.yaml')`。放弃原因：负向列表在新增用户配置项（例如未来的 `openspec/local.yaml`）时会静默放大覆盖面；正向白名单（`openspec/schemas/` 才是产品资产）更安全。

### D2：openspec 门禁三分支，保留兜底 existsSync 守卫

在模板循环内，顺序固定为：

1. `brownfield && isOpenSpecData(p)` → `preserve`（④ 类，永远不碰）。
2. `brownfield && p.startsWith('openspec/') && !isOpenSpecSchema(p) && fs.existsSync(target) && decisions.openspec !== 'yes'` → `preserve`（② 类兜底，含 `config.yaml`）。
3. 其余 → `write`（① 类无条件；② 类在目标不存在时也会落到这里，从而修复 BUG021 的「不存在的文件被 preserve」）。

**为什么保留分支 2 的兜底而不是只写 `p === 'openspec/config.yaml'`**：模板当前只有 `config.yaml`，但兜底分支保证「未来任何非 schema 的 `openspec/*` 用户配置」默认受保护，且都带 `existsSync` 守卫——不会重演 BUG021。

**为什么不在分支 2 里再细分 `decisions.openspec` 的来源**：`decisions.openspec` 只由 `config.yaml` 存在与否驱动（见 D3），语义已经收敛。

### D3：openspec 询问条件收窄为「config.yaml 存在」

`index.ts` 中：

```ts
const openspecHasContent = fs.existsSync(path.join(targetDir, 'openspec', 'config.yaml'));
```

删除 `|| hasEntries(path.join(targetDir, 'openspec', 'schemas'))`。

理由：schemas 已属 ① 类无条件刷新，再为它询问是误导——用户答 n 也拦不住。询问文案改为「覆盖 openspec/config.yaml？」，仍含 `openspec` 关键词，不破坏既有断言 `assert.match(prompts[0], /openspec/i)`。

### D4：commands / skills 保留三档开关，只翻转「未设置」时的默认值

**保留** `BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 的全部原功能（用户裁决：保留原来的功能）：

| 设置 | 行为（修改前后一致） |
|---|---|
| `=yes` | 覆盖 |
| `=no` | 保留（preserve） |
| `=ask` | 逐文件询问，`commandFiles` / `skillFiles` 记录每个文件的选择 |
| **未设置** | **修改前：走交互询问，空回答解析为 `no` → 保留（BUG022 根因）；修改后：不询问，默认覆盖** |

`index.ts` 的改动只在于「何时进入决策」：

```ts
const commandOverride = env.BROWN_OVERRIDE_COMMANDS;
if (hasEntries(commandsDir) && commandOverride !== undefined) {
    decisions.commands = await tDecide('BROWN_OVERRIDE_COMMANDS', ..., true);
    if (decisions.commands === 'ask') { /* 逐文件收集，逻辑原样保留 */ }
}
// 未设置 override 时：不设 decisions.commands，planner 视为默认覆盖
```

skills 同理。

`planner.ts` 的改动只在于「什么时候 preserve」：

```ts
const keepCommand = decisions.commands === 'no'
    || (decisions.commands === 'ask'
        && decisions.commandFiles
        && decisions.commandFiles[portablePath] !== 'yes');
if (brownfield && isCommand(portablePath) && fs.existsSync(target) && keepCommand) {
    operations.push({ type: 'preserve', target, decision: 'skip' });
    continue;
}
```

即：`undefined`（未设置）不再被当成 `no`，而是「不 preserve → 落到 write」。

**为什么不保留「未设置时的交互询问」**：那正是 BUG022 的现场——非交互重跑 init 时 `resolveDecision` 无 prompt 直接返回 `no`，命令永远不更新。保留交互询问就等于保留缺陷。用户显式要保护时用 `=no`，能力没有损失。

**`InitDecisions` 的 `commands` / `skills` / `commandFiles` / `skillFiles` 字段全部保留**，语义不变，仅默认值来源改变。

### D5：`BROWN_OVERRIDE_*` 的语义变更只需文档标注，不加运行时警告

因为开关功能完整保留（三档都能用），不存在「设了 `no` 却被静默覆盖」的反转，所以**不需要**废弃提示。只在 `docs/FEATURES.md` 补充「未设置时默认覆盖」这一默认值说明。

（此条是对早期方案「打印废弃说明」的修正——用户明确要求保留原功能，废弃提示的前提已不成立。）

### D6：`changed` 标记与「已更新」输出

`PlanOperation` 增加可选字段 `changed?: boolean`。在模板循环的 write 分支：

```ts
const existing = brownfield && fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
const content = renderedTemplate(source, context.superpowersPath);
operations.push({
    type: 'write',
    target,
    content,
    decision: existing === null ? undefined : 'overwrite',
    changed: existing !== null && existing !== content,
});
```

`index.ts` 的 `reportOperations` 改为（用户裁决：所有被更新的文件都输出）：

- `preserve && decision === 'skip'` → 维持 `- <rel> (skip)`。
- `op.type === 'write' && op.changed` → `p({ type: 'action', text: `${t('已更新：', 'Updated: ')}${rel}` })`，**不区分产权类别**。
- `op.type === 'write' && op.decision === 'overwrite' && !op.changed` → 不输出（内容相同，避免噪声）。
- 其余（新建文件）→ 维持 `p({ type: 'pass', item: rel })`。

**为什么改为全量输出**：用户明确要求「全都打」。产品资产、`config.yaml`（答 y 时）、受管根文件（托管区块内容变化时）都会在内容变化时输出「已更新」。

**验收「恰好 10 条」仍然成立**，因为夹具场景下只有 10 个命令的内容发生变化：

| 文件 | 夹具状态 | 输出 |
|---|---|---|
| 10 个变更命令 | `OLD v1.1.1 ...` ≠ 模板 | 已更新 ×10 |
| 3 个未变更命令 | 与模板逐字相同 | 无 |
| `openspec/config.yaml` | 答 n → preserve | `(skip)` |
| 4 个受管根文件 | 预置为模板渲染结果，区块内容相同 | 无 |
| `openspec/schemas/**` | 目录为空 → 新建 | `✓` ×10 |

**i18n**：标签走 `t('已更新：', 'Updated: ')`。`lang: 'zh-CN'` 时输出全角冒号，与验收表述逐字一致；`en` 时输出 `Updated: `。测试用 `lang: 'zh-CN'` 断言 10 条。

### D7：测试策略

1. **修假 runner**：`initRunner()` 的 `run` 签名改为 `(program, args = [], options = {})`；对 `openspec schema validate`：

   ```ts
   const cwd = options.cwd ?? process.cwd();
   const schemaFile = path.join(cwd, 'openspec', 'schemas', 'superpowers-bridge-opencode', 'schema.yaml');
   return fs.existsSync(schemaFile)
       ? { code: 0, signal: null, stdout: '', stderr: '' }
       : { code: 1, signal: null, stdout: '', stderr: 'Schema not found' };
   ```

   其余分支不变。注意 `openspec --version` 等不带 cwd 的调用仍返回 `1.0.0`。

2. **新增 `seedInstalledProject(t, options)`**：

   - 建棕地目录（`package.json` 触发 brownfield）。
   - 13 个 `opsx-*.md`：对 v1.1.1 → 当前变更的 10 个命令写入 `OLD v1.1.1 <name>` 占位（保证与模板不同、且不依赖 `git` 可用性）；对未变更的 3 个命令写入当前模板渲染结果（保证与模板逐字相同，不产生「已更新」）。这样「恰好 10 条」是确定性断言，而不是依赖 tag 内容与换行行为。
   - `openspec/config.yaml`（固定字节，用于断言不被改）。
   - `.opencode/install-manifest.json`（v1.1.1 风格的 `files` 列表）。
   - 4 个受管根文件的完整 marker（内容与当前模板渲染一致，避免额外「已更新」）。
   - 不 seed `openspec/schemas/`（保持空目录），让 schema 全部走「新建」路径，保证「已更新」计数只为命令贡献。

3. **新增用例**（全部在 `test/setup-brownfield.test.js`）：

   - ① BUG021：config.yaml 存在 + schemas 目录空 → 答 n → 10 个 schema 文件存在、config 字节不变、7/8 通过（`result.success === true`，并断言 progress 事件里出现 7/8 的 pass）。
   - ② 假 runner 反向验证：schema.yaml 被删除后 `openspec schema validate` 返回 1，`initProject` 必须 throw（`schema-validation failed`）。该用例可通过直接调用假 runner 或注入「写后删除」的 runner 实现。
   - ③ BUG022：v1.1.1 夹具 → 未设置 `BROWN_OVERRIDE_COMMANDS` → 10 个命令与模板逐字一致。
   - ④ 输出含恰好 10 条「已更新」（`lang: 'zh-CN'`，统计 `event.text` 前缀）。
   - ⑤ 用户自建命令 `my-custom.md` 不被覆盖、不被删除。
   - ⑥ **保留功能验证**：设 `BROWN_OVERRIDE_COMMANDS=no` → 命令文件字节不变（证明开关仍然有效）。
   - ⑦ **ask 功能验证**：设 `BROWN_OVERRIDE_COMMANDS=ask` + prompt 全答 n → 命令文件字节不变（证明逐文件决策仍然有效）。

4. **改写既有用例**（语义更新，不是删绿）：

   - `test/setup-brownfield.test.js:435` `棕地已有 commands 且答 n 时文件不变` → 改为「未设置 override 时默认覆盖；设 `=no` 时才保留」，两条断言分别覆盖新默认与保留功能。
   - `test/setup-brownfield.test.js:311` `schemas 非空时询问，答 y 时 schema 被覆盖` → 改为「schemas 非空但无 config.yaml 时不询问，schema 被无条件覆盖」。
   - `test/setup-api.test.js:242` `collects per-file command decisions when the brownfield mode is ask` → 改为「未设置 override 时不询问」+ 新增「设 `=ask` 时仍逐文件询问」断言。
   - 视 `test/setup-planner.test.js` 结果决定是否补一条「schemas 无条件 write」断言（预期现有 3 条均不回归）。

## Risks / Trade-offs

- [用户已依赖 `BROWN_OVERRIDE_COMMANDS=no` 保护本地改过的命令] → 显式 `no` 仍然生效（D4 保留功能），不存在静默反转；只有「未设置」这一档从保留改为覆盖。
- [未设置的 CI 会覆盖本地手改命令] → 这正是 BUG022 要的升级行为；需要保护时显式设 `=no`。文档标注默认值变更。
- [「已更新」计数被其他文件污染] → 夹具只让 10 个命令内容变化（`config.yaml` 答 n、根文件预置一致、schemas 目录为空走新建），断言稳定；若未来夹具新增变化文件，测试会先红提醒。
- [读取目标文件做 diff 引入额外 I/O / 编码问题] → 只读文本模板产物（现状已按 utf8 处理），不读二进制；`skills.lock.json` 走 `copy` 分支不参与 diff。
- [schemas 无条件覆盖会冲掉用户手改的 schema] → 这正是 ① 类定义；schema 内容变更的语义由 T004 负责，本变更只保证文件到达。

## Migration Plan

1. 合并后对已安装项目重跑 `oso init`：默认（未设 override）会刷新 schema 与 commands；`config.yaml` 未答 y 时仍保留。
2. 需要保护本地命令的用户：显式设置 `BROWN_OVERRIDE_COMMANDS=no` / `BROWN_OVERRIDE_SKILLS=no`（功能未变）。
3. 回滚：`git revert` 单个 change 提交即可；无数据迁移、无 schema 变更、无持久化状态。
4. 发布说明需写明：`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 三档功能保留，但「未设置」的默认值从「保留」改为「覆盖」。

## Open Questions

无。方案与验收条件已由用户裁决；实现层面的取舍（D1 路径谓词、D4 默认值翻转、D6 全量「已更新」输出）均在此文档给出理由。
