const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const registryUtils = require('../lib/registry-utils');

/** 创建临时项目目录（含 git init） */
function tmpProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-utils-test-'));
    const regDir = path.join(dir, 'openspec');
    fs.mkdirSync(regDir, { recursive: true });
    child_process.execSync('git init --initial-branch=main', { cwd: dir, stdio: 'pipe' });
    return dir;
}

/** 创建 openspec/oso-change-registry.json */
function writeRegistry(dir, data) {
    const p = path.join(dir, 'openspec', 'oso-change-registry.json');
    fs.writeFileSync(p, JSON.stringify(data));
    return p;
}

/** 创建临时的非 git 目录 */
function tmpNotGit() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
}

// ============================================================
// mergeListJson()
// ============================================================
describe('mergeListJson()', () => {
    test('returns empty JSON when no entries', () => {
        const result = registryUtils.mergeListJson([], '/some/project');
        assert.strictEqual(result, '{"changes":[]}\n');
    });

    test('returns entry with null worktree when no worktrees exist', () => {
        const dir = tmpProject();
        const result = registryUtils.mergeListJson([
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);
        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 1);
        assert.strictEqual(parsed.changes[0].name, 'ghost');
        assert.strictEqual(parsed.changes[0].worktree, null);
    });

    test('aggregates JSON changes from each worktree', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-b'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            const cwd = opts.cwd;
            if (cwd.endsWith('feature-a')) {
                return Buffer.from(JSON.stringify({
                    changes: [
                        { name: 'feature-a', completedTasks: 2, totalTasks: 5, lastModified: '2026-07-08T12:00:00.000Z', status: 'in-progress' }
                    ]
                }));
            }
            if (cwd.endsWith('feature-b')) {
                return Buffer.from(JSON.stringify({
                    changes: [
                        { name: 'feature-b', completedTasks: 0, totalTasks: 3, lastModified: '2026-07-09T12:00:00.000Z', status: 'no-tasks' }
                    ]
                }));
            }
            return Buffer.from(JSON.stringify({ changes: [] }));
        });

        const result = registryUtils.mergeListJson([
            { name: 'feature-a', worktree: '.worktrees/feature-a' },
            { name: 'feature-b', worktree: '.worktrees/feature-b' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.ok(Array.isArray(parsed.changes));
        assert.strictEqual(parsed.changes.length, 2);
        assert.strictEqual(parsed.changes[0].name, 'feature-a');
        assert.strictEqual(parsed.changes[0].worktree, '.worktrees/feature-a');
        assert.strictEqual(parsed.changes[1].name, 'feature-b');
        assert.strictEqual(parsed.changes[1].worktree, '.worktrees/feature-b');
    });

    test('deduplicates by name (first wins)', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => Buffer.from(JSON.stringify({
            changes: [
                { name: 'feature-a', completedTasks: 1, totalTasks: 2, lastModified: '2026-07-08T12:00:00.000Z', status: 'in-progress' }
            ]
        })));

        const result = registryUtils.mergeListJson([
            { name: 'feature-a', worktree: '.worktrees/feature-a' },
            { name: 'feature-a', worktree: '.worktrees/feature-a-dup' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 1);
    });

    test('preserves ghost entry and merges live entry', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'live'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            if (opts.cwd.includes('live')) {
                return Buffer.from(JSON.stringify({
                    changes: [{ name: 'live', completedTasks: 1, totalTasks: 1, lastModified: '2026-07-08T12:00:00.000Z', status: 'done' }]
                }));
            }
            return Buffer.from(JSON.stringify({ changes: [] }));
        });

        const result = registryUtils.mergeListJson([
            { name: 'live', worktree: '.worktrees/live' },
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 2);
        assert.strictEqual(parsed.changes[0].name, 'live');
        assert.strictEqual(parsed.changes[0].worktree, '.worktrees/live');
        assert.strictEqual(parsed.changes[1].name, 'ghost');
        assert.strictEqual(parsed.changes[1].worktree, null);
    });

    test('handles execSync failure gracefully', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'broken'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => { throw { status: 1 }; });

        const result = registryUtils.mergeListJson([
            { name: 'broken', worktree: '.worktrees/broken' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 1);
        assert.strictEqual(parsed.changes[0].name, 'broken');
        assert.strictEqual(parsed.changes[0].worktree, null);
    });

    // ---- Bug fix tests ----

    test('preserves entry with null worktree when worktree dir missing', () => {
        const dir = tmpProject();
        const result = registryUtils.mergeListJson([
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);
        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 1);
        assert.strictEqual(parsed.changes[0].name, 'ghost');
        assert.strictEqual(parsed.changes[0].worktree, null);
    });

    test('filters changes by entry name from worktree, Phase ② picks up extra from root', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'project-setup'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => Buffer.from(JSON.stringify({
            changes: [
                { name: 'project-setup', completedTasks: 23, totalTasks: 23, lastModified: '2026-07-17T06:44:06.594Z', status: 'complete' },
                { name: 'project-scaffold', completedTasks: 0, totalTasks: 0, lastModified: '2026-07-16T16:07:09.903Z', status: 'no-tasks' }
            ]
        })));

        const result = registryUtils.mergeListJson([
            { name: 'project-setup', worktree: '.worktrees/project-setup' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 2);
        assert.strictEqual(parsed.changes[0].name, 'project-setup');
        assert.strictEqual(parsed.changes[0].worktree, '.worktrees/project-setup');
        assert.strictEqual(parsed.changes[1].name, 'project-scaffold');
        assert.strictEqual(parsed.changes[1].worktree, '.');
    });

    test('Phase ② picks up extra change from root openspec-orig not in registry', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            if (opts.cwd.endsWith('feature-a')) {
                return Buffer.from(JSON.stringify({
                    changes: [{ name: 'feature-a', completedTasks: 1, totalTasks: 3, lastModified: '2026-07-17T00:00:00.000Z', status: 'in-progress' }]
                }));
            }
            // 根目录返回额外 change
            return Buffer.from(JSON.stringify({
                changes: [{ name: 'root-only-change', completedTasks: 0, totalTasks: 0, lastModified: '2026-07-16T00:00:00.000Z', status: 'no-tasks' }]
            }));
        });

        const result = registryUtils.mergeListJson([
            { name: 'feature-a', worktree: '.worktrees/feature-a' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 2);
        assert.strictEqual(parsed.changes[0].name, 'feature-a');
        assert.strictEqual(parsed.changes[0].worktree, '.worktrees/feature-a');
        assert.strictEqual(parsed.changes[1].name, 'root-only-change');
        assert.strictEqual(parsed.changes[1].worktree, '.');
    });

    test('Phase ② skips root change when already seen (first wins from registry)', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            if (opts.cwd.endsWith('feature-a')) {
                return Buffer.from(JSON.stringify({
                    changes: [{ name: 'feature-a', completedTasks: 1, totalTasks: 3, lastModified: '2026-07-17T00:00:00.000Z', status: 'in-progress' }]
                }));
            }
            // 根目录也存在同名 change，但不应该被加入（first wins）
            return Buffer.from(JSON.stringify({
                changes: [
                    { name: 'feature-a', completedTasks: 99, totalTasks: 999, lastModified: '2026-07-15T00:00:00.000Z', status: 'stale' }
                ]
            }));
        });

        const result = registryUtils.mergeListJson([
            { name: 'feature-a', worktree: '.worktrees/feature-a' }
        ], dir);

        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.changes.length, 1);
        assert.strictEqual(parsed.changes[0].name, 'feature-a');
        assert.strictEqual(parsed.changes[0].worktree, '.worktrees/feature-a');
        assert.strictEqual(parsed.changes[0].completedTasks, 1);  // 来自 worktree，不是 root 的 99
    });
});

