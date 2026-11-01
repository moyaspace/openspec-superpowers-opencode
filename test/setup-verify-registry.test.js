/**
 * 8/8 验证的注册与清理（BUG005）。
 * 移植自 main 的 test/oso-setup-verify-registry.test.ts（7 条）；按 V1 惯例改为
 * import '../dist/...'，去掉 TS 类型与 supported-versions / componentVersions。
 *
 * 断言基于真实文件状态：`openspec list --json` 的桩会读取注册表文件，
 * 因此只有注册真的写入条目，验证才可能通过。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyProject } from '../dist/setup/verify.js';
import { initProject } from '../dist/setup/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.resolve(__dirname, '..', 'template');

/** 已生效垫片的测试桩：阻止 init 触碰真实全局 bin。 */
const ACTIVE_SHIM = {
    isWin: false,
    findOpenspec: () => '/fake/bin/openspec',
    findShimFile: () => '/fake/bin/openspec',
    findOpenspecOrig: () => '/fake/bin/openspec-orig',
};

function tempDir(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-verify-registry-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

function registryPathOf(targetDir) {
    return path.join(targetDir, 'openspec', 'oso-change-registry.json');
}

function readRegistryChanges(targetDir) {
    const raw = fs.readFileSync(registryPathOf(targetDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.changes) ? parsed.changes : [];
}

/**
 * 真实状态桩：`list` 读注册表文件，`new` 创建变更目录，`status` 可失败。
 * 不识别 `openspec-superpowers-opencode`——注册若走外部 CLI 就不会留下任何条目。
 */
function verifyRunner(targetDir, options = {}) {
    const calls = [];
    let listedChanges = [];
    return {
        calls,
        get listedChanges() {
            return listedChanges;
        },
        run(program, args = []) {
            calls.push({ program, args });
            if (program === 'git') {
                return { code: 0, signal: null, stdout: '', stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'templates') {
                if (options.templatesFail) return { code: 1, signal: null, stdout: '', stderr: 'simulated template-list failure' };
                return { code: 0, signal: null, stdout: JSON.stringify(Array.from({ length: 8 }, () => ({ source: 'project' }))), stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'new') {
                fs.mkdirSync(path.join(targetDir, 'openspec', 'changes', args[2]), { recursive: true });
                return { code: 0, signal: null, stdout: '', stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'list') {
                try {
                    listedChanges = readRegistryChanges(targetDir);
                } catch {
                    listedChanges = [];
                }
                if (options.listFails) return { code: 1, signal: null, stdout: '', stderr: 'simulated list failure' };
                return { code: 0, signal: null, stdout: JSON.stringify({ changes: listedChanges }), stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'status') {
                options.onStatus?.(registryPathOf(targetDir));
                if (options.statusFails) return { code: 1, signal: null, stdout: '', stderr: 'simulated status failure' };
                return { code: 0, signal: null, stdout: JSON.stringify({ artifacts: Array.from({ length: 8 }, () => ({})) }), stderr: '' };
            }
            return { code: 0, signal: null, stdout: '1.0.0', stderr: '' };
        },
    };
}

function cleanupSpy(targetDir, cleaned) {
    return name => {
        cleaned.push(name);
        fs.rmSync(path.join(targetDir, 'openspec', 'changes', name), { recursive: true, force: true });
    };
}

test('verifyProject：list 从真实注册表读到条目（worktree 为 .），结束后移除', async (t) => {
    const targetDir = tempDir(t);
    const runner = verifyRunner(targetDir);
    const cleaned = [];

    const result = await verifyProject({
        targetDir,
        runner,
        uniquePart: () => 'unit-1',
        cleanup: cleanupSpy(targetDir, cleaned),
    });

    assert.equal(result.passed, true, '注册后列表可见，验证必须通过');
    assert.equal(runner.listedChanges.length, 1, 'list 必须读到刚注册的临时变更');
    assert.equal(runner.listedChanges[0].name, 'oso-verify-unit-1');
    assert.equal(runner.listedChanges[0].worktree, '.');
    assert.equal(
        runner.calls.some(call => call.program === 'openspec-superpowers-opencode'),
        false,
        '注册不得依赖外部 CLI',
    );

    const list = runner.calls.find(call => call.program === 'openspec' && call.args[0] === 'list');
    assert.ok(list, '必须以 openspec 发起 list');
    assert.deepEqual(list.args, ['list', '--json']);
    assert.equal(runner.calls.some(call => call.program === 'openspec-orig'), false, '不得改用 openspec-orig');

    assert.deepEqual(readRegistryChanges(targetDir), [], '结束后注册表不得残留临时条目');
    assert.deepEqual(cleaned, ['oso-verify-unit-1'], '临时变更目录必须清理');
    assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'changes', 'oso-verify-unit-1')), false);
});

test('verifyProject：registry add 失败 → 验证失败且错误指明 registry-add，仍清理目录', async (t) => {
    const targetDir = tempDir(t);
    fs.mkdirSync(registryPathOf(targetDir), { recursive: true });
    const runner = verifyRunner(targetDir);
    const cleaned = [];

    const result = await verifyProject({
        targetDir,
        runner,
        uniquePart: () => 'unit-3',
        cleanup: cleanupSpy(targetDir, cleaned),
    });

    assert.equal(result.passed, false);
    assert.match(result.error.message, /registry-add/);
    assert.deepEqual(cleaned, ['oso-verify-unit-3'], '注册失败也不得阻塞目录清理');
});

test('verifyProject：注册前失败（template-list）不得触碰注册表', async (t) => {
    const targetDir = tempDir(t);
    const registryPath = registryPathOf(targetDir);
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const original = `${JSON.stringify(
        { changes: [{ name: 'unrelated-change', worktree: 'feature/unrelated' }] },
        null,
        4,
    )}\n`;
    fs.writeFileSync(registryPath, original);

    const runner = verifyRunner(targetDir, { templatesFail: true });
    const cleaned = [];

    const result = await verifyProject({
        targetDir,
        runner,
        uniquePart: () => 'unit-2',
        cleanup: cleanupSpy(targetDir, cleaned),
    });

    assert.equal(result.passed, false);
    assert.match(result.error.message, /template-list/);
    assert.equal(
        fs.readFileSync(registryPath, 'utf8'),
        original,
        '注册从未发生，注册表必须逐字节保持不变（不得重排格式或重建）',
    );
    assert.deepEqual(cleaned, [], '未创建变更则不得触发目录清理');
});

test('verifyProject：注册后中途失败 → 注册表无残留且清理目录', async (t) => {
    const targetDir = tempDir(t);
    const runner = verifyRunner(targetDir, { statusFails: true });
    const cleaned = [];

    const result = await verifyProject({
        targetDir,
        runner,
        uniquePart: () => 'unit-4',
        cleanup: cleanupSpy(targetDir, cleaned),
    });

    assert.equal(result.passed, false);
    assert.match(result.error.message, /change-status/);
    assert.equal(fs.existsSync(registryPathOf(targetDir)), true, '注册过的注册表文件必须存在');
    assert.deepEqual(readRegistryChanges(targetDir), [], '失败路径不得残留临时条目');
    assert.deepEqual(cleaned, ['oso-verify-unit-4']);
});

test('verifyProject：registry remove 失败不中止清理、不掩盖原始错误', async (t) => {
    const targetDir = tempDir(t);
    const registryPath = registryPathOf(targetDir);
    const runner = verifyRunner(targetDir, {
        statusFails: true,
        onStatus: () => {
            fs.rmSync(registryPath, { recursive: true, force: true });
            fs.mkdirSync(registryPath, { recursive: true });
        },
    });
    const cleaned = [];
    const events = [];

    const result = await verifyProject({
        targetDir,
        runner,
        uniquePart: () => 'unit-5',
        cleanup: cleanupSpy(targetDir, cleaned),
        progress: event => events.push(event),
    });

    assert.equal(result.passed, false);
    assert.match(result.error.message, /change-status/, '必须保留原始失败原因');
    assert.ok(
        events.some(event => event.type === 'warn' && (event.item || '').includes('registry remove')),
        '移除注册失败必须以 warn 报告',
    );
    assert.deepEqual(cleaned, ['oso-verify-unit-5'], '移除注册失败不得中止目录清理');
    assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'changes', 'oso-verify-unit-5')), false);
});

