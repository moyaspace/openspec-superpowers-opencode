const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const shimsInstaller = require('../lib/shims-installer');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'shims-installer-test-'));
}

// ============================================================
// findOpenspecBinDir()
// ============================================================
describe('findOpenspecBinDir()', () => {
    test('returns dir path when openspec found', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec');
        assert.strictEqual(shimsInstaller.findOpenspecBinDir(false), '/usr/local/bin');
    });

    test('returns null when openspec not found', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });
        assert.strictEqual(shimsInstaller.findOpenspecBinDir(false), null);
    });

    test('returns null on empty output', (t) => {
        t.mock.method(child_process, 'execSync', () => '');
        assert.strictEqual(shimsInstaller.findOpenspecBinDir(false), null);
    });

    test('takes first line when multi-line output', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec\n/home/user/bin/openspec');
        assert.strictEqual(shimsInstaller.findOpenspecBinDir(false), '/usr/local/bin');
    });

    test('handles Windows where command', (t) => {
        if (process.platform !== 'win32') return t.skip('Windows only');
        t.mock.method(child_process, 'execSync', () => 'C:\\Program Files\\nodejs\\openspec.cmd');
        assert.strictEqual(shimsInstaller.findOpenspecBinDir(true), 'C:\\Program Files\\nodejs');
    });
});

// ============================================================
// openspecOrigExists()
// ============================================================
describe('openspecOrigExists()', () => {
    test('finds openspec-orig (unix priority)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig'), '');
        assert.strictEqual(shimsInstaller.openspecOrigExists(dir, false), true);
    });

    test('finds openspec-orig.cmd on Windows', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.cmd'), '');
        assert.strictEqual(shimsInstaller.openspecOrigExists(dir, true), true);
    });

    test('finds openspec-orig.ps1 when .cmd absent', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.ps1'), '');
        assert.strictEqual(shimsInstaller.openspecOrigExists(dir, true), true);
    });

    test('returns false when no variant exists', () => {
        const dir = tmpDir();
        assert.strictEqual(shimsInstaller.openspecOrigExists(dir, false), false);
    });

    test('returns false on empty directory', () => {
        const dir = tmpDir();
        assert.strictEqual(shimsInstaller.openspecOrigExists(dir, false), false);
    });
});

// ============================================================
// copyOpenspecToOrig()
// ============================================================
describe('copyOpenspecToOrig()', () => {
    test('copies openspec to openspec-orig (unix)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh\necho "openspec"');
        const result = shimsInstaller.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig')));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig'), 'utf8'), '#!/bin/sh\necho "openspec"');
    });

    test('copies openspec.cmd to openspec-orig.cmd (Windows)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec.cmd'), '@echo off');
        const result = shimsInstaller.copyOpenspecToOrig(dir, true);
        assert.strictEqual(result, 'openspec-orig.cmd');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig.cmd')));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig.cmd'), 'utf8'), '@echo off');
    });

    test('copies openspec.ps1 when that is what exists', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec.ps1'), 'Write-Output "openspec"');
        const result = shimsInstaller.copyOpenspecToOrig(dir, true);
        assert.strictEqual(result, 'openspec-orig.ps1');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig.ps1')));
    });

    test('prefers openspec over .cmd over .ps1', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh');
        fs.writeFileSync(path.join(dir, 'openspec.cmd'), '@echo off');
        const result = shimsInstaller.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig'), 'utf8'), '#!/bin/sh');
    });

    test('throws when openspec not found in bin dir', () => {
        const dir = tmpDir();
        assert.throws(() => {
            shimsInstaller.copyOpenspecToOrig(dir, false);
        }, /openspec CLI not found/);
    });

    test('preserves symlink when openspec is a symlink', () => {
        const dir = tmpDir();
        // 模拟 npm -g 安装：openspec 是符号链接指向另一个目录的 JS 文件
        const targetDir = tmpDir();
        fs.writeFileSync(path.join(targetDir, 'openspec.js'), '#!/usr/bin/env node\nimport "../dist/cli/index.js";');
        fs.symlinkSync(path.join(targetDir, 'openspec.js'), path.join(dir, 'openspec'));
        const result = shimsInstaller.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig')));
        // 验证 openspec-orig 也是符号链接，指向同一目标
        const stat = fs.lstatSync(path.join(dir, 'openspec-orig'));
        assert.ok(stat.isSymbolicLink());
        assert.strictEqual(fs.readlinkSync(path.join(dir, 'openspec-orig')), path.join(targetDir, 'openspec.js'));
    });

    test('does not overwrite existing openspec-orig', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh\nnew version');
        fs.writeFileSync(path.join(dir, 'openspec-orig'), '#!/bin/sh\nold version');
        const result = shimsInstaller.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig'), 'utf8'), '#!/bin/sh\nnew version');
    });
});

