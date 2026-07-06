const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const registryUtils = require('../lib/registry-utils');

/** 创建临时项目目录 */
function tmpProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-utils-test-'));
    const regDir = path.join(dir, 'openspec');
    fs.mkdirSync(regDir, { recursive: true });
    return dir;
}

/** 创建 openspec/changes.json */
function writeRegistry(dir, data) {
    const p = path.join(dir, 'openspec', 'changes.json');
    fs.writeFileSync(p, JSON.stringify(data));
    return p;
}

// ============================================================
// findProjectRoot()
// ============================================================
describe('findProjectRoot()', () => {
    test('finds root when in project root', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [] });
        assert.strictEqual(registryUtils.findProjectRoot(dir), dir);
    });

    test('finds root from subdirectory', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [] });
        const subDir = path.join(dir, 'src', 'components');
        fs.mkdirSync(subDir, { recursive: true });
        assert.strictEqual(registryUtils.findProjectRoot(subDir), dir);
    });

    test('returns null when outside project', () => {
        const dir = tmpProject();
        const result = registryUtils.findProjectRoot(dir);
        assert.strictEqual(result, null);
    });

    test('returns null when changes.json is in a parent that does not exist', () => {
        const dir = tmpProject();
        const deepDir = path.join(dir, 'a', 'b', 'c');
        fs.mkdirSync(deepDir, { recursive: true });
        const result = registryUtils.findProjectRoot(deepDir);
        assert.strictEqual(result, null);
    });

    test('stops at filesystem root boundary', () => {
        const result = registryUtils.findProjectRoot(os.tmpdir());
        assert.ok(result === null || typeof result === 'string');
    });

    test('finds root when changes.json only contains whitespace', () => {
        const dir = tmpProject();
        const regPath = path.join(dir, 'openspec', 'changes.json');
        fs.writeFileSync(regPath, '   ');
        const result = registryUtils.findProjectRoot(dir);
        assert.strictEqual(result, dir);
    });
});

// ============================================================
// readRegistry()
// ============================================================
describe('readRegistry()', () => {
    test('returns changes array from valid registry', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }] });
        const rp = path.join(dir, 'openspec', 'changes.json');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 1);
        assert.strictEqual(result.changes[0].name, 'demo');
    });

    test('returns empty changes on file not found', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'changes.json');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 0);
    });

    test('returns empty changes on corrupted JSON', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'changes.json');
        fs.writeFileSync(rp, '{invalid json!!!');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 0);
    });

    test('returns empty changes on empty file', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'changes.json');
        fs.writeFileSync(rp, '');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 0);
    });
});

// ============================================================
// mergeList()
// ============================================================
describe('mergeList()', () => {
    test('returns empty string when no entries', () => {
        const result = registryUtils.mergeList([], '/some/project');
        assert.strictEqual(result, '');
    });

    test('returns "No active changes" when no worktrees exist', () => {
        const dir = tmpProject();
        const result = registryUtils.mergeList([
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);
        assert.strictEqual(result, 'No active changes found.\n');
    });

    test('aggregates entries from each worktree', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-b'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            const cwd = opts.cwd;
            if (cwd.endsWith('feature-a')) {
                return 'Changes:\n  feature-a    Proposal    2 tasks    2m ago\n';
            }
            if (cwd.endsWith('feature-b')) {
                return 'Changes:\n  feature-b    Proposal    1 task     1h ago\n';
            }
            return '';
        });

        const result = registryUtils.mergeList([
            { name: 'feature-a', worktree: '.worktrees/feature-a' },
            { name: 'feature-b', worktree: '.worktrees/feature-b' }
        ], dir);

        assert.ok(result.startsWith('Changes:'));
        assert.ok(result.includes('feature-a'));
        assert.ok(result.includes('feature-b'));
        assert.ok(result.includes('Proposal'));  // 来自 worktree 的真实状态
    });

    test('deduplicates by name (first wins)', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => 'Changes:\n  feature-a    2 tasks   5m ago\n');

        const result = registryUtils.mergeList([
            { name: 'feature-a', worktree: '.worktrees/feature-a' },
            { name: 'feature-a', worktree: '.worktrees/feature-a-dup' }
        ], dir);

        const featureLines = result.split('\n').filter(l => l.includes('feature-a') && !l.startsWith('Changes'));
        assert.strictEqual(featureLines.length, 1);
    });

    test('skips worktree when directory missing', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'live'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            if (opts.cwd.includes('live')) {
                return 'Changes:\n  live    1 task    1m ago\n';
            }
            return '';
        });

        const result = registryUtils.mergeList([
            { name: 'live', worktree: '.worktrees/live' },
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);

        assert.ok(result.includes('live'));
        assert.ok(!result.includes('ghost'));
    });

    test('handles worktree with no active changes output', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'empty'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => 'No active changes.\n');

        const result = registryUtils.mergeList([
            { name: 'empty', worktree: '.worktrees/empty' }
        ], dir);

        assert.strictEqual(result, 'No active changes found.\n');
    });

    test('handles execSync failure gracefully', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'broken'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => { throw { status: 1, stdout: '' }; });

        const result = registryUtils.mergeList([
            { name: 'broken', worktree: '.worktrees/broken' }
        ], dir);

        assert.strictEqual(result, 'No active changes found.\n');
    });
});
