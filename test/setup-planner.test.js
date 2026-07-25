const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContext } = require('../lib/setup/context');
const { createInitPlan } = require('../lib/setup/planner');

describe('createInitPlan', () => {
    it('plans all greenfield template and managed files from one source', (t) => {
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-plan-'));
        const targetDir = path.join(parentDir, 'project');
        const templateDir = path.resolve(__dirname, '..', 'template');
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));
        const context = createContext({ targetDir, templateDir, mode: 'init' });

        const plan = createInitPlan({
            ...context,
            lang: 'en',
            superpowersPath: path.join(parentDir, 'superpowers', 'skills'),
            lockFile: path.join(templateDir, 'skills.lock.v6.json'),
        });
        const relativeTargets = plan.operations
            .map(operation => operation.target || operation.path)
            .filter(Boolean)
            .map(target => path.relative(targetDir, target).replace(/\\/g, '/') || '.');

        for (const expected of [
            '.',
            'skills.lock.json',
            'openspec/config.yaml',
            'openspec/changes/archive',
            'openspec/specs',
            '.opencode/opencode.json',
            '.opencode/commands/opsx-ff.md',
            'AGENTS.md',
            '.gitignore',
            '.gitattributes',
            '.editorconfig',
        ]) {
            assert.ok(relativeTargets.includes(expected), `missing plan target ${expected}`);
        }
    });

    it('preserves brownfield OpenSpec data and merges opencode.json according to decisions', (t) => {
        const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-brown-plan-'));
        const templateDir = path.resolve(__dirname, '..', 'template');
        t.after(() => fs.rmSync(targetDir, { recursive: true, force: true }));
        fs.mkdirSync(path.join(targetDir, 'openspec'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'config.yaml'), 'user config');
        fs.mkdirSync(path.join(targetDir, '.opencode'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, '.opencode', 'opencode.json'), JSON.stringify({
            customSetting: true,
            permission: { edit: { 'user/**': 'allow' } },
        }));
        const context = createContext({ targetDir, templateDir, mode: 'init' });

        const plan = createInitPlan({
            ...context,
            lang: 'en',
            decisions: { openspec: 'no', opencodeJson: 'yes', commands: 'no' },
        });
        const configOperation = plan.operations.find(operation => (
            (operation.target || operation.path) === path.join(targetDir, 'openspec', 'config.yaml')
        ));
        const opencodeOperation = plan.operations.find(operation => (
            operation.target === path.join(targetDir, '.opencode', 'opencode.json')
        ));

        assert.equal(configOperation.type, 'preserve');
        assert.equal(plan.operations.some(operation => operation.path === path.join(targetDir, 'openspec', 'specs')), false);
        const merged = JSON.parse(opencodeOperation.content);
        assert.equal(merged.customSetting, true);
        assert.equal(merged.permission.edit['user/**'], 'allow');
    });
});
