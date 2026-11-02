# 修复棕地升级（BUG021 / BUG022）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让棕地 `oso init` 按「产权」刷新 OSO 产品资产（commands / skills / openspec schemas），同时保持用户配置、混合文件与用户数据语义不变。

**Architecture:** 把产权判定收敛到 `src/setup/planner.ts` 的路径谓词与三分支门禁；`src/setup/index.ts` 删除 commands / skills 询问、收窄 openspec 询问条件、输出「已更新」；测试侧先修假 runner 与夹具，用 RED→GREEN 驱动。

**Tech Stack:** TypeScript（ESM，`tsc -p tsconfig.build.json`）、Node `node:test` + `node:assert/strict`、OpenSpec CLI、npm scripts。

**Spec:** `openspec/changes/fix-brownfield-upgrade/specs/brownfield-init-safety/spec.md`（设计：`design.md`；决策基线：`brainstorm.md`）

## Global Constraints

- 只改 ① 类产品资产：`.opencode/commands/**`、`.opencode/skills/**`、`openspec/schemas/superpowers-bridge-opencode/**`。
- ② 类（`openspec/config.yaml`、`.opencode/opencode.json`）、③ 类（4 个受管根文件）、④ 类（`openspec/changes/**`、`openspec/specs/**`）语义 MUST NOT 变。
- 不使用 `as any` / `@ts-ignore` / `@ts-expect-error`；不删除、不跳过失败测试。
- 不删除任何用户自建命令；本变更不新增删除逻辑。
- base 固定 `release/1.1`；不碰 `main`。
- 测试前必须 `npm run build`（测试 import `dist/`）。
- 不修改 `openspec/schemas/` 与 `openspec/config.yaml` 的 schema 内容语义（T004 范围）。

## Review Focus

- **`openspec/config.yaml` 答 n 后是否仍字节不变**（② 类不能被 ① 类刷新误伤）→ Task 3 用例断言逐字相等。
- **`openspec/schemas/**` 在目标不存在时是否仍被 preserve**（BUG021 的根因是「不存在的文件被 skip」）→ Task 3 用例断言 10 个文件落盘。
- **`.opencode/commands/` 用户自建文件是否仍在**（覆盖 ≠ 删除）→ Task 2 用例断言 `my-custom.md` 存在且内容不变。
- **「已更新」计数是否被非产品资产污染**（验收要求恰好 10）→ Task 5 用例用 `lang: 'zh-CN'` 统计，Task 6 夹具让未变更命令逐字相同。
- **假 runner 是否真的会失败**（否则 BUG021/BUG003 继续漏网）→ Task 1 反证用例断言删除 `schema.yaml` 后 init 抛 `schema-validation failed`。

---

### Task 1: 修复假 runner，让 7/8 能真实失败

**Files:**
- Modify: `test/setup-brownfield.test.js:35-61`（`initRunner`）
- Test: `test/setup-brownfield.test.js`（新增 1 条用例）

**Interfaces:**
- Consumes: `initProject(options)` from `../dist/setup/index.js`；`ProcessRunner.run(program, args, options?)`，`options.cwd?: string`。
- Produces: `initRunner()` 的 `run(program, args = [], options = {})`；对 `openspec schema validate` 返回 `code 0|1`。

- [ ] **Step 1: 写失败用例**

在 `test/setup-brownfield.test.js` 末尾追加：

```js
test('假 runner：schema.yaml 缺失时 7/8 必须失败（BUG021 反证）', async (t) => {
    const targetDir = seedBrownfield(t);
    const runner = initRunner();
    // 在 schema validate 之前删掉 schema.yaml，模拟 BUG021 的落盘缺失
    const originalRun = runner.run.bind(runner);
    runner.run = (program, args = [], options = {}) => {
        if (program === 'openspec' && args[0] === 'schema') {
            fs.rmSync(path.join(options.cwd, 'openspec/schemas/superpowers-bridge-opencode/schema.yaml'), { force: true });
        }
        return originalRun(program, args, options);
    };

    await assert.rejects(
        () => initProject({
            targetDir, templateDir, superpowersPath: makeSuperpowers(t),
            runner, lang: 'en', shimDeps: ACTIVE_SHIM, env: { ...BROWN_ENV },
        }),
        /schema-validation failed/,
    );
});
```

- [ ] **Step 2: 运行，确认失败（当前假 runner 恒成功）**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: FAIL —— 用例未抛错（`initProject` 返回 success: true）。

- [ ] **Step 3: 实现**

`initRunner()` 改为：

