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

/**
 * 解析路径为真实物理路径。优先 `fs.realpathSync.native`：Windows 下它会展开 8.3 短名
 * （如 `RLOESS~1` → `rloessplateau`，与 git 返回的长路径一致），而普通 `fs.realpathSync` 不会。
 * 失败时回退 `fs.realpathSync`，再失败回退 `path.resolve`，避免比较中抛错。
 */
function realPath(p) {
    const resolved = path.resolve(p);
    try {
        return fs.realpathSync.native(resolved);
    } catch {
        try {
            return fs.realpathSync(resolved);
        } catch {
            return resolved;
        }
    }
}

/**
 * 规范化路径用于跨平台比较。
 * 先解析符号链接与 Windows 8.3 短名（见 `realPath`）；
 * `git rev-parse --show-toplevel` 在 Windows 下还可能返回正斜杠与不同大小写，故 win32 再转小写。
 */
function normalizePath(p) {
    const resolved = realPath(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** 建一个一次性 git 仓库（含首次提交），返回解析过符号链接/短名的仓库根目录 */
function makeGitRepo(prefix) {
    const dir = realPath(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
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

    test('replaces a plain empty target directory with a real worktree', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const worktree = path.join(repo, '.worktrees', name);
        fs.mkdirSync(worktree, { recursive: true });
        assert.strictEqual(fs.readdirSync(worktree).length, 0, '前置：目标应为空目录');

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.strictEqual(result.code, 0, `空目录应被替换为真 worktree, stderr: ${result.stderr}`);
        assert.match(
            gitRun(repo, ['worktree', 'list', '--porcelain']),
            /\.worktrees[\\/]demo/,
            '空目录应被清理并创建真实 worktree'
        );
        assert.strictEqual(
            normalizePath(gitRun(worktree, ['rev-parse', '--show-toplevel'])),
            normalizePath(worktree),
            'worktree 的 show-toplevel 必须等于其自身'
        );
        assert.strictEqual(gitRun(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']), 'feature/demo');
    });

    test('aborts on a plain non-empty target directory without deleting or modifying it', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const worktree = path.join(repo, '.worktrees', name);
        const marker = path.join(worktree, 'keep.txt');
        fs.mkdirSync(worktree, { recursive: true });
        fs.writeFileSync(marker, 'precious\n');

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.notStrictEqual(result.code, 0, `非空目录应中止, stdout: ${result.stdout}, stderr: ${result.stderr}`);
        assert.ok(fs.existsSync(marker), '非空目录内容不得被删除');
        assert.strictEqual(fs.readFileSync(marker, 'utf8'), 'precious\n', '非空目录内容不得被修改');
    });

    test('aborts when the target path is occupied by a plain file without touching it', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const target = path.join(repo, '.worktrees', name);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'occupied\n');

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.notStrictEqual(result.code, 0, `目标为文件时应中止, stdout: ${result.stdout}, stderr: ${result.stderr}`);
        assert.ok(fs.statSync(target).isFile(), '目标文件不得被删除或替换');
        assert.strictEqual(fs.readFileSync(target, 'utf8'), 'occupied\n', '目标文件内容不得被修改');
    });

    test('reattaches an existing branch after its worktree was removed', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const worktree = path.join(repo, '.worktrees', name);
        gitRun(repo, ['worktree', 'add', '-q', '.worktrees/demo', '-b', 'feature/demo']);
        fs.writeFileSync(path.join(worktree, 'work.txt'), 'work\n');
        gitRun(worktree, ['add', '.']);
        gitRun(worktree, ['commit', '-q', '-m', 'work']);
        gitRun(repo, ['worktree', 'remove', worktree]);
        assert.strictEqual(fs.existsSync(worktree), false, '前置：worktree 应已被移除');
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']);

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.strictEqual(result.code, 0, `应挂回既有分支, stderr: ${result.stderr}`);
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']),
            branchHead,
            '既有分支必须被挂回而非删除重建，SHA 保持不变'
        );
        assert.ok(fs.existsSync(worktree), 'worktree 应被重新创建');
        assert.match(gitRun(repo, ['worktree', 'list', '--porcelain']), /\.worktrees[\\/]demo/);
        assert.strictEqual(gitRun(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']), 'feature/demo');
    });

    test('recreates a manually deleted worktree directory after pruning stale registration', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const worktree = path.join(repo, '.worktrees', name);
        gitRun(repo, ['worktree', 'add', '-q', '.worktrees/demo', '-b', 'feature/demo']);
        assert.strictEqual(fs.existsSync(worktree), true, '前置：worktree 应存在');
        fs.rmSync(worktree, { recursive: true, force: true });
        assert.strictEqual(fs.existsSync(worktree), false, '前置：目录应被手工删除');

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.strictEqual(result.code, 0, `陈旧登记应 prune 后重建, stderr: ${result.stderr}`);
        assert.ok(fs.existsSync(worktree), '目录应被重新创建为真实 worktree');
        assert.match(gitRun(repo, ['worktree', 'list', '--porcelain']), /\.worktrees[\\/]demo/);
        assert.strictEqual(
            normalizePath(gitRun(worktree, ['rev-parse', '--show-toplevel'])),
            normalizePath(worktree),
            'worktree 的 show-toplevel 必须等于其自身'
        );
    });

    test('aborts on a wrong branch and reuses a correct-branch worktree without side effects', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'demo';
        const worktree = path.join(repo, '.worktrees', name);
        gitRun(repo, ['worktree', 'add', '-q', '.worktrees/demo', '-b', 'feature/demo']);
        gitRun(worktree, ['checkout', '-q', '-b', 'other']);
        const featureHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']);

        const wrong = runCliFrom(repo, 'ensure-worktree', name);
        const wrongOutput = `${wrong.stdout}\n${wrong.stderr}`;
        assert.notStrictEqual(wrong.code, 0, `错误分支应中止, stdout: ${wrong.stdout}`);
        assert.match(wrongOutput, /other/, '应打印实际检出的分支名');
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']),
            featureHead,
            '错误分支中止时不得改动 feature 分支'
        );

        gitRun(worktree, ['checkout', '-q', 'feature/demo']);
        fs.writeFileSync(path.join(worktree, 'dirty.txt'), 'dirty\n');
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']);
        const entriesBefore = gitRun(repo, ['worktree', 'list', '--porcelain']);

        const reuse = runCliFrom(repo, 'ensure-worktree', name);
        assert.strictEqual(reuse.code, 0, `正确分支应复用, stderr: ${reuse.stderr}`);
        assert.match(`${reuse.stdout}\n${reuse.stderr}`, /复用|已存在|reuse|already exists/i, '应报告复用');
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/demo']),
            branchHead,
            '复用不得改动分支'
        );
        assert.strictEqual(
            gitRun(repo, ['worktree', 'list', '--porcelain']),
            entriesBefore,
            '复用不得改动 worktree 登记'
        );
        assert.strictEqual(
            fs.readFileSync(path.join(worktree, 'dirty.txt'), 'utf8'),
            'dirty\n',
            '复用不得重置工作区'
        );
    });

    test('skips deleting a branch checked out by another worktree', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'shared';
        gitRun(repo, ['worktree', 'add', '-q', '.worktrees/elsewhere', '-b', 'feature/shared']);
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/shared']);

        const result = runCliFrom(repo, 'ensure-worktree', name);
        const output = `${result.stdout}\n${result.stderr}`;
        assert.notStrictEqual(result.code, 0, `分支被别处检出时应 ABORT, stdout: ${result.stdout}`);
        assert.match(output, /\.worktrees[\\/]elsewhere/, 'ABORT 消息应点名占用分支的 worktree 路径');
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/shared']),
            branchHead,
            '被检出的分支必须保留'
        );
        assert.strictEqual(fs.existsSync(path.join(repo, '.worktrees', name)), false);
    });

    test('attaches an existing stale branch and creates the worktree', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'fresh';

        gitRun(repo, ['checkout', '-q', '-b', 'stale-tmp']);
        fs.writeFileSync(path.join(repo, 'stale.txt'), 'stale\n');
        gitRun(repo, ['add', '.']);
        gitRun(repo, ['commit', '-q', '-m', 'stale']);
        gitRun(repo, ['branch', 'feature/fresh', 'stale-tmp']);
        const branchHead = gitRun(repo, ['rev-parse', 'refs/heads/feature/fresh']);
        gitRun(repo, ['checkout', '-q', 'main']);

        const result = runCliFrom(repo, 'ensure-worktree', name);
        assert.strictEqual(result.code, 0, `正常路径应成功, stderr: ${result.stderr}`);
        assert.ok(fs.existsSync(path.join(repo, '.worktrees', name)), '应创建 worktree');
        assert.match(gitRun(repo, ['worktree', 'list', '--porcelain']), /\.worktrees[\\/]fresh/);
        assert.strictEqual(
            gitRun(repo, ['rev-parse', 'refs/heads/feature/fresh']),
            branchHead,
            '既有分支应被挂回而非删除重建，SHA 保持不变'
        );
    });

    // ---- 名称输入边界（C1）：路径逃逸 / shell 注入 ----

    test('rejects path traversal names without deleting anything', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const victim = path.join(repo, 'victim');
        fs.mkdirSync(victim);

        const result = runCliFrom(repo, 'ensure-worktree', '../victim');

        assert.notStrictEqual(result.code, 0, `路径逃逸必须中止, stdout: ${result.stdout}, stderr: ${result.stderr}`);
        assert.ok(fs.existsSync(victim), '目标目录之外的目录不得被删除');
        assert.ok(fs.statSync(victim).isDirectory(), 'victim 应仍是目录');
    });

    test('rejects shell metacharacters without side effects', () => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const name = 'x" & echo PWNED>pwned.txt & rem "';

        const result = runCliFrom(repo, 'ensure-worktree', name);

        assert.notStrictEqual(result.code, 0, `shell 元字符名称必须中止, stdout: ${result.stdout}, stderr: ${result.stderr}`);
        assert.strictEqual(fs.existsSync(path.join(repo, 'pwned.txt')), false, '不得经 shell 执行任意命令');
    });

    test('rejects nested path names', () => {
        const repo = makeGitRepo('oso-ensure-wt-');

        const result = runCliFrom(repo, 'ensure-worktree', 'a/b');

        assert.notStrictEqual(result.code, 0, `含路径分隔符的名称必须中止, stdout: ${result.stdout}, stderr: ${result.stderr}`);
        assert.strictEqual(fs.existsSync(path.join(repo, '.worktrees', 'a')), false, '不得创建嵌套目录');
    });

    // ---- 目标路径为符号链接（M4）：不得穿过链接改动别处 ----

    test('aborts when the target path is a symbolic link', (t) => {
        const repo = makeGitRepo('oso-ensure-wt-');
        const bResult = runCliFrom(repo, 'ensure-worktree', 'b');
        assert.strictEqual(bResult.code, 0, `前置 worktree b 应创建成功, stderr: ${bResult.stderr}`);

        const bDir = path.join(repo, '.worktrees', 'b');
        const aDir = path.join(repo, '.worktrees', 'a');
        try {
            fs.symlinkSync(bDir, aDir, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (e) {
            const code = e && e.code;
            if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP' || code === 'UNKNOWN') {
                t.skip(`symlink 创建不被允许（${code}）`);
                return;
            }
            throw e;
        }

        const result = runCliFrom(repo, 'ensure-worktree', 'a');
        const output = `${result.stdout}\n${result.stderr}`;

        assert.notStrictEqual(result.code, 0, `目标为符号链接时应中止, stdout: ${result.stdout}`);
        assert.match(output, /符号链接|symbolic link|symlink/i, '应明确指出符号链接');
        assert.strictEqual(
            gitRun(bDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
            'feature/b',
            '链接目标 worktree 不得被改动'
        );
        assert.ok(fs.readFileSync(path.join(bDir, 'README.md'), 'utf8').includes('# fixture'), '链接目标内容不得被改动');
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
    fs.writeFileSync(path.join(bin, 'openspec'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
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
            assert.match(result.stdout, /(Usage|用法): oso install-shims/);
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
            assert.match(result.stdout, /(Usage|用法): oso registry <add\|remove\|list\|verify\|reset>/, '必须命中子命令级用法行');

            assert.deepEqual(fs.readdirSync(bin).sort(), binBefore, 'bin 目录不得有任何变化');
            assert.deepEqual(fs.readdirSync(tmp).sort(), tmpBefore, '工作目录不得产生新文件（如 .worktrees）');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    test('long command bin mapping points at the same entry as oso and --version agrees', () => {
        const repoRoot = path.resolve(__dirname, '..');
        const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
        // 长名与 oso 在 package.json 里映射到同一个 dist/cli/index.js，因此执行 cliPath 等价于执行长命令
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

    // 直接覆盖「未知子命令以非零退出」——原 test/imp16-tarball-equivalence.test.js
    // 的唯一此类断言随该文件删除，这里补回自动化回归保护。
    test('unknown subcommand exits non-zero and lists available commands', () => {
        const result = runCli('__no_such_command__');
        assert.notStrictEqual(result.code, 0, '未知子命令必须以非零退出');
        const output = `${result.stdout}\n${result.stderr}`;
        assert.match(output, /__no_such_command__/, '错误信息应回显未知子命令名');
        assert.match(output, /init/, '错误信息应列出可用命令');
        assert.doesNotMatch(output, /(?<!create-)openspec-superpowers-opencode/, '报错不得使用长名');
    });
});

describe('CLI entry detection', () => {
    // npm link / pnpm / macOS tmpdir (/var -> /private/var) all reach the CLI
    // through a symlinked path. The entry check must still fire there.
    test('runs when invoked through a symlinked path', (t) => {
        const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-link-'));
        const link = path.join(linkRoot, 'repo');
        t.after(() => fs.rmSync(linkRoot, { recursive: true, force: true }));
        fs.symlinkSync(path.resolve(__dirname, '..'), link, process.platform === 'win32' ? 'junction' : 'dir');
        const output = child_process.execFileSync(
            process.execPath,
            [path.join(link, 'dist', 'cli', 'index.js'), '--version'],
            { encoding: 'utf8' },
        );
        assert.match(output.trim(), /^\d+\.\d+\.\d+$/);
    });
});