// ============================================================
// findProjectRoot()
// ============================================================
describe('findProjectRoot()', () => {
    test('finds root when in project root', () => {
        const dir = tmpProject();
        assert.strictEqual(registryUtils.findProjectRoot(dir), dir);
    });

    test('finds root from subdirectory', () => {
        const dir = tmpProject();
        const subDir = path.join(dir, 'src', 'components');
        fs.mkdirSync(subDir, { recursive: true });
        assert.strictEqual(registryUtils.findProjectRoot(subDir), dir);
    });

    test('returns null when outside git repo', () => {
        const dir = tmpNotGit();
        const result = registryUtils.findProjectRoot(dir);
        assert.strictEqual(result, null);
    });
});

// ============================================================
// getChangeRegistryPath()
// ============================================================
describe('getChangeRegistryPath()', () => {
    test('returns registry path when in project root', () => {
        const dir = tmpProject();
        const expected = path.join(dir, 'openspec', 'oso-change-registry.json');
        assert.strictEqual(registryUtils.getChangeRegistryPath(dir), expected);
    });

    test('returns null when outside git repo', () => {
        const dir = tmpNotGit();
        assert.strictEqual(registryUtils.getChangeRegistryPath(dir), null);
    });
});

// ============================================================
// readRegistry()
// ============================================================
describe('readRegistry()', () => {
    test('returns changes array from valid registry', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }] });
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 1);
        assert.strictEqual(result.changes[0].name, 'demo');
    });

    test('returns empty changes on file not found', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 0);
    });

    test('returns empty changes on corrupted JSON', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        fs.writeFileSync(rp, '{invalid json!!!');
        const result = registryUtils.readRegistry(rp);
        assert.ok(Array.isArray(result.changes));
        assert.strictEqual(result.changes.length, 0);
    });

    test('returns empty changes on empty file', () => {
        const dir = tmpProject();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
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
    test('returns No active changes when no entries', () => {
        const result = registryUtils.mergeList([], '/some/project');
        assert.strictEqual(result, 'No active changes found.\n');
    });

    test('shows ghost entry when no worktrees exist', () => {
        const dir = tmpProject();
        const result = registryUtils.mergeList([
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);
        assert.ok(result.includes('ghost'));
        assert.ok(result.includes('(no worktree)'));
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

    test('preserves ghost entry and shows live entry (text)', (t) => {
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
        assert.ok(result.includes('ghost'));
        assert.ok(result.includes('(no worktree)'));
    });

    test('shows entry when worktree returns no active changes', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'empty'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => 'No active changes.\n');

        const result = registryUtils.mergeList([
            { name: 'empty', worktree: '.worktrees/empty' }
        ], dir);

        assert.ok(result.includes('empty'));
        assert.ok(result.includes('(no worktree)'));
    });

    test('handles execSync failure gracefully', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'broken'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => { throw { status: 1, stdout: '' }; });

        const result = registryUtils.mergeList([
            { name: 'broken', worktree: '.worktrees/broken' }
        ], dir);

        assert.ok(result.includes('broken'));
        assert.ok(result.includes('(no worktree)'));
    });

    // ---- Bug fix tests ----

    test('preserves entry with null worktree when worktree dir missing (text)', () => {
        const dir = tmpProject();
        const result = registryUtils.mergeList([
            { name: 'ghost', worktree: '.worktrees/ghost' }
        ], dir);
        assert.ok(result.includes('ghost'));
        assert.ok(result.includes('(no worktree)'));
    });

    test('filters changes by entry name (text), Phase ② picks up extra from root', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'project-setup'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => 'Changes:\n  project-setup    23 tasks    1m ago\n  project-scaffold    0 tasks    1d ago\n');

        const result = registryUtils.mergeList([
            { name: 'project-setup', worktree: '.worktrees/project-setup' }
        ], dir);

        const lines = result.split('\n').filter(l => l.includes('project-'));
        assert.strictEqual(lines.length, 2);
        assert.ok(lines[0].includes('project-setup'));
        assert.ok(lines[1].includes('project-scaffold'));
    });

    test('Phase ② picks up extra change from root openspec-orig not in registry (text)', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', (cmd, opts) => {
            if (opts.cwd.endsWith('feature-a')) {
                return 'Changes:\n  feature-a    3 tasks    1m ago\n';
            }
            return 'Changes:\n  root-only-change    0 tasks    1d ago\n';
        });

        const result = registryUtils.mergeList([
            { name: 'feature-a', worktree: '.worktrees/feature-a' }
        ], dir);

        assert.ok(result.includes('feature-a'));
        assert.ok(result.includes('root-only-change'));
    });

    test('Phase ② skips root change when already seen (text, first wins from registry)', (t) => {
        const dir = tmpProject();
        fs.mkdirSync(path.join(dir, '.worktrees', 'feature-a'), { recursive: true });

        t.mock.method(child_process, 'execSync', () => 'Changes:\n  feature-a    1 task     1m ago\n');

        const result = registryUtils.mergeList([
            { name: 'feature-a', worktree: '.worktrees/feature-a' }
        ], dir);

        const lines = result.split('\n').filter(l => l.includes('feature-a') && !l.startsWith('Changes'));
        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('.worktrees/feature-a'));  // 来自 worktree，非根目录
    });
});