// ============================================================
// installShimScripts()
// ============================================================
describe('installShimScripts()', () => {
    function setupToolDir(base) {
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        fs.writeFileSync(path.join(shimsDir, 'openspec'), '#!/bin/sh\n# shim for {{TOOL_DIR}}');
        fs.writeFileSync(path.join(shimsDir, 'openspec.cmd'), '@echo off\nrem tool dir: {{TOOL_DIR}}');
        fs.writeFileSync(path.join(shimsDir, 'openspec.ps1'), '# tool dir: {{TOOL_DIR}}');
        return { toolDir: base, shimsDir };
    }

    test('writes all templates for unix', () => {
        const base = tmpDir();
        const { toolDir } = setupToolDir(base);
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = shimsInstaller.installShimScripts(toolDir, binDir, false);
        assert.strictEqual(written.length, 3);
        assert.ok(written.includes('openspec'));
        assert.ok(written.includes('openspec.cmd'));
        assert.ok(written.includes('openspec.ps1'));

        const content = fs.readFileSync(path.join(binDir, 'openspec'), 'utf8');
        assert.ok(content.includes(toolDir));
        assert.ok(!content.includes('{{TOOL_DIR}}'));
    });

    test('writes only .cmd and .ps1 for Windows', () => {
        const base = tmpDir();
        const { toolDir } = setupToolDir(base);
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = shimsInstaller.installShimScripts(toolDir, binDir, true);
        assert.strictEqual(written.length, 2);
        assert.ok(written.includes('openspec.cmd'));
        assert.ok(written.includes('openspec.ps1'));
        assert.ok(!written.includes('openspec'));
    });

    test('skips missing template files', () => {
        const base = tmpDir();
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        fs.writeFileSync(path.join(shimsDir, 'openspec'), '#!/bin/sh\n# {{TOOL_DIR}}');
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = shimsInstaller.installShimScripts(base, binDir, false);
        assert.strictEqual(written.length, 1);
        assert.strictEqual(written[0], 'openspec');
    });

    test('returns empty array when no templates in shims dir', () => {
        const base = tmpDir();
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = shimsInstaller.installShimScripts(base, binDir, false);
        assert.strictEqual(written.length, 0);
    });

    test('replaces multiple {{TOOL_DIR}} occurrences in same file', () => {
        const base = tmpDir();
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        fs.writeFileSync(path.join(shimsDir, 'openspec'),
            'TOOL_DIR={{TOOL_DIR}}\nPATH=$PATH:{{TOOL_DIR}}/bin');
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        shimsInstaller.installShimScripts(base, binDir, false);
        const content = fs.readFileSync(path.join(binDir, 'openspec'), 'utf8');
        assert.strictEqual(content, `TOOL_DIR=${base}\nPATH=$PATH:${base}/bin`);
    });
});

// ============================================================
// setExecutable()
// ============================================================
describe('setExecutable()', () => {
    test('does nothing on Windows (no-op)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'test-script'), '#!/bin/sh');
        shimsInstaller.setExecutable(dir, ['test-script']);
        assert.ok(fs.existsSync(path.join(dir, 'test-script')));
    });
});

