# retire-install-hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 退役 npm `install` 钩子并把 `dist/` 移出 git，同时让 `oso init` 在垫片失败时继续完成、让垫片写入原子化，并统一 CLI 帮助/报错为 `oso`、删除 V2 迁移遗留测试且迁移其独有断言。

**Architecture:** 构建只发生在源目录（`prepare`），发布产物由 `npm pack` 前现编；垫片安装的唯一生效路径是 `oso init` 的 `ensureShim` 与 `oso install-shims`；垫片失败从「中止 init」改为「warn + 跳过 + 结尾 banner」；垫片写入用同目录临时文件 + rename 原子替换；CLI 只改输出字符串，标识符与长命令解析路径不动。

**Tech Stack:** Node.js 22+、TypeScript 7、Node 内置测试 runner（`node --test`）、GitHub Actions（ubuntu/windows/macos）。

**Spec:** `openspec/changes/retire-install-hook/specs/`；设计见同目录 `design.md`，决策基线见 `brainstorm.md`。

## Global Constraints

- base 分支固定 `release/1.1`；MUST NOT 触碰 `main`。
- MUST NOT 改 `package.json` 的 `version`；MUST NOT 写 `CHANGELOG.md`。
- MUST NOT 删除 `src/shims-installer.ts`、`src/setup/shim-check.ts` 的 `ensureShim`、`src/setup/index.ts` 的垫片自检。
- MUST NOT 从 `package.json` 的 `files` 移除 `"dist/"`；MUST NOT 把构建放进 `install` / `postinstall`。
- MUST NOT 用 `as any` / `@ts-ignore` / 删除或跳过失败测试。
- MUST NOT 改 `src/setup/manifest.ts:108` 的 `project` 值、`src/setup/planner.ts:15-18` 的四个 marker、`src/setup/reset.ts:88-89` 的项目名校验。
- MUST NOT 改 `openspec-superpowers-opencode` 长命令的解析路径。
- MUST NOT 删除 `scripts/run-tests.mjs` 的 `restoreGlobalShim()`。
- 只删 `test/imp16-tarball-equivalence.test.js`；其他可疑 V2 遗留测试只记 GAP。
- 主套件计数预期 318 → 317；若减少更多视为静默少收集。

## Review Focus

1. **npm 12 从 tarball 安装**：包不得出现 `install scripts blocked`，且安装后 `dist/cli/index.js` 存在。
2. **干净 clone 的 `npm ci`**：`prepare` 必须先于使用构建出 `dist/`，否则 CLI/测试全部失败。
3. **无写权限的 binDir**：`oso init` 不中止、走完 8/8、exit 0，提示含真实 `binDir` 与可照抄命令。
4. **写入失败/中断**：原 `openspec` 文件不得消失，目录不得残留 `openspec.tmp-*`。
5. **`--help` 的副作用**：`oso install-shims --help` 不得安装垫片；隔离 bin 目录前后一致。

---

### Task 1: 删除安装生命周期脚本并改用 prepare

**Files:**
- Modify: `package.json`
- Delete: `scripts/shims-installer.mjs`
- Test: `test/package-lifecycle.test.js`（新建）

**Interfaces:**
- Consumes: 无。
- Produces: `package.json.scripts` 只含 `test` / `typecheck` / `build` / `prepare`；仓库不再有 `scripts/shims-installer.mjs`。

- [ ] **Step 1: 写失败测试**

在 `test/package-lifecycle.test.js` 新建：

```js
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('package lifecycle', () => {
  test('no preinstall/install/postinstall scripts', () => {
    for (const key of ['preinstall', 'install', 'postinstall']) {
      assert.equal(key in (pkg.scripts ?? {}), false, `scripts.${key} must not exist`);
    }
  });

  test('prepare carries the build', () => {
    assert.equal(pkg.scripts?.prepare, 'npm run build');
  });

  test('legacy install hook script is deleted', () => {
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'shims-installer.mjs')), false);
  });

  test('tarball file list still includes dist/', () => {
    assert.ok((pkg.files ?? []).includes('dist/'));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/package-lifecycle.test.js`
