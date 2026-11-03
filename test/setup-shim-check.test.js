/**
 * 0/8 之后的 openspec 垫片自检（BUG004）。
 * 移植自 main 的 test/oso-setup-shim-check.test.ts（11 条，剔除「版本组合不受支持时必须
 * 在修复垫片前中止」1 条——该断言测的是 2.0 专有的 precheck.supported 门禁，V1 无此行为），
 * 共 10 条；按 V1 惯例改为 import '../dist/...'，去掉 TS 类型与 supported-versions。
 * 全部依赖注入，绝不触碰真实全局 bin。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkShim, ensureShim } from '../dist/setup/shim-check.js';
import { dryRunProject, initProject } from '../dist/setup/index.js';

const OK_INSTALL = { success: true, binDir: '/fake/bin', details: ['installed'] };
const FAIL_INSTALL = { success: false, binDir: '/fake/bin', details: ['EACCES: permission denied'] };

/**
 * 可变垫片状态：`install` 成功时应真正翻转 `active`，
 * 这样「安装成功」用例才是在验证垫片确实生效，而不是只信安装器的返回值。
 */
function mutableShimDeps(initialActive) {
    const state = { active: initialActive };
    return {
        state,
        deps: {
            isWin: false,
            findOpenspec: () => '/fake/bin/openspec',
            findShimFile: () => (state.active ? '/fake/bin/openspec' : null),
            findOpenspecOrig: () => (state.active ? '/fake/bin/openspec-orig' : null),
        },
    };
}

test('checkShim：垫片与 openspec-orig 均存在 → active:true', () => {
    const status = checkShim({
        isWin: false,
        findOpenspec: () => '/fake/bin/openspec',
        findShimFile: () => '/fake/bin/openspec',
        findOpenspecOrig: () => '/fake/bin/openspec-orig',
    });
    assert.equal(status.active, true);
    assert.equal(status.binDir, '/fake/bin');
});

test('checkShim：openspec 不是垫片 → active:false 且 reason 说明', () => {
    const status = checkShim({
        isWin: false,
        findOpenspec: () => '/fake/bin/openspec',
        findShimFile: () => null,
        findOpenspecOrig: () => '/fake/bin/openspec-orig',
    });
    assert.equal(status.active, false);
    assert.match(status.reason, /not a shim/i);
});

test('checkShim：垫片在但 openspec-orig 缺失 → active:false', () => {
    const status = checkShim({
        isWin: false,
        findOpenspec: () => '/fake/bin/openspec',
        findShimFile: () => '/fake/bin/openspec',
        findOpenspecOrig: () => null,
    });
    assert.equal(status.active, false);
    assert.match(status.reason, /openspec-orig/i);
});