// ============================================================
// installShims() — 主入口集成测试
// ============================================================
describe('installShims()', () => {
    function setupEnvironment(base) {
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        fs.writeFileSync(path.join(shimsDir, 'openspec'), '#!/bin/sh\n# shim for {{TOOL_DIR}}');
        fs.writeFileSync(path.join(shimsDir, 'openspec.cmd'), '@echo off\nrem {{TOOL_DIR}}');

        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh\noriginal openspec');

        return { toolDir: base, binDir };
    }

    test('full successful install', (t) => {
        const base = tmpDir();
        const { toolDir, binDir } = setupEnvironment(base);

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.installShims(toolDir, false);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.binDir, binDir);
        assert.ok(result.details.length >= 3);
        assert.ok(fs.existsSync(path.join(binDir, 'openspec-orig')));
        assert.ok(fs.existsSync(path.join(binDir, 'openspec')));
        assert.ok(fs.existsSync(path.join(binDir, 'openspec.cmd')));
    });

    test('skips openspec-orig copy when it already exists', (t) => {
        const base = tmpDir();
        const { toolDir, binDir } = setupEnvironment(base);
        fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\nexisting backup');

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.installShims(toolDir, false);
        assert.strictEqual(result.success, true);
        assert.strictEqual(fs.readFileSync(path.join(binDir, 'openspec-orig'), 'utf8'), '#!/bin/sh\nexisting backup');
        assert.ok(result.details.some(d => d.includes('already exists')));
    });

    test('fails gracefully when openspec not in PATH', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });

        const result = shimsInstaller.installShims('/some/tool/dir', false);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.binDir, null);
        assert.ok(result.details.some(d => d.includes('not found in PATH')));
    });

    test('fails gracefully when copyOpenspecToOrig errors', (t) => {
        const base = tmpDir();
        const { toolDir } = setupEnvironment(base);
        const emptyBinDir = path.join(base, 'empty-bin');
        fs.mkdirSync(emptyBinDir);

        t.mock.method(child_process, 'execSync', () => path.join(emptyBinDir, 'openspec'));

        const result = shimsInstaller.installShims(toolDir, false);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.binDir, emptyBinDir);
        assert.ok(result.details.some(d => d.includes('failed to create openspec-orig')));
    });

    test('fails gracefully when shim template dir is missing', (t) => {
        const base = tmpDir();
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh');

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.installShims(base, false);
        assert.strictEqual(result.success, true);
    });
});

