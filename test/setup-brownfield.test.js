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
        run(program, args = [], options = {}) {
            calls.push({ program, args });
            if (program === 'git') {
                return { code: 0, signal: null, stdout: '', stderr: '' };
            }
            if (program === 'openspec' && args[0] === 'schema') {
                if (!options.cwd) throw new Error('schema mock requires cwd');
                const cwd = options.cwd;
                const schemaFile = path.join(cwd, 'openspec', 'schemas', 'superpowers-bridge-opencode', 'schema.yaml');
                return fs.existsSync(schemaFile)
                    ? { code: 0, signal: null, stdout: '', stderr: '' }
                    : { code: 1, signal: null, stdout: '', stderr: 'Schema not found' };
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

function listFilesRecursive(root) {
    if (!fs.existsSync(root)) return [];
    const files = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const child = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...listFilesRecursive(child));
        else if (entry.isFile()) files.push(child);
    }
    return files.sort();
}

function renderTemplate(relative, superpowersPath) {
    const replacement = superpowersPath.endsWith(path.sep) ? superpowersPath : `${superpowersPath}${path.sep}`;
    return fs.readFileSync(path.join(templateDir, ...relative.split('/')), 'utf8')
        .split('{{SUPERPOWERS_BASE_PATH}}').join(replacement);
}

const CHANGED_COMMANDS = [
    'opsx-apply.md', 'opsx-archive.md', 'opsx-bulk-archive.md', 'opsx-continue.md',
    'opsx-ff.md', 'opsx-finish.md', 'opsx-new.md', 'opsx-propose.md',
    'opsx-sync.md', 'opsx-verify.md',
];

/**
 * 建一个「已安装 v1.1.1」的棕地项目：
 * - 10 个变更命令内容为 `OLD v1.1.1 <name>`，其余 3 个与当前模板逐字一致；
 * - openspec/config.yaml 为固定字节；schemas 目录存在但为空（BUG021 现场）；
 * - 4 个受管根文件直接写入模板渲染结果（模板本身已含完整 marker 对，
 *   若再外包一层会让 mergeMarker 看到 4 个 marker 并抛错）。
 */
function seedInstalledProject(t, { superpowersPath }) {
    const targetDir = seedBrownfield(t);
    const commandsDir = path.join(targetDir, '.opencode', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    const all = fs.readdirSync(path.join(templateDir, '.opencode', 'commands'))
        .filter(name => name.endsWith('.md'));
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
    for (const [source, dest] of [
        ['_gitignore', '.gitignore'],
        ['_gitattributes', '.gitattributes'],
        ['_editorconfig', '.editorconfig'],
        ['_AGENTS.md', 'AGENTS.md'],
    ]) {
        fs.writeFileSync(path.join(targetDir, dest), renderTemplate(source, superpowersPath));
    }
    return { targetDir, configContent, commandNames: all };
}

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
    const schemaDir = path.join(targetDir, 'openspec', 'schemas', 'superpowers-bridge-opencode');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(path.join(schemaDir, 'schema.yaml'), 'existing: true\n');
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

test('棕地：schemas 非空但无 config.yaml 时不询问，schema 被无条件覆盖', async (t) => {
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
    assert.equal(prompts.length, 0, '没有 config.yaml 时 openspec 不得触发任何询问');
    const content = fs.readFileSync(path.join(schemaDir, 'schema.yaml'), 'utf8');
    assert.notEqual(content, 'stale: true\n', 'schema 必须被模板无条件覆盖');
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

test('棕地已有 commands 且未设置开关时被覆盖为模板渲染', async (t) => {
    const targetDir = seedBrownfield(t);
    const superpowersPath = makeSuperpowers(t);
    const commandsDir = path.join(targetDir, '.opencode', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'opsx-ff.md'), '# 我的自定义命令\n');

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath,
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV, BROWN_OVERRIDE_COMMANDS: undefined },
    });

    assert.equal(result.success, true);
    assert.equal(
        fs.readFileSync(path.join(commandsDir, 'opsx-ff.md'), 'utf8'),
        renderTemplate('.opencode/commands/opsx-ff.md', superpowersPath),
        '未设置开关时既有 command 必须被模板渲染覆盖',
    );
});

test('棕地已有 commands 且设置 BROWN_OVERRIDE_COMMANDS=no 时文件不变', async (t) => {
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
        /schema-validation failed: Schema not found/,
    );
});

test('BUG021：config.yaml 保留 + schemas 为空 → 10 个 schema 落盘且 7/8 通过', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir, configContent } = seedInstalledProject(t, { superpowersPath });
    const events = [];
    let result = null;
    let error = null;
    try {
        result = await initProject({
            targetDir,
            templateDir,
            superpowersPath,
            runner: initRunner(),
            lang: 'en',
            shimDeps: ACTIVE_SHIM,
            progress: event => events.push(event),
            prompt: async () => 'n',
            env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined, BROWN_OVERRIDE_COMMANDS: undefined },
        });
    } catch (caught) {
        error = caught;
    }

    const schemaFiles = listFilesRecursive(path.join(targetDir, 'openspec', 'schemas', 'superpowers-bridge-opencode'));
    assert.equal(
        schemaFiles.length,
        10,
        `BUG021：10 个 schema 文件必须落盘（实际 ${schemaFiles.length}；init 错误：${error ? error.message : '无'}）`,
    );
    assert.equal(
        fs.readFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'utf8'),
        configContent,
        '答 n 后 config.yaml 必须逐字不变',
    );
    assert.equal(error, null, `init 必须成功：${error ? error.message : '无'}`);
    assert.equal(result.success, true);
    const stepIndex = events.findIndex(event => event.type === 'step' && event.n === 7);
    assert.ok(stepIndex >= 0, 'progress 必须包含 7/8 step');
    assert.ok(
        events.slice(stepIndex + 1).some(event => event.type === 'pass'),
        '7/8 之后必须出现 pass',
    );
});

