const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const verify = require('../lib/verify');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
}

// ============================================================
// findOpenspec()
// ============================================================
describe('findOpenspec()', () => {
    test('returns path when openspec found', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec');
        assert.strictEqual(verify.findOpenspec(false), '/usr/local/bin/openspec');
    });

    test('returns null when openspec not in PATH', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });
        assert.strictEqual(verify.findOpenspec(false), null);
    });

    test('takes first line when multiple results', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec\n/home/user/.local/bin/openspec');
        assert.strictEqual(verify.findOpenspec(false), '/usr/local/bin/openspec');
    });
});

// ============================================================
// findOpenspecOrig()
// ============================================================
describe('findOpenspecOrig()', () => {
    test('finds openspec-orig when exists (unix priority)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig'), '');
        assert.strictEqual(verify.findOpenspecOrig(dir, false), path.join(dir, 'openspec-orig'));
    });

    test('finds openspec-orig.cmd on Windows', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.cmd'), '');
        assert.strictEqual(verify.findOpenspecOrig(dir, true), path.join(dir, 'openspec-orig.cmd'));
    });

    test('finds openspec-orig.ps1 when .cmd absent', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.ps1'), '');
        assert.strictEqual(verify.findOpenspecOrig(dir, true), path.join(dir, 'openspec-orig.ps1'));
    });

    test('returns null when no openspec-orig variants exist', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'random-file'), '');
        assert.strictEqual(verify.findOpenspecOrig(dir, false), null);
    });

    test('returns null on empty dir', () => {
        const dir = tmpDir();
        assert.strictEqual(verify.findOpenspecOrig(dir, false), null);
    });
});

// ============================================================
// isShimScript()
// ============================================================
describe('isShimScript()', () => {
    test('returns true when first line contains shim marker', () => {
        const dir = tmpDir();
        const fp = path.join(dir, 'openspec');
        fs.writeFileSync(fp, '#!/bin/sh\n# openspec shim for oso registry\n...');
        assert.strictEqual(verify.isShimScript(fp), true);
    });

    test('returns false when first line lacks marker', () => {
        const dir = tmpDir();
        const fp = path.join(dir, 'openspec');
        fs.writeFileSync(fp, '#!/bin/sh\necho "real openspec"');
        assert.strictEqual(verify.isShimScript(fp), false);
    });

    test('returns false on non-existent file', () => {
        assert.strictEqual(verify.isShimScript(path.join(os.tmpdir(), 'nonexistent-xxx')), false);
    });

    test('returns false on empty file', () => {
        const dir = tmpDir();
        const fp = path.join(dir, 'openspec');
        fs.writeFileSync(fp, '');
        assert.strictEqual(verify.isShimScript(fp), false);
    });
});

// ============================================================
// checkRegistryFile()
// ============================================================
describe('checkRegistryFile()', () => {
    test('returns valid with count when oso-change-registry.json has entries', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({ changes: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }));
        const r = verify.checkRegistryFile(dir);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.count, 3);
        assert.strictEqual(r.error, null);
    });

    test('returns valid with zero count when changes array is empty', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({ changes: [] }));
        const r = verify.checkRegistryFile(dir);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.count, 0);
    });

    test('returns invalid when oso-change-registry.json does not exist', () => {
        const dir = tmpDir();
        const r = verify.checkRegistryFile(dir);
        assert.strictEqual(r.valid, false);
        assert.strictEqual(r.count, 0);
        assert.strictEqual(r.error, 'not found');
    });

    test('returns invalid on malformed JSON', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), 'not json {{{');
        const r = verify.checkRegistryFile(dir);
        assert.strictEqual(r.valid, false);
        assert.strictEqual(r.count, 0);
        assert.strictEqual(r.error, 'parse error');
    });
});

// ============================================================
// checkWorktrees()
// ============================================================
describe('checkWorktrees()', () => {
    test('returns valid when all worktree dirs exist', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.mkdirSync(path.join(dir, '.worktrees', 'demo'), { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({
            changes: [{ name: 'demo', worktree: '.worktrees/demo' }]
        }));
        const r = verify.checkWorktrees(dir);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.missing.length, 0);
    });

    test('reports missing worktree directories', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({
            changes: [
                { name: 'existing', worktree: '.worktrees/existing' },
                { name: 'missing', worktree: '.worktrees/missing' }
            ]
        }));
        // Only create existing/ dir
        fs.mkdirSync(path.join(dir, '.worktrees', 'existing'), { recursive: true });
        const r = verify.checkWorktrees(dir);
        assert.strictEqual(r.valid, false);
        assert.strictEqual(r.missing.length, 1);
        assert.strictEqual(r.missing[0].name, 'missing');
        assert.strictEqual(r.missing[0].worktree, '.worktrees/missing');
    });

    test('skips check when registry file is missing', () => {
        const dir = tmpDir();
        const r = verify.checkWorktrees(dir);
        assert.strictEqual(r.valid, false);
        assert.strictEqual(r.missing.length, 0);
    });

    test('handles corrupted registry gracefully', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), '{broken json');
        const r = verify.checkWorktrees(dir);
        assert.strictEqual(r.valid, false);
        assert.strictEqual(r.missing.length, 0);
    });

    test('returns valid when entry has no worktree path', () => {
        const dir = tmpDir();
        const regDir = path.join(dir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({
            changes: [{ name: 'nopath' }]
        }));
        const r = verify.checkWorktrees(dir);
        assert.strictEqual(r.valid, true);
        assert.strictEqual(r.missing.length, 0);
    });
});

