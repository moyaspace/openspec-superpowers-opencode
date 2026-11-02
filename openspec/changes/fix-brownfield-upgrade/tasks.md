## 1. 测试基座（必改点 4：先让测试能测出缺陷）

- [ ] 1.1 在 worktree 执行 `npm run build`，确认改动前基线可编译、`dist/` 存在
- [ ] 1.2 修改 `test/setup-brownfield.test.js` 的 `initRunner()`：`run` 签名接收 `options`；`openspec schema validate` 真实检查 `path.join(options.cwd, 'openspec/schemas/superpowers-bridge-opencode/schema.yaml')` 是否存在，缺失返回 `{ code: 1, stderr: 'Schema not found' }`
- [ ] 1.3 新增「假 runner 反证」用例：schema.yaml 缺失时 `initProject` 必须抛出含 `schema-validation failed` 的错误，证明 7/8 不再恒成功（BUG021 关闭条件 2）
- [ ] 1.4 在 `test/setup-brownfield.test.js` 新增 `seedInstalledProject(t)`：写入 v1.1.1 的 13 个 `opsx-*.md`（`git show v1.1.1:template/.opencode/commands/<name>`，失败回退 `OLD v1.1.1 <name>`）、`openspec/config.yaml` 固定字节、`.opencode/install-manifest.json`、4 个受管根文件的完整 marker；不 seed `openspec/schemas/`
- [ ] 1.5 新增用例「BUG021：config.yaml 存在 + schemas 为空 + 答 n → 10 个 schema 文件落盘、config 字节不变、7/8 通过」（对应 BUG021 关闭条件 1）
- [ ] 1.6 新增用例「BUG022：v1.1.1 夹具 + 答 n → 10 个命令与模板逐字一致」（对应 BUG022 关闭条件 3）
- [ ] 1.7 新增用例「升级可见性：v1.1.1 夹具 + `lang: 'zh-CN'` → 恰好 10 条「已更新：」」——在修复前应因 0 条而 RED
- [ ] 1.8 新增用例「用户自建命令 `my-custom.md` 不被覆盖、不被删除」
- [ ] 1.9 新增用例「保留功能：`BROWN_OVERRIDE_COMMANDS=no` → 命令文件字节不变」
- [ ] 1.10 新增用例「ask 功能：`BROWN_OVERRIDE_COMMANDS=ask` + 全部答 n → 命令文件字节不变」
- [ ] 1.11 运行 `node --test test/setup-brownfield.test.js`，记录新增用例在修复前的 RED 输出（作为 TDD 证据）

## 2. 必改点 1：BUG021 —— openspec 产品资产补 existsSync 守卫并按路径细分

- [ ] 2.1 在 `src/setup/planner.ts` 增加只读谓词 `isOpenSpecData` / `isOpenSpecSchema` / `isCommand` / `isSkill` / `isProductAsset`（不导出）
- [ ] 2.2 将 `planner.ts:131-134` 的 openspec 门禁替换为三分支：① `openspec/changes/**` 与 `openspec/specs/**` 永久 preserve；② `openspec/*` 中非 `openspec/schemas/` 且 `fs.existsSync(target)` 且 `decisions.openspec !== 'yes'` 才 preserve；③ 其余走 write
- [ ] 2.3 确认 `openspec/schemas/superpowers-bridge-opencode/**` 落入 write 分支，不再受 `decisions.openspec` 影响
- [ ] 2.4 确认 `openspec/config.yaml` 仍受「存在才询问、答 n 保留」保护，且目标不存在时会被写入（BUG021 根因消除）
- [ ] 2.5 运行 `node --test test/setup-brownfield.test.js`，确认 1.5 用例转 GREEN

## 3. 必改点 2：BUG022 —— commands / skills 默认刷新，保留三档开关

- [ ] 3.1 `src/setup/index.ts` 的 commands 分支：保留 `BROWN_OVERRIDE_COMMANDS` 的 yes/no/ask 解析与 `commandFiles` 逐文件收集逻辑，仅将入口条件改为「`hasEntries(commands)` 且 `env.BROWN_OVERRIDE_COMMANDS !== undefined`」——未设置时不进入决策，`decisions.commands` 保持 `undefined`
- [ ] 3.2 `src/setup/index.ts` 的 skills 分支：同上，入口条件改为「`hasEntries(skills)` 且 `env.BROWN_OVERRIDE_SKILLS !== undefined`」
- [ ] 3.3 `src/setup/planner.ts:150-175`：把 preserve 条件从「`decisions.commands !== 'yes'`」改为「`decisions.commands === 'no'` 或（`=== 'ask'` 且该文件未答 yes）」，使 `undefined` 落到 write
- [ ] 3.4 确认 `BROWN_OVERRIDE_COMMANDS=no` 仍能保留文件、`=yes` 仍覆盖、`=ask` 仍逐文件询问（功能零损失）
- [ ] 3.5 `src/setup/index.ts:316-317`：`openspecHasContent` 收窄为仅 `fs.existsSync(openspec/config.yaml)`，移除 `hasEntries(openspec/schemas)`
- [ ] 3.6 将 openspec 询问文案改为「覆盖 openspec/config.yaml？」，保留 `openspec` 关键词以兼容既有断言
- [ ] 3.7 运行 `node --test test/setup-brownfield.test.js test/setup-api.test.js`，确认 1.6 / 1.10 / 1.11 用例转 GREEN