test('BUG022：v1.1.1 夹具 + 未设置开关 → 10 个命令与模板逐字一致', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir } = seedInstalledProject(t, { superpowersPath });
    let error = null;
    // BUG021 未修复时 7/8 会因 schema 缺失抛错；先取证，再单独断言 init 必须成功。
    try {
        await initProject({
            targetDir,
            templateDir,
            superpowersPath,
            runner: initRunner(),
            lang: 'en',
            shimDeps: ACTIVE_SHIM,
            prompt: async () => 'n',
            env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined, BROWN_OVERRIDE_COMMANDS: undefined },
        });
    } catch (caught) {
        error = caught;
    }

    for (const name of CHANGED_COMMANDS) {
        assert.equal(
            fs.readFileSync(path.join(targetDir, '.opencode', 'commands', name), 'utf8'),
            renderTemplate(`.opencode/commands/${name}`, superpowersPath),
            `${name} 必须刷新为当前模板渲染结果`,
        );
    }
    assert.equal(error, null, `init 必须成功：${error ? error.message : '无'}`);
});

test('升级可见性：恰好 10 条「已更新：」', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir } = seedInstalledProject(t, { superpowersPath });
    const events = [];
    let error = null;
    try {
        await initProject({
            targetDir,
            templateDir,
            superpowersPath,
            runner: initRunner(),
            lang: 'zh-CN',
            shimDeps: ACTIVE_SHIM,
            progress: event => events.push(event),
            prompt: async () => 'n',
            env: { ...BROWN_ENV, BROWN_OVERRIDE_OPENSPEC: undefined, BROWN_OVERRIDE_COMMANDS: undefined },
        });
    } catch (caught) {
        error = caught;
    }

    const updated = events.filter(event => (event.text || '').startsWith('已更新：'));
    assert.equal(updated.length, 10, `升级后必须恰好输出 10 条「已更新：」（实际 ${updated.length}）`);
    for (const name of ['opsx-explore', 'opsx-onboard', 'opsx-remove']) {
        assert.equal(
            updated.some(event => event.text.includes(name)),
            false,
            `${name} 未变更，不得出现在「已更新：」中`,
        );
    }
    assert.equal(error, null, `init 必须成功：${error ? error.message : '无'}`);
});

test('升级可见性：受管根文件托管区块内容变化时输出「已更新：AGENTS.md」', async (t) => {
    const targetDir = seedBrownfield(t);
    const agents = `# 我的项目\n\n${AGENTS_MARKER}\n旧版托管内容\n${AGENTS_MARKER}\n`;
    fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), agents);
    const events = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath: makeSuperpowers(t),
        runner: initRunner(),
        lang: 'zh-CN',
        shimDeps: ACTIVE_SHIM,
        progress: event => events.push(event),
        env: { ...BROWN_ENV },
    });

    assert.equal(result.success, true);
    assert.ok(
        events.some(event => event.type === 'action'
            && (event.text || '').startsWith('已更新：')
            && (event.text || '').includes('AGENTS.md')),
        `受管区块内容变化必须输出「已更新：AGENTS.md」，实际事件：${JSON.stringify(events.filter(event => event.type === 'action'))}`,
    );
});

test('用户自建命令不被覆盖、不被删除', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir } = seedInstalledProject(t, { superpowersPath });
    const customPath = path.join(targetDir, '.opencode', 'commands', 'my-custom.md');
    fs.writeFileSync(customPath, 'my custom\n');

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath,
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async () => 'n',
        env: { ...BROWN_ENV, BROWN_OVERRIDE_COMMANDS: undefined },
    });

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(customPath), true, '用户自建命令不得被删除');
    assert.equal(fs.readFileSync(customPath, 'utf8'), 'my custom\n', '用户自建命令不得被覆盖');
});

test('保留功能：BROWN_OVERRIDE_COMMANDS=no → 命令文件字节不变', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir } = seedInstalledProject(t, { superpowersPath });

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath,
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        env: { ...BROWN_ENV, BROWN_OVERRIDE_COMMANDS: 'no' },
    });

    assert.equal(result.success, true);
    for (const name of CHANGED_COMMANDS) {
        assert.equal(
            fs.readFileSync(path.join(targetDir, '.opencode', 'commands', name), 'utf8'),
            `OLD v1.1.1 ${name}\n`,
            `${name} 在 =no 下必须保持 v1.1.1 原始字节`,
        );
    }
});

test('ask 功能：BROWN_OVERRIDE_COMMANDS=ask + 全部答 n → 命令文件字节不变', async (t) => {
    const superpowersPath = makeSuperpowers(t);
    const { targetDir } = seedInstalledProject(t, { superpowersPath });
    const prompts = [];

    const result = await initProject({
        targetDir,
        templateDir,
        superpowersPath,
        runner: initRunner(),
        lang: 'en',
        shimDeps: ACTIVE_SHIM,
        prompt: async question => {
            prompts.push(question);
            return 'n';
        },
        env: { ...BROWN_ENV, BROWN_OVERRIDE_COMMANDS: 'ask' },
    });

    assert.equal(result.success, true);
    assert.ok(prompts.length > 0, 'ask 模式必须逐个询问已存在的命令文件');
    for (const name of CHANGED_COMMANDS) {
        assert.equal(
            fs.readFileSync(path.join(targetDir, '.opencode', 'commands', name), 'utf8'),
            `OLD v1.1.1 ${name}\n`,
            `${name} 在 =ask + 答 n 下必须保持 v1.1.1 原始字节`,
        );
    }
});