test('initProject：8/8 验证失败时必须还原被覆写的注册表', async (t) => {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'project');
    fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({ name: 'existing-app', version: '0.0.1' }));
    const registryPath = registryPathOf(targetDir);
    const original = `${JSON.stringify(
        { changes: [{ name: 'existing-change', worktree: 'feature/existing' }] },
        null,
        4,
    )}\n`;
    fs.writeFileSync(registryPath, original);
    const skills = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(skills), 'package.json'), JSON.stringify({ version: '6.1.1' }));

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: skills,
        runner: verifyRunner(targetDir, { listFails: true }),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: {
            BROWN_OVERRIDE_INIT: 'yes',
            BROWN_OVERRIDE_OPENSPEC: 'yes',
            BROWN_OVERRIDE_OCODEJSON: 'yes',
            BROWN_OVERRIDE_COMMANDS: 'yes',
            BROWN_OVERRIDE_SKILLS: 'yes',
            BROWN_OVERRIDE_AGENTS: 'yes',
            BROWN_OVERRIDE_GITIGNORE: 'yes',
            BROWN_OVERRIDE_GITATTR: 'yes',
            BROWN_OVERRIDE_EDITORCONFIG: 'yes',
            BROWN_OVERRIDE_REGISTRY: 'yes',
        },
    });

    assert.equal(result.success, false, 'openspec list 失败时 8/8 验证必须失败');
    assert.equal(
        fs.readFileSync(registryPath, 'utf8'),
        original,
        '验证失败后必须把被覆写的注册表还原为原始字节',
    );
});

