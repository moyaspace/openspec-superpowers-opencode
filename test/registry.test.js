const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// registry 模块（测试前还不存在——RED）
const registry = require('../lib/registry');

/** 创建临时目录用于每个测试 */
function tmpDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-test-'));
    return dir;
}

/** 创建 openspec/oso-change-registry.json 的辅助函数 */
function writeRegistry(dir, data) {
    const p = path.join(dir, 'openspec', 'oso-change-registry.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data));
    return p;
}

// ============================================================
// read()
// ============================================================
describe('read()', () => {
    test('returns empty registry when file does not exist', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        const result = registry.read(rp);
        assert.deepStrictEqual(result, { changes: [] });
    });

    test('returns empty registry when JSON is corrupted', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        fs.mkdirSync(path.dirname(rp), { recursive: true });
        fs.writeFileSync(rp, 'not json{{{');
        const result = registry.read(rp);
        assert.deepStrictEqual(result, { changes: [] });
    });

    test('returns parsed data when file is valid', () => {
        const dir = tmpDir();
        const data = { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: '2026-01-01T00:00:00.000Z' }] };
        const rp = writeRegistry(dir, data);
        const result = registry.read(rp);
        assert.deepStrictEqual(result, data);
    });
});

// ============================================================
// write()
// ============================================================
describe('write()', () => {
    test('creates file with correct content', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        const data = { changes: [] };
        registry.write(rp, data);
        assert.ok(fs.existsSync(rp));
        const parsed = JSON.parse(fs.readFileSync(rp, 'utf-8'));
        assert.deepStrictEqual(parsed, data);
    });

    test('creates parent directories if missing', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'a', 'b', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        assert.ok(fs.existsSync(rp));
    });

    test('overwrites existing file', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [{ name: 'old' }] });
        registry.write(rp, { changes: [{ name: 'new' }] });
        const parsed = JSON.parse(fs.readFileSync(rp, 'utf-8'));
        assert.strictEqual(parsed.changes[0].name, 'new');
    });
});

// ============================================================
// add()
// ============================================================
describe('add()', () => {
    test('adds a new entry', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        registry.add(rp, 'demo', '.worktrees/demo');
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 1);
        assert.strictEqual(data.changes[0].name, 'demo');
        assert.strictEqual(data.changes[0].worktree, '.worktrees/demo');
        assert.ok(data.changes[0].createdAt, 'should have createdAt timestamp');
    });

    test('overwrites entry with same name', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        registry.add(rp, 'demo', '.worktrees/demo');
        registry.add(rp, 'demo', '.worktrees/demo-v2');
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 1);
        assert.strictEqual(data.changes[0].worktree, '.worktrees/demo-v2');
    });

    test('adds multiple entries with different names', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        registry.add(rp, 'a', '.worktrees/a');
        registry.add(rp, 'b', '.worktrees/b');
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 2);
    });
});

// ============================================================
// remove()
// ============================================================
describe('remove()', () => {
    test('removes an entry by name', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: 'x' }] });
        registry.remove(rp, 'demo');
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
    });

    test('keeps file after removing all entries', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: 'x' }] });
        registry.remove(rp, 'demo');
        assert.ok(fs.existsSync(rp), 'file should still exist');
    });

    test('does nothing when name not found', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [{ name: 'a', worktree: '.worktrees/a', createdAt: 'x' }] });
        registry.remove(rp, 'nonexistent');
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 1);
    });
});



// ============================================================
// list()
// ============================================================
describe('list()', () => {
    test('returns "No active changes." when empty', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        const output = registry.list(rp);
        assert.ok(output.includes('No active changes found'));
    });

    test('includes name, worktree, and time for each entry', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [
            { name: 'demo', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }
        ]});
        const output = registry.list(rp);
        assert.ok(output.startsWith('Changes:'));
        assert.ok(output.includes('demo'));
        assert.ok(output.includes('.worktrees/demo'));
        assert.ok(output.includes('ago') || output.includes('just now'));
    });

    test('handles multiple entries', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [
            { name: 'a', worktree: '.worktrees/a', createdAt: '2026-01-01T00:00:00.000Z' },
            { name: 'b', worktree: '.worktrees/b', createdAt: '2026-01-02T00:00:00.000Z' }
        ]});
        const output = registry.list(rp);
        assert.ok(output.startsWith('Changes:'));
        assert.ok(output.includes('a'));
        assert.ok(output.includes('b'));
        assert.ok(output.includes('.worktrees/b'));
    });
});

// ============================================================
// reset()
// ============================================================
describe('reset()', () => {
    test('clears changes and creates .bak when backup=true', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [{ name: 'demo', worktree: '.worktrees/demo', createdAt: 'x' }] });
        const result = registry.reset(rp, true);
        assert.strictEqual(result.changesCount, 1);
        assert.ok(result.backupPath.endsWith('.bak'));
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
        const bak = JSON.parse(fs.readFileSync(result.backupPath, 'utf-8'));
        assert.strictEqual(bak.changes.length, 1);
        assert.strictEqual(bak.changes[0].name, 'demo');
    });

    test('backup defaults to true when omitted', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [{ name: 'demo', status: 'created', worktree: '.worktrees/demo', createdAt: 'x' }] });
        registry.reset(rp);
        assert.ok(fs.existsSync(rp + '.bak'));
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
    });

    test('does not create .bak when backup=false', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [{ name: 'demo', status: 'created', worktree: '.worktrees/demo', createdAt: 'x' }] });
        const result = registry.reset(rp, false);
        assert.strictEqual(result.backupPath, null);
        assert.ok(!fs.existsSync(rp + '.bak'));
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
    });

    test('handles already empty registry', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [] });
        const result = registry.reset(rp, true);
        assert.strictEqual(result.changesCount, 0);
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
    });

    test('handles non-existent registry file gracefully', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        const result = registry.reset(rp, true);
        assert.strictEqual(result.changesCount, 0);
        assert.strictEqual(result.backupPath, null);
        assert.ok(fs.existsSync(rp));
        const data = registry.read(rp);
        assert.strictEqual(data.changes.length, 0);
    });

    test('returns correct changesCount with multiple entries', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [
            { name: 'a', status: 'created', worktree: '.worktrees/a', createdAt: 'x' },
            { name: 'b', status: 'implementing', worktree: '.worktrees/b', createdAt: 'x' },
            { name: 'c', status: 'done', worktree: '.worktrees/c', createdAt: 'x' }
        ]});
        const result = registry.reset(rp, false);
        assert.strictEqual(result.changesCount, 3);
    });
});