```js
run(program, args = [], options = {}) {
    calls.push({ program, args });
    if (program === 'git') return { code: 0, signal: null, stdout: '', stderr: '' };
    if (program === 'openspec' && args[0] === 'schema') {
        const cwd = options.cwd ?? process.cwd();
        const schemaFile = path.join(cwd, 'openspec', 'schemas', 'superpowers-bridge-opencode', 'schema.yaml');
        return fs.existsSync(schemaFile)
            ? { code: 0, signal: null, stdout: '', stderr: '' }
            : { code: 1, signal: null, stdout: '', stderr: 'Schema not found' };
    }
    if (program === 'openspec' && args[0] === 'templates') { /* 原分支不变 */ }
    if (program === 'openspec' && args[0] === 'new') { /* 原分支不变 */ }
    if (program === 'openspec' && args[0] === 'list') { /* 原分支不变 */ }
    if (program === 'openspec' && args[0] === 'status') { /* 原分支不变 */ }
    return { code: 0, signal: null, stdout: '1.0.0', stderr: '' };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: PASS（含新增反证用例）。

- [ ] **Step 5: 提交**

```bash
git add test/setup-brownfield.test.js
git commit -m "test(setup): make brownfield fake runner fail on missing schema"
```

---

### Task 2: 新增 `seedInstalledProject(t)` 夹具与 4 个 RED 用例

**Files:**
- Test: `test/setup-brownfield.test.js`

**Interfaces:**
- Produces: `seedInstalledProject(t, { superpowersPath, templateDir }) -> { targetDir, configContent, commandNames }`
- Constraint: 10 个变更命令写 `OLD v1.1.1 <name>`；`opsx-explore.md` / `opsx-onboard.md` / `opsx-remove.md` 写当前模板渲染结果。

- [ ] **Step 1: 写夹具 + 4 条失败用例**

夹具要点：

```js
const CHANGED_COMMANDS = [
    'opsx-apply.md', 'opsx-archive.md', 'opsx-bulk-archive.md', 'opsx-continue.md',
    'opsx-ff.md', 'opsx-finish.md', 'opsx-new.md', 'opsx-propose.md',
    'opsx-sync.md', 'opsx-verify.md',
];

function renderTemplate(relative, superpowersPath) {
    const replacement = superpowersPath.endsWith(path.sep) ? superpowersPath : `${superpowersPath}${path.sep}`;
    return fs.readFileSync(path.join(templateDir, ...relative.split('/')), 'utf8')
        .split('{{SUPERPOWERS_BASE_PATH}}').join(replacement);
}

function seedInstalledProject(t, { superpowersPath }) {
    const targetDir = seedBrownfield(t);
    const commandsDir = path.join(targetDir, '.opencode', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    const all = fs.readdirSync(path.join(templateDir, '.opencode', 'commands')).filter(n => n.endsWith('.md'));
    for (const name of all) {
        const content = CHANGED_COMMANDS.includes(name)
            ? `OLD v1.1.1 ${name}\n`
            : renderTemplate(`.opencode/commands/${name}`, superpowersPath);
        fs.writeFileSync(path.join(commandsDir, name), content);
    }
    fs.mkdirSync(path.join(targetDir, 'openspec', 'schemas', 'superpowers-bridge-opencode'), { recursive: true });
    const configContent = 'schema: spec-driven\n# user config, must not change\n';
    fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), configContent);
    fs.writeFileSync(path.join(targetDir, '.opencode', 'install-manifest.json'),
        JSON.stringify({ project: 'openspec-superpowers-opencode', files: [], overwriteDecisions: {} }, null, 2) + '\n');
    // 4 个受管根文件写完整 marker，且托管内容与模板一致，避免额外「已更新」
    for (const [src, dest, marker] of [
        ['_gitignore', '.gitignore', GITIGNORE_MARKER],
        ['_gitattributes', '.gitattributes', '# <!-- openspec-superpowers-opencode_gitattributes -->'],
        ['_editorconfig', '.editorconfig', '# <!-- openspec-superpowers-opencode_editorconfig -->'],
        ['_AGENTS.md', 'AGENTS.md', AGENTS_MARKER],
    ]) {
        fs.writeFileSync(path.join(targetDir, dest), `${marker}\n${renderTemplate(src, superpowersPath)}${marker}\n`);
    }
    return { targetDir, configContent, commandNames: all };
}
```

新增用例（全部使用 `env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined }` 与 `prompt: async () => 'n'`）：

```js
test('BUG021：config.yaml 保留 + schemas 为空 → 10 个 schema 落盘且 7/8 通过', ...);
// 断言：schemaFiles = 递归列出 openspec/schemas/superpowers-bridge-opencode 下文件；length === 10
// 断言：fs.readFileSync(config.yaml,'utf8') === configContent
// 断言：result.success === true；events 中存在 n:7 的 step 且随后有 pass

