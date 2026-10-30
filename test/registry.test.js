import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';

// registry 模块（测试前还不存在——RED）
import * as registry from '../dist/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');

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

    test('stores baseBranch when one is given', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        registry.add(rp, 'demo', '.worktrees/demo', 'release/1.1');
        const data = registry.read(rp);
        assert.strictEqual(data.changes[0].baseBranch, 'release/1.1');
    });

    test('keeps a previously stored baseBranch when re-added without one', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [
            { name: 'demo', worktree: '.worktrees/demo', createdAt: 'x', baseBranch: 'release/1.1' }
        ]});
        registry.add(rp, 'demo', '.worktrees/demo');
        const data = registry.read(rp);
        assert.strictEqual(data.changes[0].baseBranch, 'release/1.1');
    });

    test('keeps unknown custom fields of an existing entry on merge', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [
            { name: 'demo', worktree: '.worktrees/demo', createdAt: 'x', foo: 'bar' }
        ]});
        registry.add(rp, 'demo', '.worktrees/demo-v2');
        const data = registry.read(rp);
        assert.strictEqual(data.changes[0].foo, 'bar');
        assert.strictEqual(data.changes[0].worktree, '.worktrees/demo-v2');
    });

    test('overrides the stored baseBranch when one is given on re-add', () => {
        const dir = tmpDir();
        const rp = writeRegistry(dir, { changes: [
            { name: 'demo', worktree: '.worktrees/demo', createdAt: 'x', baseBranch: 'main' }
        ]});
        registry.add(rp, 'demo', '.worktrees/demo', 'release/1.1');
        const data = registry.read(rp);
        assert.strictEqual(data.changes[0].baseBranch, 'release/1.1');
    });

    test('writes no baseBranch key for a new entry added without one', () => {
        const dir = tmpDir();
        const rp = path.join(dir, 'openspec', 'oso-change-registry.json');
        registry.write(rp, { changes: [] });
        registry.add(rp, 'demo', '.worktrees/demo');
        const raw = fs.readFileSync(rp, 'utf-8');
        assert.ok(!raw.includes('baseBranch'), 'registry JSON must not carry a baseBranch key');
        assert.ok(!('baseBranch' in registry.read(rp).changes[0]));
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

// ============================================================
// CLI 集成：ensure-worktree / registry add --base 写入 baseBranch
// 通过真实 git 仓库 + dist/cli/index.js 子进程，验证 baseBranch
// 取自 `git rev-parse --abbrev-ref HEAD`（创建时当前分支）。
// ============================================================

/** 在 dir 中执行 git 命令并返回 stdout */
function gitExec(dir, args) {
    return child_process.execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

/**
 * 建一个一次性 git 仓库：初始化 + 首次提交，然后切到指定分支。
 * 返回仓库根目录（不含 .worktrees / openspec，交由 CLI 自行创建）。
 */
function makeGitRepo(branch) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-cli-'));
    gitExec(dir, ['init', '-q']);
    gitExec(dir, ['config', 'user.email', 'test@example.com']);
    gitExec(dir, ['config', 'user.name', 'Test User']);
    gitExec(dir, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
    gitExec(dir, ['add', '.']);
    gitExec(dir, ['commit', '-q', '-m', 'init']);
    gitExec(dir, ['checkout', '-q', '-b', branch]);
    return dir;
}

/** 以指定 cwd 运行 dist CLI，仿 cli.test.js 的 execFileSync 模式 */
function runCliFrom(cwd, args) {
    try {
        const stdout = child_process.execFileSync(process.execPath, [cliPath, ...args], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { stdout: stdout.trim(), stderr: '', code: 0 };
    } catch (e) {
        return {
            stdout: e.stdout ? e.stdout.toString().trim() : '',
            stderr: e.stderr ? e.stderr.toString().trim() : '',
            code: e.status || 1
        };
    }
}

/** 读取仓库注册表（文件不存在时视为空） */
function readRegistryFile(repo) {
    const p = path.join(repo, 'openspec', 'oso-change-registry.json');
    if (!fs.existsSync(p)) return { changes: [] };
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

describe('ensure-worktree / registry add --base（CLI 集成）', () => {
    test('ensure-worktree 不再写入 baseBranch（写入交由 registry add --base）', () => {
        const repo = makeGitRepo('sc-base-branch');
        const name = 'base-demo';

        // 预置条目：模拟 registry add 已记录 name/worktree（不带 --base）。
        // ensure-worktree 若仍隐式写 base，会覆盖该条目并加上 baseBranch 键。
        const seed = runCliFrom(repo, ['registry', 'add', name, `.worktrees/${name}`]);
        assert.strictEqual(seed.code, 0, `registry add 应成功, stderr: ${seed.stderr}`);
        assert.ok(
            !('baseBranch' in readRegistryFile(repo).changes.find(c => c.name === name)),
            '预置条目不应含 baseBranch'
        );

        const res = runCliFrom(repo, ['ensure-worktree', name]);
        assert.strictEqual(res.code, 0, `ensure-worktree 应成功, stderr: ${res.stderr}`);

        const entry = readRegistryFile(repo).changes.find(c => c.name === name);
        assert.ok(entry, 'registry add 预置的条目应仍存在');
        assert.ok(!('baseBranch' in entry), 'ensure-worktree 不应写入 baseBranch');
    });

    test('registry add --base <branch> 写入显式指定的 baseBranch', () => {
        const repo = makeGitRepo('sc-main');

        const res = runCliFrom(repo, ['registry', 'add', 'add-demo', '.worktrees/add-demo', '--base', 'release/1.1']);
        assert.strictEqual(res.code, 0, `registry add 应成功, stderr: ${res.stderr}`);

        const entry = readRegistryFile(repo).changes.find(c => c.name === 'add-demo');
        assert.ok(entry, 'registry add 应注册该变更');
        assert.strictEqual(entry.baseBranch, 'release/1.1');
    });
});