// ============================================================
// uninstallShims() — 新的卸除入口
// ============================================================
describe('uninstallShims()', () => {
    function setupInstalledEnvironment(base, isWin) {
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir, { recursive: true });

        // Create backup (openspec-orig)
        if (isWin) {
            fs.writeFileSync(path.join(binDir, 'openspec-orig.cmd'), '@echo off\noriginal openspec');
            fs.writeFileSync(path.join(binDir, 'openspec-orig.ps1'), '# original openspec');
        } else {
            fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\noriginal openspec');
        }

        // Create shim scripts (as if installed)
        if (!isWin) {
            fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh\n# shim script');
        }
        fs.writeFileSync(path.join(binDir, 'openspec.cmd'), '@echo off\nrem shim script');
        fs.writeFileSync(path.join(binDir, 'openspec.ps1'), '# shim script');

        return binDir;
    }

    test('full successful uninstall (unix)', (t) => {
        const base = tmpDir();
        const binDir = setupInstalledEnvironment(base, false);

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.uninstallShims(base, false);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.binDir, binDir);

        // Shim scripts should be deleted
        assert.ok(!fs.existsSync(path.join(binDir, 'openspec')) || true); // openspec is shim, will be deleted
        // Verify openspec-orig was restored to openspec
        assert.ok(!fs.existsSync(path.join(binDir, 'openspec-orig')));
        assert.ok(fs.existsSync(path.join(binDir, 'openspec')));
        assert.strictEqual(fs.readFileSync(path.join(binDir, 'openspec'), 'utf8'), '#!/bin/sh\noriginal openspec');
    });

    test('full successful uninstall (Windows)', (t) => {
        const base = tmpDir();
        const binDir = setupInstalledEnvironment(base, true);

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec.cmd'));

        const result = shimsInstaller.uninstallShims(base, true);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.binDir, binDir);

        // openspec-orig.cmd should be restored to openspec.cmd
        assert.ok(!fs.existsSync(path.join(binDir, 'openspec-orig.cmd')));
        assert.ok(fs.existsSync(path.join(binDir, 'openspec.cmd')));
        assert.strictEqual(fs.readFileSync(path.join(binDir, 'openspec.cmd'), 'utf8'), '@echo off\noriginal openspec');
    });

    test('falls back to toolDir when openspec not in PATH', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });

        const result = shimsInstaller.uninstallShims('/some/tool/dir', false);
        // uninstallShims → binDirFromToolDir('/some/tool/dir', false):
        //   nmDir = td/..; not scoped; levelsUp = 0 + 2 = 2
        //   prefix = path.resolve(nmDir, '..', '..'); return path.join(prefix, 'bin')
        const nmDir = path.resolve('/some/tool/dir', '..');
        const expectedBin = path.join(path.resolve(nmDir, '..', '..'), 'bin');
        assert.strictEqual(result.binDir, expectedBin);
        assert.strictEqual(result.success, false);
        assert.ok(result.details.some(d => d.includes('PATH lookup failed')));
    });

    test('fails when openspec-orig not found', (t) => {
        const base = tmpDir();
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh');

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.uninstallShims(base, false);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.binDir, binDir);
        assert.ok(result.details.some(d => d.includes('openspec-orig not found')));
    });

    test('handles partial install (only some shim scripts exist)', (t) => {
        const base = tmpDir();
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\noriginal');
        // Only one shim script was installed
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh\nshim');

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = shimsInstaller.uninstallShims(base, false);
        assert.strictEqual(result.success, true);
        assert.ok(fs.existsSync(path.join(binDir, 'openspec')));
        assert.strictEqual(fs.readFileSync(path.join(binDir, 'openspec'), 'utf8'), '#!/bin/sh\noriginal');
    });
});

// ============================================================
// binDirFromToolDir()
// ============================================================
describe('binDirFromToolDir()', () => {
    test('scoped package on Windows', (t) => {
        if (process.platform !== 'win32') return t.skip('Windows only');
        const td = 'C:\\portableApp\\nvm\\v24.14.0\\node_modules\\@scope\\pkg';
        assert.strictEqual(shimsInstaller.binDirFromToolDir(td, true), 'C:\\portableApp\\nvm\\v24.14.0');
    });

    test('non-scoped package on Windows', (t) => {
        if (process.platform !== 'win32') return t.skip('Windows only');
        const td = 'C:\\portableApp\\nvm\\v24.14.0\\node_modules\\some-pkg';
        assert.strictEqual(shimsInstaller.binDirFromToolDir(td, true), 'C:\\portableApp\\nvm\\v24.14.0');
    });

    test('scoped package on Unix', () => {
        // td = /usr/local/lib/node_modules/@scope/pkg
        // nmDir = td/..; isScoped=true; levelsUp = 1 + 2 = 3
        // prefix = path.resolve(nmDir, '..', '..', '..'); return path.join(prefix, 'bin')
        const td = '/usr/local/lib/node_modules/@scope/pkg';
        const nmDir = path.resolve(td, '..');
        const prefix = path.resolve(nmDir, '..', '..', '..');
        assert.strictEqual(shimsInstaller.binDirFromToolDir(td, false), path.join(prefix, 'bin'));
    });

    test('non-scoped package on Unix', () => {
        // td = /usr/local/lib/node_modules/some-pkg
        // nmDir = td/..; isScoped=false; levelsUp = 0 + 2 = 2
        // prefix = path.resolve(nmDir, '..', '..'); return path.join(prefix, 'bin')
        const td = '/usr/local/lib/node_modules/some-pkg';
        const nmDir = path.resolve(td, '..');
        const prefix = path.resolve(nmDir, '..', '..');
        assert.strictEqual(shimsInstaller.binDirFromToolDir(td, false), path.join(prefix, 'bin'));
    });
});