test('BUG022：v1.1.1 夹具答 n → 10 个命令与模板逐字一致', ...);
// 对 CHANGED_COMMANDS 断言 fs.readFileSync(target) === renderTemplate(...)

test('升级可见性：恰好 10 条「已更新：」', ...);
// lang: 'zh-CN'；events.filter(e => (e.text||'').startsWith('已更新：')).length === 10
// 且不包含 opsx-explore / opsx-onboard / opsx-remove

test('用户自建命令不被覆盖、不被删除', ...);
// 预先写 .opencode/commands/my-custom.md = 'my custom\n'；init 后内容仍为 'my custom\n'
```

- [ ] **Step 2: 运行，确认 4 条都 FAIL**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: BUG021 用例因 schema 文件未落盘失败；BUG022 用例因命令仍为 `OLD ...` 失败；「已更新」用例 0 条失败；自建命令用例应通过（先确认它不是误报）。

- [ ] **Step 3: 提交 RED 证据**

```bash
git add test/setup-brownfield.test.js
git commit -m "test(setup): add installed-project fixture and red upgrade cases"
```

---

### Task 3: 必改点 1 —— BUG021：openspec 门禁按路径细分

**Files:**
- Modify: `src/setup/planner.ts:119-182`（模板循环）

**Interfaces:**
- Produces: 私有谓词 `isOpenSpecData(p)`、`isOpenSpecSchema(p)`、`isCommand(p)`、`isSkill(p)`、`isProductAsset(p)`；`PlanOperation.changed?: boolean`（Task 5 使用）。

- [ ] **Step 1: 实现谓词**

```ts
const isOpenSpecData = (p: string): boolean => p.startsWith('openspec/changes/') || p.startsWith('openspec/specs/');
const isOpenSpecSchema = (p: string): boolean => p.startsWith('openspec/schemas/');
const isCommand = (p: string): boolean => p.startsWith('.opencode/commands/');
const isSkill = (p: string): boolean => p.startsWith('.opencode/skills/');
const isProductAsset = (p: string): boolean => isOpenSpecSchema(p) || isCommand(p) || isSkill(p);
```

- [ ] **Step 2: 替换 openspec 门禁**

把 `planner.ts:131-134` 改为：

```ts
if (brownfield && isOpenSpecData(portablePath)) {
    operations.push({ type: 'preserve', target, decision: 'skip' });
    continue;
}
if (
    brownfield
    && portablePath.startsWith('openspec/')
    && !isOpenSpecSchema(portablePath)
    && fs.existsSync(target)
    && decisions.openspec !== 'yes'
) {
    operations.push({ type: 'preserve', target, decision: 'skip' });
    continue;
}
```

- [ ] **Step 3: 运行 BUG021 用例**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: BUG021 用例 PASS；其余 3 条新用例仍 RED（Task 4/5 未做）。

- [ ] **Step 4: 提交**

```bash
git add src/setup/planner.ts
git commit -m "fix(setup): stop preserving missing openspec product assets (BUG021)"
```

---

### Task 4: 必改点 2 —— BUG022：commands / skills 改为产品资产

**Files:**
- Modify: `src/setup/index.ts:316-359`（`collectBrownfieldDecisions`）
- Modify: `src/setup/planner.ts:150-175`（删除 commands / skills preserve 门禁）

**Interfaces:**
- Consumes: Task 3 的谓词。
- Produces: `collectBrownfieldDecisions` 不再设置 `decisions.commands` / `decisions.skills` / `commandFiles` / `skillFiles`；`planner` 不再读取它们。

- [ ] **Step 1: 删除 planner 的 commands / skills 门禁**

删除 `planner.ts:150-175` 两个 `if` 块（保留到 write 分支的落点）。

- [ ] **Step 2: 删除 index.ts 的询问与逐文件决策**

删除 `index.ts:328-359` 两个 `if (hasEntries(...))` 块。在 `collectBrownfieldDecisions` 内、`openspecHasContent` 附近加入弃用提示：

```ts
if (env.BROWN_OVERRIDE_COMMANDS || env.BROWN_OVERRIDE_SKILLS) {
    p({
        type: 'warn',
        item: t(
            'BROWN_OVERRIDE_COMMANDS / BROWN_OVERRIDE_SKILLS 已废弃并被忽略：commands 与 skills 属于产品资产，始终随版本覆盖',
            'BROWN_OVERRIDE_COMMANDS / BROWN_OVERRIDE_SKILLS is deprecated and ignored: commands and skills are product assets and always refreshed',
        ),
    });
}
```

- [ ] **Step 3: 收窄 openspec 询问条件**

`index.ts:316-317` 改为：

```ts
const openspecHasContent = fs.existsSync(path.join(targetDir, 'openspec', 'config.yaml'));
```

并把询问文案改为「覆盖 openspec/config.yaml？」/「Overwrite openspec/config.yaml?」。

- [ ] **Step 4: 运行**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: BUG022 用例 PASS；自建命令用例 PASS；「已更新」用例仍 RED。

- [ ] **Step 5: 提交**

```bash
git add src/setup/index.ts src/setup/planner.ts
git commit -m "fix(setup): treat commands and skills as product assets (BUG022)"
```

---

### Task 5: 必改点 3 —— `changed` 标记与「已更新」输出

**Files:**
- Modify: `src/setup/planner.ts`（`PlanOperation`、write 分支）
- Modify: `src/setup/index.ts`（`reportOperations`）

**Interfaces:**
- Consumes: Task 3 的 `isProductAsset` 谓词（`index.ts` 内另写一份同构私有函数）。
- Produces: `PlanOperation.changed?: boolean`；输出事件 `{ type: 'action', text: '已更新：<rel>' | 'Updated: <rel>' }`。

- [ ] **Step 1: 加字段**

`PlanOperation` 增加 `changed?: boolean;`。

- [ ] **Step 2: write 分支计算 changed**

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

- [ ] **Step 3: reportOperations 输出「已更新」**

```ts
const isProductAssetRel = (rel: string): boolean =>
    rel.startsWith('.opencode/commands/')
    || rel.startsWith('.opencode/skills/')
    || rel.startsWith('openspec/schemas/');

