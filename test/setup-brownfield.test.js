/**
 * 棕地 `oso init` 的合并语义、占位符落盘校验、openspec 决策条件化与命令部署。
 * 移植自 main 的 test/oso-setup-brownfield.test.ts（16 条），供 release/1.1 的
 * `node --test "test/*.test.js"` 执行；按 V1 惯例改为 import '../dist/...'，
 * 去掉 TS 类型标注与 supported-versions / componentVersions。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dryRunProject, initProject } from '../dist/setup/index.js';
import { verifyNoPlaceholders } from '../dist/setup/verify.js';

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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-brownfield-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
}

/** 让 initProject 走完 0/8–8/8 的假 runner：openspec 探针返回预期结构，其余命令成功空输出。 */
function initRunner() {
    let createdChange;
    const calls = [];
    return {
        calls,
        run(program, args = []) {
            calls.push({ program, args });
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

/** 建一个棕地项目：已有非空目录（触发 brownfield 判定）。 */
function seedBrownfield(t) {
    const parent = tempDir(t);
    const targetDir = path.join(parent, 'project');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({ name: 'existing-app', version: '0.0.1' }));
    return targetDir;
}

function makeSuperpowers(t) {
    const parent = tempDir(t);
    const superpowersPath = path.join(parent, 'superpowers', 'skills');
    fs.mkdirSync(superpowersPath, { recursive: true });
    fs.writeFileSync(path.join(path.dirname(superpowersPath), 'package.json'), JSON.stringify({ version: '6.1.1' }));
    return superpowersPath;
}

const GITIGNORE_MARKER = '# <!-- openspec-superpowers-opencode_gitignore -->';
const AGENTS_MARKER = '<!-- openspec-superpowers-opencode_instructions -->';

/** 棕地完整 init 所需的全部决策 override（避免交互式询问）。 */
const BROWN_ENV = {
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
};

test('棕地：无 marker 的 .gitignore 追加托管区块，用户原有行零删除', async (t) => {
    const targetDir = seedBrownfield(t);
    const userLines = ['node_modules/', '.env', 'dist/', 'logs/', ''];
    fs.writeFileSync(path.join(targetDir, '.gitignore'), userLines.join('\n'));

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true, '棕地完整 init 必须成功');
    const content = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    assert.ok(content.startsWith('node_modules/\n.env\ndist/\nlogs/\n'), '用户原有行必须逐字保留在文件开头');
    assert.equal(content.split(GITIGNORE_MARKER).length - 1, 2, '托管区块必须有完整 marker 对');
});

test('棕地：完整 marker 答 y 只替换 marker 之间', async (t) => {
    const targetDir = seedBrownfield(t);
    const existing = `keep-before\n${GITIGNORE_MARKER}\nold-managed\n${GITIGNORE_MARKER}\nkeep-after\n`;
    fs.writeFileSync(path.join(targetDir, '.gitignore'), existing);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    const content = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    assert.ok(content.startsWith('keep-before\n'), 'marker 之前的内容必须保留');
    assert.ok(content.endsWith('keep-after\n'), 'marker 之后的内容必须保留');
    assert.equal(content.includes('old-managed'), false, '旧托管区块必须被替换');
});

test('棕地：完整 marker 答 n 时文件字节级不变', async (t) => {
    const targetDir = seedBrownfield(t);
    const existing = `keep-before\n${GITIGNORE_MARKER}\nold-managed\n${GITIGNORE_MARKER}\nkeep-after\n`;
    fs.writeFileSync(path.join(targetDir, '.gitignore'), existing);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV, BROWN_OVERRIDE_GITIGNORE: 'no' },
    });

    assert.equal(result.success, true);
    assert.equal(fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8'), existing);
});

