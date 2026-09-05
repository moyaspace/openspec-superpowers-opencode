import { executeOperations } from '../dist/setup/deploy.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('executeOperations', () => {
    it('executes mkdir, copy, and atomic write operations inside the project', (t) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-deploy-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        const source = path.join(root, 'source.txt');
        fs.writeFileSync(source, 'source');

        executeOperations([
            { type: 'mkdir', path: path.join(root, 'nested') },
            { type: 'copy', source, target: path.join(root, 'nested', 'copied.txt') },
            { type: 'write', target: path.join(root, 'nested', 'written.txt'), content: 'written' },
        ], { projectRoot: root });

        assert.equal(fs.readFileSync(path.join(root, 'nested', 'copied.txt'), 'utf8'), 'source');
        assert.equal(fs.readFileSync(path.join(root, 'nested', 'written.txt'), 'utf8'), 'written');
        assert.deepEqual(fs.readdirSync(path.join(root, 'nested')).sort(), ['copied.txt', 'written.txt']);
    });

    it('rejects write targets outside the project root', (t) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-deploy-root-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));

        assert.throws(
            () => executeOperations([{ type: 'write', target: path.join(root, '..', 'escape'), content: '' }], { projectRoot: root }),
            /outside project root/i,
        );
    });

    it('rejects targets below a directory symlink', (t) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-deploy-link-root-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-deploy-link-outside-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
        const link = path.join(root, 'linked');
        try {
            fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) {
            if (error.code === 'EPERM') return t.skip('directory symlinks are unavailable');
            throw error;
        }

        const safeTarget = path.join(root, 'safe.txt');
        assert.throws(
            () => executeOperations([
                { type: 'write', target: safeTarget, content: 'must not be written' },
                { type: 'write', target: path.join(link, 'escape.txt'), content: 'unsafe' },
            ], { projectRoot: root }),
            /symbolic link/i,
        );
        assert.equal(fs.existsSync(safeTarget), false);
        assert.equal(fs.existsSync(path.join(outside, 'escape.txt')), false);
    });
});