Expected: FAIL —— `scripts.install must not exist` 与 `scripts.prepare` 断言失败。

- [ ] **Step 3: 改 `package.json`**

删除 `"install": "node scripts/shims-installer.mjs install"`，增加 `"prepare": "npm run build"`。保留 `files` 中的 `"dist/"`、`bin`、`version` 不动。

- [ ] **Step 4: 删除 `scripts/shims-installer.mjs`**

Run: `git rm scripts/shims-installer.mjs`

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/package-lifecycle.test.js`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add package.json test/package-lifecycle.test.js
git commit -m "build: retire npm install hook, build via prepare"
```

---

### Task 2: 把 dist/ 移出 git

**Files:**
- Modify: `.gitignore`
- Untrack: `dist/`（保留磁盘文件）
- Test: `test/package-lifecycle.test.js`

**Interfaces:**
- Consumes: Task 1 的 `prepare`。
- Produces: `git ls-files dist` 为空；`npm run build` 后 `dist/cli/index.js` 存在。

- [ ] **Step 1: 写失败测试**

在 `test/package-lifecycle.test.js` 增加：

```js
import child_process from 'node:child_process';

test('dist/ is ignored and untracked', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^dist\/$/m);
  const tracked = child_process.execFileSync('git', ['ls-files', 'dist'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, '');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/package-lifecycle.test.js`
Expected: FAIL —— `.gitignore` 不含 `dist/`，且 `git ls-files dist` 非空。

- [ ] **Step 3: 改 `.gitignore`**

在手工维护区（`node_modules/` 附近）增加一行 `dist/`。

- [ ] **Step 4: 取消跟踪（保留磁盘文件）**

Run: `git rm -r --cached dist`
Expected: `git status` 显示约 80 个 `D  dist/...`；`dist/cli/index.js` 仍在磁盘上。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/package-lifecycle.test.js`
Expected: PASS。

- [ ] **Step 6: 验证 prepare 能重建**

Run: `npm run build`
Expected: exit 0；`dist/cli/index.js` 存在；`git status` 不出现新的被跟踪改动。

- [ ] **Step 7: 提交（message 写明未删除源码）**

```bash
git add .gitignore test/package-lifecycle.test.js
git commit -m "build: untrack dist/ (files kept, rebuilt by prepare before pack)"
```

---

### Task 3: CI 守卫与 tarball 断言迁移

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 2 的 `dist/` 取消跟踪。
- Produces: `Guard tracked build artifacts` 步骤；`Verify tarball contents` 新增三条断言。

- [ ] **Step 1: 在 `Run tests` 之后、`npm pack` 之前插入守卫步骤**

```yaml
      - name: Guard tracked build artifacts
        shell: bash
        run: |
          tracked=$(git ls-files dist | wc -l)
          [ "$tracked" -eq 0 ] || { echo "FAIL: dist/ is tracked by git ($tracked files)"; exit 1; }

          dirty=$(git status --porcelain)
          [ -z "$dirty" ] || { echo "FAIL: working tree dirty after build:"; echo "$dirty"; exit 1; }
```

- [ ] **Step 2: 在 `Verify tarball contents` 的 `tar -tzf "$PACKAGE" > /tmp/tarlist.txt` 之后加入迁移断言**

```bash
          tar -xzf "$PACKAGE" -O package/assets/shims/openspec.ps1 | grep -q 'Join-Path \$TOOL_DIR "lib"' \
            && { echo "FAIL: ps1 shim still references lib"; exit 1; }

          grep -qxF "package/tsconfig.json" /tmp/tarlist.txt \
            && { echo "FAIL: tarball contains tsconfig"; exit 1; }
          grep -q "^package/src/" /tmp/tarlist.txt \
            && { echo "FAIL: tarball contains src"; exit 1; }