test('棕地：marker 不完整（仅 1 个）时 init 中止且文件不变', async (t) => {
    const targetDir = seedBrownfield(t);
    const existing = `keep-before\n${GITIGNORE_MARKER}\nhalf\n`;
    fs.writeFileSync(path.join(targetDir, '.gitignore'), existing);

    await assert.rejects(
        () => initProject({
            targetDir,
            templateDir,
            superpowersPath: makeSuperpowers(t),
            runner: initRunner(),
            lang: 'en',
            shimDeps: ACTIVE_SHIM,
            env: { ...BROWN_ENV },
        }),
        /Incomplete managed marker section/,
    );
    assert.equal(fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8'), existing);
});

test('棕地：每个受管根文件在一次 init 的计划中最多出现 1 次', async (t) => {
    const targetDir = seedBrownfield(t);
    fs.writeFileSync(path.join(targetDir, '.gitignore'), 'node_modules/\n');
    fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), '# 我的项目\n');

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    assert.ok(result.plan, 'init 必须返回 plan');
    for (const file of ['AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig']) {
        const count = result.plan.operations.filter(
            op => op.target && path.relative(targetDir, op.target).replace(/\\/g, '/') === file,
        ).length;
        assert.ok(count <= 1, `${file} 在计划中出现 ${count} 次，超过 1 次`);
    }
});

test('棕地：连续两次 init 幂等（第二次受管根文件与第一次逐字相同）', async (t) => {
    const targetDir = seedBrownfield(t);
    fs.writeFileSync(path.join(targetDir, '.gitignore'), 'node_modules/\n.env\n');
    const superpowersPath = makeSuperpowers(t);

    const options = {
        targetDir,
        templateDir,
        superpowersPath,
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    };

    assert.equal((await initProject(options)).success, true);
    const first = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    assert.ok(first.startsWith('node_modules/\n.env\n'), '幂等不等于可丢用户行：用户原有行必须保留');
    assert.equal((await initProject(options)).success, true);
    const second = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    assert.equal(second, first);
});

test('棕地：落盘的 AGENTS.md / schema.yaml / opsx-apply.md / opsx-finish.md 均无占位符', async (t) => {
    const targetDir = seedBrownfield(t);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    for (const relative of [
        'AGENTS.md',
        'openspec/schemas/superpowers-bridge-opencode/schema.yaml',
        '.opencode/commands/opsx-apply.md',
        '.opencode/commands/opsx-finish.md',
    ]) {
        const content = fs.readFileSync(path.join(targetDir, ...relative.split('/')), 'utf8');
        assert.equal(content.includes('{{SUPERPOWERS_BASE_PATH}}'), false, `${relative} 残留占位符`);
    }
});

test('verifyNoPlaceholders：目标文件残留占位符时抛错并指名文件', async (t) => {
    assert.equal(typeof verifyNoPlaceholders, 'function', 'verifyNoPlaceholders 必须由 src/setup/verify.ts 导出');

    const targetDir = tempDir(t);
    fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), 'path: {{SUPERPOWERS_BASE_PATH}}\n');
    assert.throws(
        () => verifyNoPlaceholders(targetDir, ['AGENTS.md']),
        /AGENTS\.md/,
    );
});

test('棕地：openspec/ 不存在时不询问并直接部署', async (t) => {
    const targetDir = seedBrownfield(t);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async () => {
            throw new Error('must not prompt');
        },
        env: { BROWN_OVERRIDE_INIT: 'yes' },
    });

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'config.yaml')), true);
    assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'schemas', 'superpowers-bridge-opencode', 'schema.yaml')), true);
});

test('棕地：已有 openspec/config.yaml 时仍询问，答 n 时文件不变', async (t) => {
    const targetDir = seedBrownfield(t);
    fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
    const existingConfig = 'schema: spec-driven\n';
    fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), existingConfig);
    const prompts = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async question => {
            prompts.push(question);
            return 'n';
        },
        env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined },
    });

    assert.equal(result.success, true);
    assert.equal(prompts.length, 1, '已有 openspec/config.yaml 时必须询问且只问一次');
    assert.match(prompts[0], /openspec/i);
    assert.equal(fs.readFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'utf8'), existingConfig);
});