test('ensureShim：已生效时不调用安装', () => {
    let installed = 0;
    const result = ensureShim('/fake/tool', {
        isWin: false,
        findOpenspec: () => '/fake/bin/openspec',
        findShimFile: () => '/fake/bin/openspec',
        findOpenspecOrig: () => '/fake/bin/openspec-orig',
        install: () => { installed += 1; return OK_INSTALL; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.repaired, false);
    assert.equal(installed, 0);
});

test('ensureShim：未生效且安装成功 → ok:true, repaired:true', () => {
    const { state, deps } = mutableShimDeps(false);
    const result = ensureShim('/fake/tool', {
        ...deps,
        install: () => { state.active = true; return OK_INSTALL; },
    });
    assert.equal(result.ok, true);
    assert.equal(result.repaired, true);
});

test('ensureShim：安装器报成功但垫片仍未生效 → ok:false', () => {
    const { deps } = mutableShimDeps(false);
    const result = ensureShim('/fake/tool', {
        ...deps,
        install: () => ({ success: true, binDir: '/fake/bin', details: [] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.repaired, false);
    assert.equal(
        result.details.some(line => line.includes('not a shim')),
        true,
        '必须在 details 中带上安装后的复检原因',
    );
});

test('ensureShim：未生效且安装失败 → ok:false 且 details 透传', () => {
    const result = ensureShim('/fake/tool', {
        isWin: false,
        findOpenspec: () => '/fake/bin/openspec',
        findShimFile: () => null,
        findOpenspecOrig: () => null,
        install: () => FAIL_INSTALL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.details.some(line => line.includes('EACCES')), true);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, '..', 'template');

function tempDir(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-shimcheck-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function superpowersFixture(t) {
    const parent = tempDir(t);
    const skills = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(skills), 'package.json'), JSON.stringify({ version: '6.1.1' }));
    return skills;
}

function runner() {
    let createdChange;
    return {
        run(program, args = []) {
            if (program === 'git') {
                return { code: 0, signal: null, stdout: '', stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'templates') {
                return { code: 0, signal: null, stdout: JSON.stringify(Array.from({ length: 8 }, () => ({ source: 'project' }))), stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'new') {
                createdChange = args[2];
                return { code: 0, signal: null, stdout: '', stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'list') {
                return { code: 0, signal: null, stdout: JSON.stringify({ changes: [{ name: createdChange }] }), stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'status') {
                return { code: 0, signal: null, stdout: JSON.stringify({ artifacts: Array.from({ length: 8 }, () => ({})) }), stderr: '' };
            }
            return { code: 0, signal: null, stdout: '1.0.0', stderr: '' };
        },
    };
}

const BROKEN_SHIM = {
    isWin: false,
    findOpenspec: () => '/fake/bin/openspec',
    findShimFile: () => null,
    findOpenspecOrig: () => null,
};

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

test('initProject：Windows 垫片失败 → 提示管理员 PowerShell 与 gsudo 备选', async (t) => {
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
    shimDeps: { ...BROKEN_SHIM, isWin: true, findOpenspec: () => path.join('C:\\fake\\bin', 'openspec'), install: () => ({ success: false, binDir: 'C:\\fake\\bin', details: ['EACCES'] }) },
  });

  assert.equal(result.success, true);
  const text = events.map((e) => `${e.item || ''} ${e.text || ''} ${e.detail || ''}`).join('\n');
  assert.ok(text.includes('PowerShell'), 'must mention PowerShell');
  assert.ok(text.includes('gsudo'), 'must mention gsudo');
  assert.ok(text.includes('C:\\fake\\bin'), 'must show actual binDir');
});

test('initProject：Unix 可写 binDir → 提示无需 sudo 且命令不含 sudo', async (t) => {
  const parent = tempDir(t);
  const targetDir = path.join(parent, 'project');
  const binDir = path.join(parent, 'writable-bin');
  fs.mkdirSync(binDir, { recursive: true });
  const events = [];
  const result = await initProject({
    targetDir,
    templateDir,
    superpowersPath: superpowersFixture(t),
    runner: runner(),
    lang: 'en',
    progress: (event) => events.push(event),
    shimDeps: {
      isWin: false,
      findOpenspec: () => path.join(binDir, 'openspec'),
      findShimFile: () => null,
      findOpenspecOrig: () => null,
      install: () => ({ success: false, binDir, details: ['EACCES'] }),
    },
  });

  assert.equal(result.success, true);
  const commandLines = events
    .map((e) => `${e.item || ''} ${e.text || ''}`)
    .filter((line) => line.includes('oso install-shims'));
  assert.ok(commandLines.length > 0, 'must print a copy-paste command');
  assert.ok(commandLines.some((line) => line.includes(binDir)), 'command line must include binDir');
  assert.ok(commandLines.every((line) => !line.includes('sudo')), 'writable dir must not suggest sudo');
});

test('initProject：openspec 不在 PATH（binDir 为 null）→ 不得建议 sudo，应先装 openspec', async (t) => {
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
    shimDeps: {
      isWin: false,
      findOpenspec: () => null,
      findShimFile: () => null,
      findOpenspecOrig: () => null,
      install: () => ({ success: false, binDir: null, details: ['openspec CLI not found in PATH'] }),
    },
  });

  assert.equal(result.success, true);
  const text = events.map((e) => `${e.item || ''} ${e.text || ''} ${e.detail || ''}`).join('\n');
  assert.ok(!/sudo/.test(text), '非权限类失败不得硬套 sudo');
  assert.match(text, /npm i -g @fission-ai\/openspec/, '应给出安装 openspec 的命令');
  assert.match(text, /oso install-shims/, '仍应说明装好垫片的命令');
});

test('initProject：垫片未生效但修复成功 → 继续到完成，并报告自动安装', async (t) => {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'project');
    const { state, deps } = mutableShimDeps(false);
    const events = [];
    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: superpowersFixture(t),
        runner: runner(),
        lang: 'en',
        progress: event => events.push(event),
        shimDeps: {
            ...deps,
            install: () => { state.active = true; return { success: true, binDir: '/fake/bin', details: ['installed'] }; },
        },
    });
    assert.equal(result.success, true);
    assert.ok(
        events.some(event => event.type === 'pass' && /自动安装|installed automatically/i.test(event.item || '')),
        '修复成功后必须打印自动安装提示',
    );
});

test('dryRunProject：垫片未生效只报告，不调用安装', async (t) => {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'new-project');
    let installed = 0;
    const events = [];

    await dryRunProject({
        targetDir,
        templateDir,
        superpowersPath: superpowersFixture(t),
        runner: runner(),
        lang: 'en',
        progress: event => events.push(event),
        shimDeps: { ...BROKEN_SHIM, install: () => { installed += 1; return { success: true, binDir: '/fake/bin', details: [] }; } },
    });

    assert.equal(installed, 0, 'dry-run 不得调用垫片安装');
    assert.ok(
        events.some(event => event.type === 'warn' && (event.item || event.text || '').includes('shim')),
        'dry-run 必须报告垫片未生效',
    );
});