```

- [ ] **Step 3: 静态确认**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('Guard tracked build artifacts')||!s.includes('package/tsconfig.json'))process.exit(1)"`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: guard tracked artifacts and migrate tarball assertions"
```

---

### Task 4: 垫片安装的原子替换与权限错误可见

**Files:**
- Modify: `src/shims-installer.ts`
- Test: `test/shims-installer.test.js`

**Interfaces:**
- Consumes: 既有导出 `installShimScripts(toolDir: string, binDir: string, isWin: boolean): string[]`、`setExecutable(binDir: string, files: string[], isWin?: boolean): string[]`（返回值改为失败文件名列表）、`installShims(toolDir: string, isWin: boolean): ShimOperationResult`。
- Produces: `installShimScripts` 成功返回写入文件名；失败抛错且目标原文件不变；`setExecutable` 返回失败文件名数组；`installShims` 在权限失败时 `details` 含 `binDir` 与 `oso install-shims`。

- [ ] **Step 1: 写失败测试（原子替换）**

在 `test/shims-installer.test.js` 的 `describe('installShimScripts()')` 内增加：

```js
test('leaves original intact and no temp files when write fails', (t) => {
  const base = tmpDir();
  const { toolDir } = setupToolDir(base);
  const binDir = path.join(base, 'bin');
  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'openspec'), 'ORIGINAL');

  const realWrite = fs.writeFileSync;
  t.mock.method(fs, 'writeFileSync', (p, ...rest) => {
    if (String(p).includes('openspec.tmp-')) throw new Error('EACCES: simulated');
    return realWrite(p, ...rest);
  });

  assert.throws(() => shimsInstaller.installShimScripts(toolDir, binDir, false), /simulated/);
  assert.equal(fs.readFileSync(path.join(binDir, 'openspec'), 'utf8'), 'ORIGINAL');
  assert.deepEqual(fs.readdirSync(binDir).filter((f) => f.includes('.tmp-')), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/shims-installer.test.js --test-name-pattern "temp files"`
Expected: FAIL —— 当前实现会 unlink 原文件后写失败，`openspec` 不存在或内容被破坏。

- [ ] **Step 3: 实现原子替换**

在 `installShimScripts` 中：目标改为同目录 `openspec.tmp-${process.pid}-${Date.now()}-${i}`；写临时文件 → `fs.renameSync(tmp, dest)`；Windows 上 rename 覆盖失败时 `fs.unlinkSync(dest)` 后重试 rename；`finally` 清理临时文件。保留 `{{TOOL_DIR}}` 替换逻辑。

- [ ] **Step 4: 写失败测试（权限 details 与 chmod）**

增加：

```js
test('EACCES details include binDir and copy-paste command', (t) => {
  const base = tmpDir();
  const { toolDir, binDir } = setupEnvironment(base);
  t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));
  t.mock.method(fs, 'renameSync', () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; });

  const result = shimsInstaller.installShims(toolDir, false);
  assert.equal(result.success, false);
  assert.ok(result.details.some((d) => d.includes(binDir)));
  assert.ok(result.details.some((d) => d.includes('oso install-shims')));
});

test('chmod failure on openspec marks install as failed (unix)', (t) => {
  const base = tmpDir();
  const { toolDir, binDir } = setupEnvironment(base);
  t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));
  t.mock.method(fs, 'chmodSync', (p) => {
    if (path.basename(String(p)) === 'openspec') { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; }
  });

  const result = shimsInstaller.installShims(toolDir, false);
  assert.equal(result.success, false);
  assert.ok(result.details.some((d) => d.includes('openspec')));
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `node --test test/shims-installer.test.js --test-name-pattern "EACCES|chmod"`
Expected: FAIL —— details 不含命令 / chmod 被静默吞掉。

- [ ] **Step 6: 实现 details 与 setExecutable**

