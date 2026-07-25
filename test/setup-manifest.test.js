const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

describe('setup manifest paths', () => {
    it('normalizes legacy Windows separators to portable paths', () => {
        const { normalizeManifestPath } = require('../lib/setup/manifest');

        assert.equal(normalizeManifestPath('.opencode\\commands\\opsx-ff.md'), '.opencode/commands/opsx-ff.md');
    });

    it('rejects absolute and parent-traversal paths', () => {
        const { normalizeManifestPath } = require('../lib/setup/manifest');

        for (const unsafe of ['/tmp/file', 'C:\\temp\\file', '../file', 'a/../../file']) {
            assert.throws(() => normalizeManifestPath(unsafe), /unsafe manifest path/i);
        }
    });

    it('resolves a normalized path inside the project root', () => {
        const { resolveManifestTarget } = require('../lib/setup/manifest');
        const root = path.resolve('project-root');

        assert.equal(
            resolveManifestTarget(root, 'openspec\\config.yaml'),
            path.join(root, 'openspec', 'config.yaml'),
        );
    });

    it('records overwrite and skip decisions from the production plan', () => {
        const { buildManifest } = require('../lib/setup/manifest');
        const root = path.resolve('project-root');

        const manifest = buildManifest({
            projectRoot: root,
            language: 'en',
            operations: [
                { type: 'write', target: path.join(root, 'managed.txt'), decision: 'overwrite' },
                { type: 'preserve', target: path.join(root, 'user.txt'), decision: 'skip' },
            ],
        });

        assert.deepEqual(manifest.overwriteDecisions, {
            'managed.txt': 'overwrite',
            'user.txt': 'skip',
        });
    });
});
