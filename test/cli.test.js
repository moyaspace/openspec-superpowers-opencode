import { test, describe } from 'node:test';
import assert from 'node:assert';
import child_process from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');

function runCliFrom(cwd, ...args) {
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

function runCli(...args) {
    return runCliFrom(process.cwd(), ...args);
}

/** 在 dir 中执行 git 命令并返回修剪后的 stdout */
function gitRun(dir, args) {
    return child_process.execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

/** 建一个一次性 git 仓库（含首次提交），返回仓库根目录 */
function makeGitRepo(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    gitRun(dir, ['init', '-q', '--initial-branch=main']);
    gitRun(dir, ['config', 'user.email', 'test@example.com']);
    gitRun(dir, ['config', 'user.name', 'Test User']);
    gitRun(dir, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
    gitRun(dir, ['add', '.']);
    gitRun(dir, ['commit', '-q', '-m', 'init']);
    return dir;
}

// ============================================================
// --version
// ============================================================
describe('--version', () => {
    test('--version outputs current version number', () => {
        const result = runCli('--version');
        assert.strictEqual(result.code, 0);
        assert.match(result.stdout, /^\d+\.\d+\.\d+$/);
    });

    test('-v outputs current version number', () => {
        const result = runCli('-v');
        assert.strictEqual(result.code, 0);
        assert.match(result.stdout, /^\d+\.\d+\.\d+$/);
    });

    test('--version does not block --help', () => {
        const helpResult = runCli('--help');
        assert.strictEqual(helpResult.code, 0);
        assert.ok(helpResult.stdout.length > 100);
    });
});

// ============================================================
// remove-worktree
// ============================================================
describe('remove-worktree', () => {
    test('exits with usage when name is missing', () => {
        const result = runCli('remove-worktree');
        assert.notStrictEqual(result.code, 0);
        assert.ok(result.stderr.includes('Usage') || result.stderr.includes('用法'));
    });

    test('handles nonexistent worktree without crashing', () => {
        const result = runCli('remove-worktree', 'nonexistent-test-xyz');
        assert.notStrictEqual(result.code, 0);
        assert.ok(result.stdout.includes('✗') || result.stdout.includes('failed'));
    });
});

// ============================================================
// registry add --base usage text
// ============================================================
// ============================================================
// ensure-worktree 幂等性与分支安全（BUG #7）
// ============================================================
describe('ensure-worktree idempotency and branch safety', () => {
    test('inside the target worktree exits 0 without recreating or deleting', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const first = runCliFrom(repo, 'ensure-worktree', name);
        assert.strictEqual(first.code, 0, `首次创建应成功, stderr: ${first.stderr}`);

        const worktree = path.join(repo, '.worktrees', name);
        assert.ok(fs.existsSync(worktree), '首次调用应创建 worktree');
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']);

        const inside = runCliFrom(worktree, 'ensure-worktree', name);
        assert.strictEqual(inside.code, 0, `worktree 内调用应 exit 0, stderr: ${inside.stderr}`);
        assert.match(inside.stdout, /已在该 worktree 内|Already inside this worktree/);
        assert.doesNotMatch(inside.stdout, /创建 worktree|Creating worktree/);

        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']),
            branchHead,
            '分支不应被删除重建'
        );
        assert.strictEqual(
            gitRun(repo, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length,
            2,
            '不应新增 worktree'
        );
    });

    test('skips deleting a branch checked out by another worktree', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'shared';
        gitRun(repo, ['worktree', 'add', '-q', '.worktrees/elsewhere', '-b', 'feature/shared']);
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/shared']);

        const result = runCliFrom(repo, 'ensure-worktree', name);
        assert.strictEqual(result.code, 0, `应跳过而非报错, stderr: ${result.stderr}`);
        assert.match(result.stdout, /跳过删除|skipping deletion|checked out/i);
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/shared']),
            branchHead,
            '被检出的分支必须保留'
        );
        assert.strictEqual(fs.existsSync(path.join(repo, '.worktrees', name)), false);
    });

    test('normal path deletes a stale branch and creates the worktree', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'fresh';
        const base = gitRun(repo, ['rev-parse', 'HEAD']);

        gitRun(repo, ['checkout', '-q', '-b', 'stale-tmp']);
        fs.writeFileSync(path.join(repo, 'stale.txt'), 'stale\n');
        gitRun(repo, ['add', '.']);
        gitRun(repo, ['commit', '-q', '-m', 'stale']);
        gitRun(repo, ['branch', 'feature/fresh', 'stale-tmp']);
        gitRun(repo, ['checkout', '-q', 'main']);

        const result = runCliFrom(repo, 'ensure-worktree', name);
        assert.strictEqual(result.code, 0, `正常路径应成功, stderr: ${result.stderr}`);
        assert.ok(fs.existsSync(path.join(repo, '.worktrees', name)), '应创建 worktree');
        assert.match(gitRun(repo, ['worktree', 'list', '--porcelain']), /\.worktrees[\\/]fresh/);
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/fresh']),
            base,
            '残留分支应被删除并在当前 HEAD 上重建'
        );
    });
});