- `installShimScripts` 抛出的错误保留 `code`；`installShims` 在 catch 中判断 `e.code === 'EACCES' || e.code === 'EPERM'`，追加 `binDir` 与 `oso install-shims`（Unix 含 `sudo` 形态由 CLI 层按可写性决定，installer 只给基础命令）。
- `setExecutable(binDir, files, isWin = process.platform === 'win32')`：Windows 直接返回 `[]`；逐个 chmod，失败收集；返回失败文件名。
- `installShims` 调用 `setExecutable(binDir, written, isWin)`；若失败列表含 `openspec`（Unix），`success: false`，并把文件名写入 `details`。

- [ ] **Step 7: 运行相关测试确认通过**

Run: `node --test test/shims-installer.test.js`
Expected: PASS（含既有用例）。

- [ ] **Step 8: 提交**

```bash
git add src/shims-installer.ts test/shims-installer.test.js
git commit -m "fix(shims): atomic replacement and visible permission failures"
```

---

### Task 5: init 在垫片失败时跳过并输出 banner

**Files:**
- Modify: `src/setup/index.ts`
- Modify: `test/setup-shim-check.test.js`
- Test: `test/setup-shim-check.test.js`

**Interfaces:**
- Consumes: `ensureShim(toolDir, deps): { ok: boolean; repaired: boolean; details: string[] }`；`ShimOperationResult.binDir`。
- Produces: `initProject` 在 `ok: false` 时返回 `success: true`；进度事件含 `{ type: 'warn' }` 与结尾 banner 文本。

- [ ] **Step 1: 改写旧测试为「不中止」**

把 `test/setup-shim-check.test.js` 中 `initProject：垫片未生效且修复失败 → 中止且错误含 oso install-shims` 改为：

```js
test('initProject：垫片修复失败 → 继续完成、exit success、输出 banner', async (t) => {
  const parent = tempDir(t);
  const targetDir = path.join(parent, 'project');
  const events = [];
  const result = await initProject({
    targetDir,
    templateDir,
    superpowersPath: superpowersFixture(t),
    runner: runner(),
    lang: 'en',
    progress: (event) => events.push(event),
    shimDeps: { ...BROKEN_SHIM, install: () => ({ success: false, binDir: '/fake/bin', details: ['EACCES'] }) },
  });

  assert.equal(result.success, true);
  assert.ok(events.some((e) => e.type === 'warn' && /shim|垫片/i.test(e.item || e.text || '')));
  const banner = events.filter((e) => /oso install-shims/.test(e.text || e.item || '')).map((e) => e.text || e.item).join('\n');
  assert.ok(banner.includes('/fake/bin'));
  assert.ok(banner.includes('oso install-shims'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/setup-shim-check.test.js --test-name-pattern "banner"`
Expected: FAIL —— 当前实现在 `!shimResult.ok` 时 `throw`。

- [ ] **Step 3: 改 `src/setup/index.ts`**

- 把 `if (!shimResult.ok) throw ...` 改为：`let shimSkipped = false; let shimDetails: string[] = []; let shimBinDir: string | null = null;`，失败时赋值并 `p({ type: 'warn', ... })`，不再 throw。
- 在 8/8 成功后、`p({ type: 'banner-init' })` 之前，若 `shimSkipped` 输出 banner：失败原因、`shimBinDir`、按 `isWin` 与 `binDir` 可写性（`fs.accessSync(binDir, fs.constants.W_OK)`）生成命令；Windows 追加 gsudo 静态备选；说明无需重跑 init。
- 保留 `dryRunProject` 现状。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test test/setup-shim-check.test.js`
Expected: PASS（含既有 dry-run / ensureShim 用例）。

- [ ] **Step 5: 提交**

```bash
git add src/setup/index.ts test/setup-shim-check.test.js
git commit -m "fix(init): continue when shim install fails and print actionable banner"
```

---

### Task 6: CLI 统一 `oso` 并新增子命令 `--help`

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/cli/create-project.ts`
- Modify: `src/verify.ts`
- Modify: `src/shims-installer.ts`（注释）
- Test: `test/cli.test.js`

