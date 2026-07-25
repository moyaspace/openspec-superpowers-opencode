const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('verifyProject', () => {
    it('parses structured template, change list, and status output', () => {
        const { changeListed, parseStatusOutput, parseTemplateOutput } = require('../lib/setup/verify');
        const templates = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
            `template-${index}`,
            { source: 'project' },
        ]));

        assert.deepEqual(parseTemplateOutput(JSON.stringify(templates)), { ok: true, count: 8 });
        assert.equal(changeListed(JSON.stringify({ changes: [{ name: 'feature-a' }] }), 'feature-a'), true);
        assert.deepEqual(
            parseStatusOutput(JSON.stringify({ artifacts: Array.from({ length: 8 }, () => ({})) })),
            { ok: true, count: 8 },
        );
    });

    it('cleans a uniquely named change in finally after a later failure', async () => {
        const { verifyProject } = require('../lib/setup/verify');
        const calls = [];
        const cleaned = [];
        let createdName;
        const runner = {
            run(program, args) {
                calls.push([program, args]);
                const command = args.join(' ');
                if (command.startsWith('schema validate')) return { code: 0, stdout: '', stderr: '' };
                if (command.startsWith('templates')) {
                    return { code: 0, stdout: JSON.stringify(Array.from({ length: 8 }, (_, index) => ({ id: index, source: 'project' }))), stderr: '' };
                }
                if (command.startsWith('new change')) {
                    createdName = args[2];
                    return { code: 0, stdout: '', stderr: '' };
                }
                if (command === 'list --json') return { code: 0, stdout: JSON.stringify({ changes: [{ name: createdName }] }), stderr: '' };
                if (command.startsWith('status')) return { code: 1, stdout: '', stderr: 'failed' };
                return { code: 0, stdout: '', stderr: '' };
            },
        };

        const result = await verifyProject({
            targetDir: 'project',
            runner,
            uniquePart: () => '123-fixed',
            cleanup: name => cleaned.push(name),
        });

        const createCall = calls.find(([, args]) => args[0] === 'new');
        assert.equal(createCall[1][2], 'oso-verify-123-fixed');
        assert.equal(result.passed, false);
        assert.deepEqual(cleaned, ['oso-verify-123-fixed']);
    });
});
