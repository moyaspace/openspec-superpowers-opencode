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

    it('brownfield always preserves openspec/changes/ and openspec/specs/ even when openspec override is yes', (t) => {
        const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-plan-changes-'));
        const targetDir = path.join(parentDir, 'project');
        const fakeTemplate = path.join(parentDir, 'template');
        t.after(() => fs.rmSync(parentDir, { recursive: true, force: true }));

        // Target: brownfield dir with existing content
        fs.mkdirSync(path.join(targetDir, 'openspec', 'changes'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'changes', 'user-data.txt'), 'user data');
        fs.mkdirSync(path.join(targetDir, 'openspec', 'specs'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'openspec', 'specs', 'user-spec.md'), 'user spec');

        // Fake template: has files under openspec/changes/ and openspec/specs/
        fs.mkdirSync(path.join(fakeTemplate, 'openspec', 'changes', 'some-change'), { recursive: true });
        fs.writeFileSync(path.join(fakeTemplate, 'openspec', 'changes', 'some-change', 'brainstorm.md'), 'template content');
        fs.mkdirSync(path.join(fakeTemplate, 'openspec', 'specs'), { recursive: true });
        fs.writeFileSync(path.join(fakeTemplate, 'openspec', 'specs', 'template-spec.md'), 'template spec');
        // Also a normal openspec/ file
        fs.mkdirSync(path.join(fakeTemplate, 'openspec'), { recursive: true });
        fs.writeFileSync(path.join(fakeTemplate, 'openspec', 'config.yaml'), 'template config');
        // Minimal .opencode/ to avoid error
        fs.mkdirSync(path.join(fakeTemplate, '.opencode'), { recursive: true });
        fs.writeFileSync(path.join(fakeTemplate, '.opencode', 'opencode.json'), '{}');

        const context = createContext({ targetDir, templateDir: fakeTemplate, mode: 'init' });
        assert.equal(context.projectKind, 'brownfield');

        const plan = createInitPlan({
            ...context,
            lang: 'en',
            decisions: { openspec: 'yes' },
        });
        const changesOps = plan.operations.filter(op => {
            const rel = op.target ? path.relative(targetDir, op.target).replace(/\\/g, '/') : '';
            return rel.startsWith('openspec/changes/') || rel.startsWith('openspec/specs/');
        });
        for (const op of changesOps) {
            assert.equal(op.type, 'preserve', `expected preserve for ${path.relative(targetDir, op.target)}`);
        }
        // Normal openspec/ file still gets written when yes
        const configOp = plan.operations.find(op => {
            const rel = op.target ? path.relative(targetDir, op.target).replace(/\\/g, '/') : '';
            return rel === 'openspec/config.yaml';
        });
        assert.ok(configOp, 'openspec/config.yaml should be in plan');
        assert.notEqual(configOp.type, 'preserve', 'openspec/config.yaml should not be preserved when openspec=yes');
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