**Interfaces:**
- Consumes: 既有 `helpText`、`runCli()`、`t(zh, en)`。
- Produces: `oso <subcommand> --help` 打印说明并 `exit 0`；`buildSubcommandHelp(subcommand, lang)`（内部函数）返回字符串。

- [ ] **Step 1: 写失败测试**

在 `test/cli.test.js` 增加：

```js
describe('oso command guidance', () => {
  test('help has zero exact openspec-superpowers-opencode mentions (en/zh)', () => {
    for (const args of [['--help'], ['--help', '--lang', 'zh-CN']]) {
      const out = runCli(...args).stdout;
      const matches = out.match(/(?<!create-)openspec-superpowers-opencode/g) ?? [];
      assert.equal(matches.length, 0, `${args.join(' ')} still mentions long name`);
    }
  });

  test('subcommand help exits 0 without installing shims', () => {
    const before = fs.readdirSync(process.cwd()).sort();
    const result = runCli('install-shims', '--help');
    assert.equal(result.code, 0);
    assert.match(result.stdout, /install-shims/);
    assert.deepEqual(fs.readdirSync(process.cwd()).sort(), before);
  });

  test('long command --version still works', () => {
    const longCli = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');
    const r = child_process.execFileSync(process.execPath, [longCli, '--version'], { encoding: 'utf8' }).trim();
    assert.equal(r, runCli('--version').stdout);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test test/cli.test.js --test-name-pattern "command guidance"`
Expected: FAIL —— help 仍含长名；`install-shims --help` 会执行安装并可能非 0。

- [ ] **Step 3: 改 `src/cli/index.ts`**

- 中英 `helpText` 的 13 条命令与示例改为 `oso ...`。
- 各 Usage、未知子命令列表、不在 OpenSpec 项目的提示改为 `oso ...`。
- 在 `runCli()` 分发之前增加子命令 `--help` 分支：`const wantsSubHelp = args.includes('--help') || args.includes('-h'); if (isEntry && wantsSubHelp && subcommand) { console.log(buildSubcommandHelp(subcommand, lang)); process.exit(0); }`；`install-shims` 的帮助含权限说明。
- 不触碰 `args[0]` 解析与 `package.json` bin 映射。

- [ ] **Step 4: 改 `src/cli/create-project.ts` 与 `src/verify.ts`**

- `create-project`：「等同于 / Equivalent to」改为 `oso init <target-dir>`，用法行保留自身名字。
- `verify.ts`：5 处用户可见 `fix` 改 `oso ...`，`:15` 注释同步。
- `src/shims-installer.ts:16` 注释改 `oso install-shims`。
- `src/setup/index.ts` 的提示文案改 `oso install-shims`。

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test test/cli.test.js`
Expected: PASS。

- [ ] **Step 6: 运行 typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 7: 提交**

```bash
git add src/cli/index.ts src/cli/create-project.ts src/verify.ts src/shims-installer.ts src/setup/index.ts test/cli.test.js
git commit -m "feat(cli): use oso in help/errors and add subcommand --help"
```

---

### Task 7: 删除 imp16 测试并确认覆盖

**Files:**
- Delete: `test/imp16-tarball-equivalence.test.js`
- Verify: `.github/workflows/ci.yml`（Task 3 已迁移断言）

**Interfaces:**
- Consumes: Task 3 的 CI 断言。
- Produces: 主套件 318 → 317；tarball 不含该测试。

- [ ] **Step 1: 删除文件**

Run: `git rm test/imp16-tarball-equivalence.test.js`

- [ ] **Step 2: 运行主套件并记录计数**

Run: `npm test`
Expected: 317 主套件 + 5 elevated 全绿；记录实际计数供 verify.md 使用。

- [ ] **Step 3: 确认覆盖对照**

逐项确认：CLI 三入口在 `ci.yml`；registry/setup 导出面在 `test/registry.test.js` / `test/setup-api.test.js`；shim 三件套在 `ci.yml`；未知命令在 `test/cli.test.js`；「装了能跑」在 `test/elevated/lifecycle-e2e.test.js`。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "test: remove obsolete imp16 tarball equivalence test"
```