// 在既有 preserve-skip 分支之后：
if (isProductAssetRel(rel) && op.changed) {
    p({ type: 'action', text: `${t('已更新：', 'Updated: ')}${rel}` });
    continue;
}
if (isProductAssetRel(rel) && op.decision === 'overwrite') continue; // 内容相同，不刷屏
p({ type: 'pass', item: rel });
```

- [ ] **Step 4: 运行**

Run: `npm run build; node --test test/setup-brownfield.test.js`
Expected: 「已更新」用例 PASS（恰好 10 条）；全部棕地用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/setup/planner.ts src/setup/index.ts
git commit -m "feat(setup): report refreshed product assets during brownfield init"
```

---

### Task 6: 修正 3 条旧语义测试

**Files:**
- Modify: `test/setup-brownfield.test.js:311`、`:435`
- Modify: `test/setup-api.test.js:242`

**Interfaces:**
- Consumes: Task 4 之后的新语义。

- [ ] **Step 1: 改写 `schemas 非空时询问` 用例**

新断言：`prompts.length === 0`；`fs.readFileSync(schema.yaml) !== 'stale: true\n'`（被无条件覆盖）。

- [ ] **Step 2: 改写 `已有 commands 且答 n 时文件不变` 用例**

新断言：`fs.readFileSync(opsx-ff.md) === renderTemplate('.opencode/commands/opsx-ff.md', superpowersPath)`，即已被覆盖；`BROWN_OVERRIDE_COMMANDS: 'no'` 不改变结果。

- [ ] **Step 3: 改写 `collects per-file command decisions` 用例**

新断言：`prompts.length === 0`；`operation.type === 'write'`；`BROWN_OVERRIDE_COMMANDS: 'ask'` 不再触发逐文件询问。

- [ ] **Step 4: 运行相关文件**

Run: `npm run build; node --test test/setup-brownfield.test.js test/setup-api.test.js test/setup-planner.test.js`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add test/setup-brownfield.test.js test/setup-api.test.js
git commit -m "test(setup): align brownfield tests with product-asset semantics"
```

---

### Task 7: 文档同步与全量验收

**Files:**
- Modify: `docs/FEATURES.md:138-139`
- Verify: `openspec/changes/fix-brownfield-upgrade/verify.md`（由 `/opsx-verify` 生成）

- [ ] **Step 1: 更新 FEATURES.md**

两行改为「已废弃并被忽略：commands / skills 属产品资产，始终随版本覆盖」。

- [ ] **Step 2: 全量回归**

Run: `npm test`
Expected: typecheck + build + 全局 bin 守卫 + 主套件 + elevated 全绿（记录实际用例数）。

- [ ] **Step 3: 单独复跑关键命令**

```bash
npm run typecheck
npm run build
node --test test/setup-brownfield.test.js test/setup-api.test.js test/setup-planner.test.js
```

- [ ] **Step 4: 逐条记录验收证据**

在提交说明或 `verify.md` 中逐项引用 BUG021 / BUG022 的 5 条关闭条件与 3 条回归项，附命令与关键输出。

- [ ] **Step 5: 提交**

```bash
git add docs/FEATURES.md
git commit -m "docs: mark BROWN_OVERRIDE_COMMANDS/SKILLS as ignored"
```