// ============================================================
// runAllChecks()
// ============================================================
describe('runAllChecks()', () => {
    test('all 5 checks pass when everything is set up', (t) => {
        const projectDir = tmpDir();
        const binDir = path.join(projectDir, 'fake-bin');
        fs.mkdirSync(binDir, { recursive: true });

        const fakeOpenspecPath = path.join(binDir, 'openspec');
        t.mock.method(child_process, 'execSync', () => fakeOpenspecPath);

        // Check 3 passes: shim marker
        fs.writeFileSync(fakeOpenspecPath, '#!/bin/sh\n# openspec shim for oso registry\n...');
        // Check 2 passes: openspec-orig
        fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\n...');
        // Check 4 passes: valid oso-change-registry.json
        const regDir = path.join(projectDir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({ changes: [] }));
        // Check 5 passes: no worktree entries to check

        const results = verify.runAllChecks(null, false, projectDir);
        assert.strictEqual(results.length, 5);
        for (const r of results) {
            if (r.status === 'fail') {
                assert.fail(`Check "${r.check}" failed: ${r.message}`);
            }
        }
    });

    test('checks 4+5 are skipped when projectRoot is null', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec');
        // We can't create files in /usr/local/bin/, so checks 2+3 will fail
        // But 4+5 should be skipped
        const results = verify.runAllChecks(null, false, null);
        const skipped = results.filter(r => r.status === 'skip');
        assert.strictEqual(skipped.length, 2);
        assert.ok(skipped.every(r => r.check === 'oso-change-registry.json' || r.check === 'worktrees'));
    });

    test('checks 2+3 are skipped when openspec not found', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });
        const results = verify.runAllChecks(null, false, null);
        const skipped = results.filter(r => r.status === 'skip');
        assert.ok(skipped.some(r => r.check === 'openspec-orig'));
        assert.ok(skipped.some(r => r.check === 'openspec (shim)'));
    });

    test('check 5 reports missing worktrees correctly', (t) => {
        const projectDir = tmpDir();
        const binDir = path.join(projectDir, 'fake-bin');
        fs.mkdirSync(binDir, { recursive: true });
        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh\n# openspec shim for oso registry\n...');
        fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\n...');

        const regDir = path.join(projectDir, 'openspec');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, 'oso-change-registry.json'), JSON.stringify({
            changes: [{ name: 'ghost', worktree: '.worktrees/ghost' }]
        }));
        // Missing worktree causes check 5 to report failures
        const results = verify.runAllChecks(null, false, projectDir);
        const worktreeFail = results.filter(r => r.check.startsWith('worktree'));
        assert.strictEqual(worktreeFail.length, 1);
        assert.strictEqual(worktreeFail[0].status, 'fail');
    });
});

// ============================================================
// formatResults()
// ============================================================
describe('formatResults()', () => {
    test('formats pass with checkmark', () => {
        const output = verify.formatResults([
            { check: 'openspec', status: 'pass', message: 'installed at /usr/local/bin/openspec', fix: null }
        ]);
        assert.ok(output.includes('✓'));
        assert.ok(output.includes('openspec'));
        assert.ok(output.includes('installed'));
    });

    test('formats fail with warning icon and fix suggestion', () => {
        const output = verify.formatResults([
            { check: 'openspec-orig', status: 'fail', message: 'not found', fix: 'install-shims' }
        ]);
        assert.ok(output.includes('⚠'));
        assert.ok(output.includes('openspec-orig'));
        assert.ok(output.includes('修复'));
        assert.ok(output.includes('install-shims'));
    });

    test('formats skip with tilde icon', () => {
        const output = verify.formatResults([
            { check: 'worktrees', status: 'skip', message: 'not in a project', fix: null }
        ]);
        assert.ok(output.includes('∼'));
        assert.ok(output.includes('worktrees'));
    });

    test('handles multiple results with mixed status', () => {
        const output = verify.formatResults([
            { check: 'a', status: 'pass', message: 'ok', fix: null },
            { check: 'b', status: 'fail', message: 'broken', fix: 'fix b' },
            { check: 'c', status: 'skip', message: 'n/a', fix: null }
        ]);
        assert.ok(output.includes('✓'));
        assert.ok(output.includes('⚠'));
        assert.ok(output.includes('∼'));
    });
});

// ============================================================
// allPass()
// ============================================================
describe('allPass()', () => {
    test('returns true when all pass', () => {
        assert.strictEqual(verify.allPass([
            { status: 'pass' }, { status: 'pass' }
        ]), true);
    });

    test('returns true when all pass or skip', () => {
        assert.strictEqual(verify.allPass([
            { status: 'pass' }, { status: 'skip' }
        ]), true);
    });

    test('returns false when any fail', () => {
        assert.strictEqual(verify.allPass([
            { status: 'pass' }, { status: 'fail' }
        ]), false);
    });

    test('returns false when mixed with fail', () => {
        assert.strictEqual(verify.allPass([
            { status: 'pass' }, { status: 'skip' }, { status: 'fail' }
        ]), false);
    });

    test('returns true for empty array', () => {
        assert.strictEqual(verify.allPass([]), true);
    });
});