// ============================================================
// handleList()
// ============================================================
describe('handleList()', () => {
    test('returns passthrough when registry path is null', () => {
        const result = registryUtils.handleList(null, '/some/dir');
        assert.deepStrictEqual(result, { action: 'passthrough' });
    });

    test('returns passthrough when project root is null', () => {
        const result = registryUtils.handleList('/some/registry.json', null);
        assert.deepStrictEqual(result, { action: 'passthrough' });
    });

    test('returns passthrough when project root is null and path is null', () => {
        const result = registryUtils.handleList(null, null);
        assert.deepStrictEqual(result, { action: 'passthrough' });
    });

    test('returns passthrough when registry file does not exist on disk', () => {
        const dir = tmpProject();
        const regPath = path.join(dir, 'openspec', 'oso-change-registry.json');
        // Ensure it doesn't exist
        if (fs.existsSync(regPath)) fs.unlinkSync(regPath);
        assert.strictEqual(fs.existsSync(regPath), false);

        const result = registryUtils.handleList(regPath, dir);
        assert.deepStrictEqual(result, { action: 'passthrough' });
    });

    test('returns merge when registry exists and has entries', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }] });
        const regPath = path.join(dir, 'openspec', 'oso-change-registry.json');

        const result = registryUtils.handleList(regPath, dir);
        assert.strictEqual(result.action, 'merge');
        assert.ok(Array.isArray(result.data.changes));
        assert.strictEqual(result.data.changes.length, 1);
    });

    test('returns merge when registry exists and is empty', () => {
        const dir = tmpProject();
        writeRegistry(dir, { changes: [] });
        const regPath = path.join(dir, 'openspec', 'oso-change-registry.json');

        const result = registryUtils.handleList(regPath, dir);
        assert.strictEqual(result.action, 'merge');
        assert.strictEqual(result.data.changes.length, 0);
    });
});