test('initProject：注册表创建发生在 8/8 之前，验证后无临时条目', async (t) => {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'project');
    const skills = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(skills), 'package.json'), JSON.stringify({ version: '6.1.1' }));
    const events = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: skills,
        runner: verifyRunner(targetDir),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        detectBash: () => ({ available: false, path: null }),
        progress: event => events.push(event),
    });

    assert.equal(result.success, true);
    const bashEvent = events.find(event => (event.item || '').includes('bash'));
    assert.ok(bashEvent, 'v6+ init 必须打印 bash 状态行');
    assert.equal(bashEvent.type, 'warn');
    assert.equal(result.success, true, '缺 bash 不得阻塞 init');
    const step8 = events.findIndex(event => event.type === 'step' && event.n === 8);
    const registry = events.findIndex(event => (event.text || '').includes('oso-change-registry.json'));
    assert.ok(step8 >= 0, '必须出现 8/8 step 事件');
    assert.ok(registry >= 0, '必须出现注册表创建事件');
    assert.ok(registry < step8, '注册表创建必须早于 8/8');
    assert.deepEqual(readRegistryChanges(targetDir), [], 'init 结束后注册表不得残留 oso-verify-*');
});

test('initProject：Superpowers v5 不打印 bash 状态行', async (t) => {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'project');
    const skills = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(skills), 'package.json'), JSON.stringify({ version: '5.1.1' }));
    const events = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: skills,
        runner: verifyRunner(targetDir),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        detectBash: () => { throw new Error('bash probe must not run for v5'); },
        progress: event => events.push(event),
    });

    assert.equal(result.success, true);
    assert.equal(events.some(event => (event.item || '').includes('bash')), false);
});
