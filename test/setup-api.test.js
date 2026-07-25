const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('setup public API', () => {
    it('exports init, reset, and dry-run entry points', () => {
        const setup = require('../lib/setup');

        assert.equal(typeof setup.dryRunProject, 'function');
        assert.equal(typeof setup.initProject, 'function');
        assert.equal(typeof setup.resetProject, 'function');
    });

    it('plans a greenfield init without creating a missing target directory', async (t) => {
        const setup = require('../lib/setup');
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-dry-run-'));
        const targetDir = path.join(parentDir, 'new-project');
        const superpowersRoot = path.join(parentDir, 'superpowers');
        const superpowersPath = path.join(superpowersRoot, 'skills');
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(superpowersRoot, 'package.json'), JSON.stringify({ version: '6.1.1' }));

        const result = await setup.dryRunProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            superpowersPath,
            runner: { run: () => ({ code: 0, stdout: '1.0.0', stderr: '' }) },
        });

        assert.equal(result.mode, 'dry-run');
        assert.equal(result.projectKind, 'greenfield');
        assert.ok(result.operations.some(operation => (
            operation.type === 'mkdir' && operation.path === targetDir
        )));
        assert.ok(result.operations.some(operation => (
            operation.type === 'copy' && operation.target === path.join(targetDir, 'skills.lock.json')
        )));
        const agents = result.operations.find(operation => operation.target === path.join(targetDir, 'AGENTS.md'));
        assert.equal(agents.content.includes('{{SUPERPOWERS_BASE_PATH}}'), false);
        assert.equal(fs.existsSync(targetDir), false);
    });

    it('initializes a greenfield project through the shared plan', async (t) => {
        const setup = require('../lib/setup');
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-init-'));
        const targetDir = path.join(parentDir, 'project');
        const superpowersRoot = path.join(parentDir, 'superpowers');
        const superpowersPath = path.join(superpowersRoot, 'skills');
        const calls = [];
        let createdChange;
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(superpowersRoot, 'package.json'), JSON.stringify({ version: '6.1.1' }));
        const runner = {
            run(program, args) {
                calls.push([program, args]);
                const command = `${program} ${args.join(' ')}`;
                if (command === 'opencode --version') return { code: 0, stdout: '1.2.3', stderr: '' };
                if (args[0] === 'templates') {
                    return { code: 0, stdout: JSON.stringify(Array.from({ length: 8 }, () => ({ source: 'project' }))), stderr: '' };
                }
                if (args[0] === 'new') {
                    createdChange = args[2];
                    return { code: 0, stdout: '', stderr: '' };
                }
                if (args[0] === 'list') return { code: 0, stdout: JSON.stringify({ changes: [{ name: createdChange }] }), stderr: '' };
                if (args[0] === 'status') {
                    return { code: 0, stdout: JSON.stringify({ artifacts: Array.from({ length: 8 }, () => ({})) }), stderr: '' };
                }
                return { code: 0, stdout: '', stderr: '' };
            },
        };

        const result = await setup.initProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            superpowersPath,
            runner,
            lang: 'en',
        });

        assert.equal(result.success, true);
        assert.equal(result.lockVerification.allMatch, false);
        assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'config.yaml')), true);
        assert.equal(fs.existsSync(path.join(targetDir, 'openspec', 'oso-change-registry.json')), true);
        const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, '.opencode', 'install-manifest.json'), 'utf8'));
        assert.equal(manifest.verification, 'passed');
        assert.ok(manifest.files.includes('openspec/config.yaml'));
        assert.ok(calls.some(([program, args]) => program === 'git' && args[0] === 'init'));
    });

    it('cancels a brownfield init before writing when the global override is no', async (t) => {
        const setup = require('../lib/setup');
        const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-cancel-'));
        t.after(() => fs.rmSync(targetDir, { recursive: true, force: true }));
        fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'user config');
        const superpowersPath = path.join(targetDir, 'test-superpowers', 'skills');
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(path.dirname(superpowersPath), 'package.json'), JSON.stringify({ version: '6.1.1' }));
        const runner = { run: () => ({ code: 0, stdout: '1.0.0', stderr: '' }) };

        const result = await setup.initProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            env: { BROWN_OVERRIDE_INIT: 'no' },
            runner,
            superpowersPath,
        });

        assert.equal(result.cancelled, true);
        assert.equal(fs.readFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'utf8'), 'user config');
        assert.equal(fs.existsSync(path.join(targetDir, '.opencode', 'install-manifest.json')), false);
    });

    it('keeps a failed manifest and does not commit when verification fails', async (t) => {
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-verify-fail-'));
        const targetDir = path.join(parentDir, 'project');
        const superpowersPath = path.join(parentDir, 'superpowers', 'skills');
        const calls = [];
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(path.dirname(superpowersPath), 'package.json'), JSON.stringify({ version: '6.1.1' }));
        const runner = {
            run(program, args) {
                calls.push([program, args]);
                if (args[0] === 'templates') {
                    return { code: 0, stdout: JSON.stringify(Array.from({ length: 8 }, () => ({ source: 'project' }))), stderr: '' };
                }
                if (args[0] === 'status') return { code: 1, stdout: '', stderr: 'status failed' };
                return { code: 0, stdout: '1.0.0', stderr: '' };
            },
        };

        const result = await require('../lib/setup').initProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            superpowersPath,
            runner,
        });

        assert.equal(result.success, false);
        const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, '.opencode', 'install-manifest.json'), 'utf8'));
        assert.equal(manifest.verification, 'failed');
        assert.equal(calls.some(([program]) => program === 'git'), false);
    });

    it('does not prompt for brownfield files that do not exist', async (t) => {
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-brown-dry-'));
        const targetDir = path.join(parentDir, 'project');
        const superpowersPath = path.join(parentDir, 'superpowers', 'skills');
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'user config');
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(path.dirname(superpowersPath), 'package.json'), JSON.stringify({ version: '6.1.1' }));

        const result = await require('../lib/setup').dryRunProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            superpowersPath,
            runner: { run: () => ({ code: 0, stdout: '1.0.0', stderr: '' }) },
            env: { BROWN_OVERRIDE_INIT: 'yes', BROWN_OVERRIDE_OPENSPEC: 'no' },
            prompt: async question => {
                throw new Error(`unexpected prompt: ${question}`);
            },
        });

        assert.equal(result.projectKind, 'brownfield');
    });

    it('collects per-file command decisions when the brownfield mode is ask', async (t) => {
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-brown-ask-'));
        const targetDir = path.join(parentDir, 'project');
        const superpowersPath = path.join(parentDir, 'superpowers', 'skills');
        const existingCommand = path.join(targetDir, '.opencode', 'commands', 'opsx-ff.md');
        const prompts = [];
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'user config');
        fs.mkdirSync(path.dirname(existingCommand), { recursive: true });
        fs.writeFileSync(existingCommand, 'user command');
        fs.mkdirSync(superpowersPath, { recursive: true });
        fs.writeFileSync(path.join(path.dirname(superpowersPath), 'package.json'), JSON.stringify({ version: '6.1.1' }));

        const result = await require('../lib/setup').dryRunProject({
            targetDir,
            templateDir: path.resolve(__dirname, '..', 'template'),
            superpowersPath,
            runner: { run: () => ({ code: 0, stdout: '1.0.0', stderr: '' }) },
            env: {
                BROWN_OVERRIDE_INIT: 'yes',
                BROWN_OVERRIDE_OPENSPEC: 'no',
                BROWN_OVERRIDE_COMMANDS: 'ask',
            },
            prompt: async question => {
                prompts.push(question);
                return 'yes';
            },
        });
        const operation = result.operations.find(candidate => candidate.target === existingCommand);

        assert.equal(operation.type, 'write');
        assert.equal(prompts.length, 1);
    });
});