test('棕地：schemas 非空时询问，答 y 时 schema 被覆盖', async (t) => {
    const targetDir = seedBrownfield(t);
    const schemaDir = path.join(targetDir, 'openspec', 'schemas', 'superpowers-bridge-opencode');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(path.join(schemaDir, 'schema.yaml'), 'stale: true\n');
    const prompts = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async question => {
            prompts.push(question);
            return 'y';
        },
        env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined },
    });

    assert.equal(result.success, true);
    assert.equal(prompts.length, 1, 'schemas 非空时必须询问且只问一次');
    assert.match(prompts[0], /openspec/i);
    const content = fs.readFileSync(path.join(schemaDir, 'schema.yaml'), 'utf8');
    assert.notEqual(content, 'stale: true\n', 'schema 必须被模板覆盖');
});

test('棕地：BROWN_OVERRIDE_OPENSPEC 优先于目标状态判定', async (t) => {
    const targetDir = seedBrownfield(t);
    fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async () => {
            throw new Error('must not prompt');
        },
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    assert.notEqual(fs.readFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'utf8'), 'schema: spec-driven\n');
});

test('棕地：答 n 保留的 AGENTS.md 仍含占位符时 init 失败并指名文件', async (t) => {
    const targetDir = seedBrownfield(t);
    const agents = `# 我的项目\n\n${AGENTS_MARKER}\n\npath: {{SUPERPOWERS_BASE_PATH}}\n\n${AGENTS_MARKER}\n`;
    fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), agents);

    await assert.rejects(
        () => initProject({
            targetDir,
            templateDir,
            superpowersPath: makeSuperpowers(t),
            runner: initRunner(),
            lang: 'en',
            shimDeps: ACTIVE_SHIM,
            env: { ...BROWN_ENV, BROWN_OVERRIDE_AGENTS: 'no' },
        }),
        /AGENTS\.md/,
        '答 n 保留的文件若仍含占位符，init 必须失败并指名文件',
    );
    assert.equal(fs.readFileSync(path.join(targetDir, 'AGENTS.md'), 'utf8'), agents);
});

test('dry-run：答 n 保留的 AGENTS.md 仍含占位符时必须报告失败', async (t) => {
    const targetDir = seedBrownfield(t);
    const agents = `# 我的项目\n\n${AGENTS_MARKER}\n\npath: {{SUPERPOWERS_BASE_PATH}}\n\n${AGENTS_MARKER}\n`;
    fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), agents);
    const before = fs.readdirSync(targetDir).sort();
    const events = [];

    await dryRunProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        progress: event => events.push(event),
        env: { BROWN_OVERRIDE_INIT: 'yes', BROWN_OVERRIDE_AGENTS: 'no' },
    });

    assert.ok(
        events.some(event => event.type === 'fail' && (event.item || event.text || '').includes('AGENTS.md')),
        'dry-run 的 6/8 必须校验磁盘上保留的 AGENTS.md 并报告失败',
    );
    assert.equal(fs.readFileSync(path.join(targetDir, 'AGENTS.md'), 'utf8'), agents, 'dry-run 不得写盘');
    assert.deepEqual(fs.readdirSync(targetDir).sort(), before, 'dry-run 不得创建文件');
});

test('棕地首次 init：无 commands 目录时部署全部模板命令', async (t) => {
    const targetDir = seedBrownfield(t);
    assert.equal(fs.existsSync(path.join(targetDir, '.opencode', 'commands')), false);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    const templateCommands = fs.readdirSync(path.join(templateDir, '.opencode', 'commands'))
        .filter(name => name.endsWith('.md'));
    assert.ok(templateCommands.length > 0, '模板必须有命令文件');
    for (const name of templateCommands) {
        assert.equal(
            fs.existsSync(path.join(targetDir, '.opencode', 'commands', name)),
            true,
            `${name} 必须被部署`,
        );
    }
});

test('棕地已有 commands 且答 n 时文件不变', async (t) => {
    const targetDir = seedBrownfield(t);
    const commandsDir = path.join(targetDir, '.opencode', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    const existing = '# 我的自定义命令\n';
    fs.writeFileSync(path.join(commandsDir, 'opsx-ff.md'), existing);

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV, BROWN_OVERRIDE_COMMANDS: 'no' },
    });

    assert.equal(result.success, true);
    assert.equal(fs.readFileSync(path.join(commandsDir, 'opsx-ff.md'), 'utf8'), existing);
});