## 4. 必改点 3：升级可见性 —— 输出列出所有被更新的文件

- [ ] 4.1 `src/setup/planner.ts` 的 `PlanOperation` 增加可选字段 `changed?: boolean`
- [ ] 4.2 `planner.ts` 模板 write 分支：读取目标现状，计算 `existing !== null && existing !== content` 写入 `changed`，`decision` 仅在文件已存在时为 `overwrite`
- [ ] 4.3 `src/setup/index.ts` 的 `reportOperations`：`op.type === 'write' && op.changed` 时输出 `t('已更新：', 'Updated: ') + rel`（不区分产权）；已存在但内容相同不输出；新建维持 `✓ rel`
- [ ] 4.4 确认夹具场景下仅 10 个命令贡献「已更新」行（`config.yaml` 答 n 走 preserve、受管根文件内容一致、schemas 走新建）
- [ ] 4.5 运行 `node --test test/setup-brownfield.test.js`，确认 1.7 用例转 GREEN

## 5. 修正建立在旧语义上的既有测试（语义更新，不删绿）

- [ ] 5.1 `test/setup-brownfield.test.js:435`「棕地已有 commands 且答 n 时文件不变」→ 改写为两条断言：未设置开关时命令被覆盖；设置 `=no` 时文件不变
- [ ] 5.2 `test/setup-brownfield.test.js:311`「schemas 非空时询问，答 y 时 schema 被覆盖」→ 改写为「schemas 非空但无 config.yaml 时不询问，schema 被无条件覆盖」
- [ ] 5.3 `test/setup-api.test.js:242`「collects per-file command decisions when the brownfield mode is ask」→ 改写为「未设置开关时不询问」+「设置 `=ask` 时仍逐文件询问」
- [ ] 5.4 运行 `node --test test/setup-planner.test.js`，确认 3 条既有断言不回归；如断言 `commands: 'no'` 影响结果则同步为新语义
- [ ] 5.5 全局搜索确认 `decisions.commands` / `decisions.skills` 仍被 planner 读取（保留功能），且默认 `undefined` 时落到 write

## 6. 文档同步

- [ ] 6.1 `docs/FEATURES.md` 的 `BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 两行补充说明：三档功能保留，未设置时默认覆盖
- [ ] 6.2 检查 `docs/DEPLOYMENT.md` 与 `README.md` 是否描述旧的 commands 询问行为，如有则同步

## 7. 验收（逐项记录命令、输出与结论）

- [ ] 7.1 BUG021 关闭条件 1：目标含 `openspec/config.yaml`、schemas 目录为空 → 答 n → 10 个 schema 文件全落盘、`config.yaml` 字节不变、7/8 通过、exit 0
- [ ] 7.2 BUG021 关闭条件 2：假 runner 已能真实反映 schema 缺失（删除 `schema.yaml` 后断言 7/8 失败）
- [ ] 7.3 BUG022 关闭条件 3：v1.1.1 全套夹具 → 未设置开关 → 10 个命令与模板逐字一致
- [ ] 7.4 BUG022 关闭条件 4：输出列出被更新文件（恰好 10 条「已更新：」）
- [ ] 7.5 BUG022 关闭条件 5：用户自建命令不被覆盖、不被删除
- [ ] 7.6 保留功能：`BROWN_OVERRIDE_COMMANDS=no` 保护文件；`=ask` 逐文件询问
- [ ] 7.7 回归：`npm test` 全绿（既有主套件 + elevated 套件；记录实际用例数）
- [ ] 7.8 回归：`openspec/config.yaml` / `openspec/changes/**` / `openspec/specs/**` 的保护语义不回归（由既有用例覆盖，记录用例名）
- [ ] 7.9 回归：`npm run typecheck` 与 `npm run build` 通过
- [ ] 7.10 在 `verify.md` 中逐条引用 BUG021 / BUG022 记录结论
