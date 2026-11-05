import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

const { evaluateWorktreeReady } = await import('../dist/cli/index.js');

const repoRoot = path.join(os.tmpdir(), 'oso-eval-repo');
const targetDir = path.join(repoRoot, '.worktrees', 'demo');
const branch = 'feature/demo';
const commonDir = path.join(repoRoot, '.git');

function isShowToplevel(args) {
    return args.includes('--show-toplevel');
}

function isHeadBranch(args) {
    return args.includes('--abbrev-ref');
}

function isCommonDir(args) {
    return args.includes('--git-common-dir');
}

describe('evaluateWorktreeReady', () => {
    test('reports all three failing checks when root, branch, and common-dir are wrong', () => {
        const readGit = (_dir, args) => {
            if (isShowToplevel(args)) return path.join(repoRoot, 'elsewhere');
            if (isHeadBranch(args)) return 'other';
            if (isCommonDir(args)) return path.join(repoRoot, 'other-git');
            return null;
        };

        const failures = evaluateWorktreeReady(targetDir, branch, repoRoot, readGit);

        assert.deepEqual(
            failures.map((failure) => failure.check).sort(),
            ['branch', 'git-common-dir', 'show-toplevel']
        );
        assert.equal(failures.find((failure) => failure.check === 'branch')?.detail, 'other');
    });

    test('returns an empty array when all three checks pass', () => {
        const readGit = (_dir, args) => {
            if (isShowToplevel(args)) return targetDir;
            if (isHeadBranch(args)) return branch;
            if (isCommonDir(args)) return commonDir;
            return null;
        };

        assert.deepEqual(evaluateWorktreeReady(targetDir, branch, repoRoot, readGit), []);
    });

    test('reads the common dir with --path-format=absolute first', () => {
        const commonCalls = [];
        const readGit = (_dir, args) => {
            if (isShowToplevel(args)) return targetDir;
            if (isHeadBranch(args)) return branch;
            if (isCommonDir(args)) {
                commonCalls.push([...args]);
                return commonDir;
            }
            return null;
        };

        assert.deepEqual(evaluateWorktreeReady(targetDir, branch, repoRoot, readGit), []);
        assert.equal(commonCalls.length, 1);
        assert.ok(commonCalls[0].includes('--path-format=absolute'));
    });

    test('falls back to the legacy common-dir call when the absolute form is unsupported', () => {
        const commonCalls = [];
        const readGit = (_dir, args) => {
            if (isShowToplevel(args)) return targetDir;
            if (isHeadBranch(args)) return branch;
            if (isCommonDir(args)) {
                commonCalls.push([...args]);
                if (args.includes('--path-format=absolute')) return null;
                return path.relative(targetDir, commonDir);
            }
            return null;
        };

        assert.deepEqual(evaluateWorktreeReady(targetDir, branch, repoRoot, readGit), []);
        assert.equal(commonCalls.length, 2);
        assert.ok(commonCalls[0].includes('--path-format=absolute'));
        assert.equal(commonCalls[1].includes('--path-format=absolute'), false);
    });
});