describe('registry add --base usage', () => {
    test('help documents [--base <branch>] (en)', () => {
        const result = runCli('--help');
        assert.strictEqual(result.code, 0);
        assert.ok(result.stdout.includes('registry add <name> <worktree> [--base <branch>]'), result.stdout);
    });

    test('help documents [--base <branch>] (zh)', () => {
        const result = runCli('--help', '--lang', 'zh-CN');
        assert.strictEqual(result.code, 0);
        assert.ok(result.stdout.includes('registry add <name> <worktree> [--base <branch>]'), result.stdout);
        assert.ok(result.stdout.includes('注册表添加变更'), '应命中中文文案而非英文回退');
    });
});

// ============================================================
// oso command guidance (F003)
// ============================================================

/**
 * 建一个隔离的 tmp 工作目录 + 假 bin 目录（内含 openspec 三件套）。
 * 用于验证 `oso <subcommand> --help` 在任何副作用之前短路。
 */
function makeIsolatedBin() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-clihelp-'));
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'openspec'), '#!/bin/sh\nexit 0\n');
    fs.writeFileSync(path.join(bin, 'openspec.cmd'), '@echo off\r\nexit /b 0\r\n');
    fs.writeFileSync(path.join(bin, 'openspec.ps1'), 'exit 0\r\n');
    return { tmp, bin };
}

/** 在隔离 cwd 中执行 CLI，并把假 bin 目录置于 PATH 最前 */
function runCliIsolated(tmp, bin, ...args) {
    try {
        const stdout = child_process.execFileSync(process.execPath, [cliPath, ...args], {
            cwd: tmp,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PATH: bin + path.delimiter + (process.env.PATH ?? '') }
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

describe('oso command guidance', () => {
    test('help has zero exact openspec-superpowers-opencode mentions (en/zh)', () => {
        for (const cliArgs of [['--help'], ['--help', '--lang', 'zh-CN']]) {
            const out = runCli(...cliArgs).stdout;
            const matches = out.match(/(?<!create-)openspec-superpowers-opencode/g) ?? [];
            assert.equal(matches.length, 0, `${cliArgs.join(' ')} still mentions long name`);
        }
    });

    test('subcommand help install-shims exits 0 with permission guidance and no side effects', () => {
        const { tmp, bin } = makeIsolatedBin();
        try {
            const binBefore = fs.readdirSync(bin).sort();
            const tmpBefore = fs.readdirSync(tmp).sort();

            const result = runCliIsolated(tmp, bin, 'install-shims', '--help');

            assert.equal(result.code, 0, `stderr: ${result.stderr}`);
            assert.match(result.stdout, /install-shims/);
            assert.match(result.stdout, /sudo|管理员|gsudo|PowerShell/, `missing permission guidance:\n${result.stdout}`);

            assert.deepEqual(fs.readdirSync(bin).sort(), binBefore, 'bin 目录不得有任何变化');
            assert.deepEqual(fs.readdirSync(tmp).sort(), tmpBefore, '工作目录不得产生新文件（如 .worktrees）');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('subcommand help registry exits 0 without side effects', () => {
        const { tmp, bin } = makeIsolatedBin();
        try {
            const binBefore = fs.readdirSync(bin).sort();
            const tmpBefore = fs.readdirSync(tmp).sort();

            const result = runCliIsolated(tmp, bin, 'registry', '--help');

            assert.equal(result.code, 0, `stderr: ${result.stderr}`);
            assert.match(result.stdout, /add/);
            assert.match(result.stdout, /list/);
            assert.match(result.stdout, /oso registry/, '子命令说明必须使用 oso 短命令');

            assert.deepEqual(fs.readdirSync(bin).sort(), binBefore, 'bin 目录不得有任何变化');
            assert.deepEqual(fs.readdirSync(tmp).sort(), tmpBefore, '工作目录不得产生新文件（如 .worktrees）');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('long command --version matches oso --version and is wired in package.json', () => {
        const repoRoot = path.resolve(__dirname, '..');
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        assert.equal(pkg.bin['openspec-superpowers-opencode'], 'dist/cli/index.js');

        const longVersion = child_process
            .execFileSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' })
            .trim();
        const shortVersion = runCli('--version').stdout;
        assert.equal(longVersion, shortVersion);
        assert.match(longVersion, /^\d+\.\d+\.\d+$/);
    });

    test('identifier files keep the long project name', () => {
        const repoRoot = path.resolve(__dirname, '..');

        const manifest = fs.readFileSync(path.join(repoRoot, 'src', 'setup', 'manifest.ts'), 'utf8');
        assert.ok(manifest.includes("project: 'openspec-superpowers-opencode'"), 'manifest 的 project 标识符必须保留长名');

        const planner = fs.readFileSync(path.join(repoRoot, 'src', 'setup', 'planner.ts'), 'utf8');
        for (const marker of [
            '<!-- openspec-superpowers-opencode_instructions -->',
            '# <!-- openspec-superpowers-opencode_gitignore -->',
            '# <!-- openspec-superpowers-opencode_gitattributes -->',
            '# <!-- openspec-superpowers-opencode_editorconfig -->'
        ]) {
            assert.ok(planner.includes(marker), `planner marker 缺失: ${marker}`);
        }

        const reset = fs.readFileSync(path.join(repoRoot, 'src', 'setup', 'reset.ts'), 'utf8');
        assert.ok(reset.includes("'openspec-superpowers-opencode'"), 'reset.ts 的 manifest 归属校验必须保留长名');
    });
});
