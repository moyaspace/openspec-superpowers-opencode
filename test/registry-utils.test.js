const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 测试前模块还不存在——RED
const registryUtils = require('../lib/registry-utils');

/** 创建临时项目目录 */
function tmpProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-utils-test-'));
    // 创建 openspec/changes.json
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

/** 创建 openspec/changes 目录 + 子目录 */
function writeChangeDir(dir, name) {
    const p = path.join(dir, 'openspec', 'changes', name);
    fs.mkdirSync(p, { recursive: true });
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
        // 不创建 changes.json
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
        // 找不存在的文件，应该回 null 而不报错
        const result = registryUtils.findProjectRoot(os.tmpdir());
        // tmpdir 一般不会有 openspec/changes.json
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
        writeRegistry(dir, { changes: [{ name: 'demo', status: 'created', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }] });
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
// formatWorktreeEntry()
// ============================================================
describe('formatWorktreeEntry()', () => {
    test('formats a worktree entry in native list style', () => {
        const now = new Date();
        const entry = {
            name: 'demo',
            status: 'created',
            worktree: '.worktrees/demo',
            createdAt: now.toISOString()
        };
        const line = registryUtils.formatWorktreeEntry(entry);
        // 应该包含变更名、状态、worktree 路径
        assert.ok(line.includes('demo'));
        assert.ok(line.includes('created'));
        assert.ok(line.includes('.worktrees/demo'));
    });

    test('formats an implemented entry', () => {
        const entry = {
            name: 'feature-auth',
            status: 'implemented',
            worktree: '.worktrees/feature-auth',
            createdAt: new Date().toISOString()
        };
        const line = registryUtils.formatWorktreeEntry(entry);
        assert.ok(line.includes('feature-auth'));
        assert.ok(line.includes('implemented'));
    });

    test('truncates long names to keep alignment', () => {
        const entry = {
            name: 'a-very-long-change-name-that-should-be-truncated',
            status: 'created',
            worktree: '.worktrees/a-very-long-change-name-that-should-be-truncated',
            createdAt: new Date().toISOString()
        };
        const line = registryUtils.formatWorktreeEntry(entry);
        assert.ok(line.includes('a-very-long'));
    });
});

// ============================================================
// mergeList()
// ============================================================
describe('mergeList()', () => {
    test('appends worktree entries after native output', () => {
        const nativeOutput = `Changes:
  demo     No tasks      27m ago`;
        const registry = {
            changes: [
                { name: 'demo2', status: 'proposed', worktree: '.worktrees/demo2', createdAt: new Date().toISOString() }
            ]
        };
        const result = registryUtils.mergeList(nativeOutput, registry);
        assert.ok(result.includes('demo'));      // 原生的还在
        assert.ok(result.includes('demo2'));     // registry 的追加
        assert.ok(result.includes('.worktrees/demo2'));
    });

    test('deduplicates by name (registry wins)', () => {
        const nativeOutput = `Changes:
  demo     No tasks      27m ago`;
        const registry = {
            changes: [
                { name: 'demo', status: 'implementing', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }
            ]
        };
        const result = registryUtils.mergeList(nativeOutput, registry);
        // demo 应该只有一条（registry 版），且状态是 implementing 而非 No tasks
        const demoLines = result.split('\n').filter(l => l.includes('demo'));
        assert.strictEqual(demoLines.length, 1);
        assert.ok(demoLines[0].includes('implementing'));
    });

    test('returns raw native output when registry is empty', () => {
        const nativeOutput = `Changes:
  demo     No tasks      27m ago`;
        const registry = { changes: [] };
        const result = registryUtils.mergeList(nativeOutput, registry);
        assert.strictEqual(result, nativeOutput);
    });

    test('handles native output without Changes header', () => {
        const nativeOutput = 'No active changes.';
        const registry = {
            changes: [
                { name: 'demo2', status: 'proposed', worktree: '.worktrees/demo2', createdAt: new Date().toISOString() }
            ]
        };
        const result = registryUtils.mergeList(nativeOutput, registry);
        // 还是应该包含 registry 条目
        assert.ok(result.includes('demo2'));
    });

    test('handles empty native output', () => {
        const nativeOutput = '';
        const registry = {
            changes: [
                { name: 'demo', status: 'created', worktree: '.worktrees/demo', createdAt: new Date().toISOString() }
            ]
        };
        const result = registryUtils.mergeList(nativeOutput, registry);
        assert.ok(result.includes('demo'));
    });

    test('skips worktree entries whose directory is missing', () => {
        const nativeOutput = `Changes:`;
        const dir = tmpProject();
        const registry = {
            changes: [
                { name: 'live', status: 'created', worktree: '.worktrees/live', createdAt: new Date().toISOString() },
                { name: 'missing-wt', status: 'created', worktree: '.worktrees/missing-wt', createdAt: new Date().toISOString() }
            ]
        };
        // 只创建 live 的目录
        const wtDir = path.join(dir, '.worktrees', 'live');
        fs.mkdirSync(wtDir, { recursive: true });

        const result = registryUtils.mergeList(nativeOutput, registry, dir);
        assert.ok(result.includes('live'));
        assert.ok(!result.includes('missing-wt'));  // 目录不存在，跳过
    });
});