---

### Task 8: 更新文档

**Files:**
- Modify: `README.md`
- Modify: `docs/QUICKSTART.md`

**Interfaces:**
- Consumes: Task 5 的新 init 行为。
- Produces: 文档不含 `--allow-scripts` 需求，含权限说明与垫片自检说明。

- [ ] **Step 1: 改 `docs/QUICKSTART.md`**

- 安装命令保持不带 `--allow-scripts`。
- 安装小节增加「权限说明」：系统 npm / nvm / Windows 三种情况，解释为什么取决于 `openspec` 装在哪。
- 「验证安装」小节补充：`oso init` 会自动检查并安装 `openspec` 垫片；装不上不会中止 init，而是提示该跑哪条命令。

- [ ] **Step 2: 改 `README.md`**

安装命令保持不带 `--allow-scripts`；如提到垫片，改为 `oso init` 自动处理。

- [ ] **Step 3: 全仓搜索**

Run: `rg -n "allow-scripts" --glob '!local/**'`
Expected: 无「需要 `--allow-scripts`」类残留。

- [ ] **Step 4: 提交**

```bash
git add README.md docs/QUICKSTART.md
git commit -m "docs: document shim permissions and remove allow-scripts requirement"
```

---

### Task 9: 全量验收

**Files:**
- 无代码改动（仅记录结果）

**Interfaces:**
- Consumes: Task 1–8。
- Produces: `verify.md` 所需的命令、输出与结论。

- [ ] **Step 1: 静态验收**

Run:
```bash
node -p "Object.keys(require('./package.json').scripts)"
test ! -f scripts/shims-installer.mjs
git ls-files dist
rg -n "allow-scripts" --glob '!local/**'
```
Expected: 无 `install` / `postinstall` / `preinstall`；文件不存在；`git ls-files dist` 为空；无 `allow-scripts` 需求表述。

- [ ] **Step 2: 构建与测试**

Run:
```bash
npm run typecheck
npm run build
npm test
```
Expected: 全部 exit 0；317 主套件 + 5 elevated。

- [ ] **Step 3: tarball 验收**

Run:
```bash
npm pack
tar -tzf *.tgz | grep 'package/dist/cli/index.js'
tar -tzf *.tgz | grep -c 'imp16-tarball-equivalence' || true
```
Expected: 命中 `dist/cli/index.js`；imp16 计数为 0。

- [ ] **Step 4: npm 12 安装验收**

Run（在有 npm 12 的环境）：
```bash
npm i -g ./<name>-<version>.tgz
oso init <tmp-project>
oso verify
```
Expected: 无 `install scripts blocked`；`openspec (shim)` 检查通过。

- [ ] **Step 5: 权限与原子替换手工验收**

- Unix：`chmod a-w` 临时 bin 目录 → `oso init` 走完 8/8、exit 0、banner 含 binDir 与 `sudo oso install-shims`。
- 写入失败：临时目录只读 → 原 `openspec` 内容不变，无 `openspec.tmp-*`。
- Windows：banner 含「以管理员身份」与 gsudo 备选。

- [ ] **Step 6: F003 验收**

Run:
```bash
oso --help
oso --help --lang zh-CN
oso install-shims --help
openspec-superpowers-opencode --version
oso --version
create-openspec-superpowers-opencode --help
```
Expected: 长名精确匹配 0；`--help` 无副作用；两个版本一致；create 帮助的「等同于」为 `oso init <target-dir>`。

- [ ] **Step 7: 最终提交（如有验收脚本/文档补充）**

```bash
git add -A
git commit -m "test: verify retire-install-hook acceptance"
```
