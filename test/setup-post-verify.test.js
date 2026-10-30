/**
 * 精简版部署后验证（GAP002）。
 *
 * 检查 1：模板 `template/.opencode/commands/**` 的每个 `.md` 在目标 `.opencode/commands/` 存在。
 * 检查 2：`dist/cli/index.js` 存在且可被动态 import。
 * 任一失败 → init 打印缺失项并返回 success:false（不回滚）。
 *
 * 检查 1 的两条用例里，一条走完整 init（检查 2），另一条直接验证护栏函数：
 * 计划器对「目标缺失的命令」一律补写，init 会自愈，因此删文件后重跑 init 不会失败
 * （main 的 runPostVerify 测试出于同样原因直接验证护栏）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initProject, verifyDeploymentPostInit } from '../dist/setup/index.js';
import { createContext } from '../dist/setup/context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const templateDir = path.join(repoRoot, 'template');

const ACTIVE_SHIM = {
    isWin: false,
    findOpenspec: () => '/fake/bin/openspec',
    findShimFile: () => '/fake/bin/openspec',
    findOpenspecOrig: () => '/fake/bin/openspec-orig',
};

function tempDir(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-post-verify-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
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

function superpowersFixture(t) {
    const parent = tempDir(t);
    const skills = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(skills), 'package.json'), JSON.stringify({ version: '6.1.1' }));
    return skills;
}

/** 建一个 mock 工具根：把真实 dist/ 整树复制进 <root>/dist/，便于「删掉入口」而不动真产物。 */
function toolRootFixture(t) {
    const root = tempDir(t);
    fs.cpSync(path.join(repoRoot, 'dist'), path.join(root, 'dist'), { recursive: true });
    return root;
}

function initOptions(t, extra = {}) {
    return {
        targetDir: path.join(tempDir(t), 'project'),
        templateDir,
        superpowersPath: superpowersFixture(t),
        runner: runner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        ...extra,
    };
}

test('部署后验证：正常情况下 init 通过，且模板命令全部落盘', async (t) => {
    const options = initOptions(t);
    const result = await initProject(options);

    assert.equal(result.success, true, '命令齐全且入口可加载时 init 必须成功');
    const templateCommands = fs.readdirSync(path.join(templateDir, '.opencode', 'commands'))
        .filter(name => name.endsWith('.md'));
    assert.ok(templateCommands.length > 0, '模板必须有命令文件');
    for (const name of templateCommands) {
        assert.equal(
            fs.existsSync(path.join(options.targetDir, '.opencode', 'commands', name)),
            true,
            `${name} 必须已部署`,
        );
    }
});

test('部署后验证：删除 dist/cli/index.js 后 init 必须失败并指名入口', async (t) => {
    const toolRoot = toolRootFixture(t);
    const options = initOptions(t, { toolRoot });
    const events = [];
    options.progress = event => events.push(event);

    const okInit = await initProject(initOptions(t, { toolRoot }));
    assert.equal(okInit.success, true, 'CLI 入口存在时 init 必须成功');

    fs.rmSync(path.join(toolRoot, 'dist', 'cli', 'index.js'));
    const result = await initProject(options);

    assert.equal(result.success, false, 'CLI 入口缺失时 init 必须失败');
    assert.ok(
        events.some(event => event.type === 'fail' && (event.item || '').includes('dist/cli/index.js')),
        '失败时必须以 fail 事件指名 dist/cli/index.js',
    );
});

test('部署后验证：目标缺少某个模板命令时护栏报出该文件名', async (t) => {
    const toolRoot = toolRootFixture(t);
    const options = initOptions(t, { toolRoot });
    assert.equal((await initProject(options)).success, true);

    const deleted = 'opsx-ff.md';
    fs.rmSync(path.join(options.targetDir, '.opencode', 'commands', deleted));

    const context = createContext({ targetDir: options.targetDir, templateDir, mode: 'init' });
    const missing = await verifyDeploymentPostInit(toolRoot, context);

    assert.equal(missing.length, 1, `只应报告被删除的那一个文件，实际：${missing.join(', ')}`);
    assert.match(missing[0], new RegExp(deleted), '错误信息必须含被删除的文件名');
});
