import { resetProject } from '../dist/setup/index.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('resetProject', () => {
    it('deletes manifest-owned files but preserves user data and protected files', async (t) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-reset-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        for (const relative of ['managed.txt', '.opencode/commands/managed.md', 'AGENTS.md', 'openspec/specs/user.md']) {
            const target = path.join(root, ...relative.split('/'));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, relative);
        }
        const manifestPath = path.join(root, '.opencode', 'install-manifest.json');
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(manifestPath, JSON.stringify({
            project: 'openspec-superpowers-opencode',
            files: ['managed.txt', '.opencode/commands/managed.md', 'AGENTS.md', 'openspec/specs/user.md'],
        }));

        const result = await resetProject({ targetDir: root, prompt: async () => 'yes' });

        assert.equal(result.success, true);
        assert.equal(fs.existsSync(path.join(root, 'managed.txt')), false);
        assert.equal(fs.existsSync(path.join(root, '.opencode', 'commands')), false);
        assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), true);
        assert.equal(fs.existsSync(path.join(root, 'openspec', 'specs', 'user.md')), true);
        assert.equal(fs.existsSync(manifestPath), false);
    });

    it('refuses to delete through a directory symlink', async (t) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-reset-link-root-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-reset-link-outside-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
        fs.writeFileSync(path.join(outside, 'victim.txt'), 'keep');
        try {
            fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) {
            if (error.code === 'EPERM') return t.skip('directory symlinks are unavailable');
            throw error;
        }
        fs.mkdirSync(path.join(root, '.opencode'), { recursive: true });
        fs.writeFileSync(path.join(root, '.opencode', 'install-manifest.json'), JSON.stringify({
            project: 'openspec-superpowers-opencode',
            files: ['linked/victim.txt'],
        }));

        await assert.rejects(
            resetProject({ targetDir: root, prompt: async () => 'yes' }),
            /symbolic link/i,
        );
        assert.equal(fs.readFileSync(path.join(outside, 'victim.txt'), 'utf8'), 'keep');
    });
});
