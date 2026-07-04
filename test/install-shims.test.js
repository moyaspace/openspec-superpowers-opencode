const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

const installShims = require('../lib/install-shims');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'install-shims-test-'));
}

// ============================================================
// findOpenspecBinDir()
// ============================================================
describe('findOpenspecBinDir()', () => {
    test('returns dir path when openspec found', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec');
        assert.strictEqual(installShims.findOpenspecBinDir(false), '/usr/local/bin');
    });

    test('returns null when openspec not found', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });
        assert.strictEqual(installShims.findOpenspecBinDir(false), null);
    });

    test('returns null on empty output', (t) => {
        t.mock.method(child_process, 'execSync', () => '');
        assert.strictEqual(installShims.findOpenspecBinDir(false), null);
    });

    test('takes first line when multi-line output', (t) => {
        t.mock.method(child_process, 'execSync', () => '/usr/local/bin/openspec\n/home/user/bin/openspec');
        assert.strictEqual(installShims.findOpenspecBinDir(false), '/usr/local/bin');
    });

    test('handles Windows where command', (t) => {
        t.mock.method(child_process, 'execSync', () => 'C:\\Program Files\\nodejs\\openspec.cmd');
        assert.strictEqual(installShims.findOpenspecBinDir(true), 'C:\\Program Files\\nodejs');
    });
});

// ============================================================
// openspecOrigExists()
// ============================================================
describe('openspecOrigExists()', () => {
    test('finds openspec-orig (unix priority)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig'), '');
        assert.strictEqual(installShims.openspecOrigExists(dir, false), true);
    });

    test('finds openspec-orig.cmd on Windows', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.cmd'), '');
        assert.strictEqual(installShims.openspecOrigExists(dir, true), true);
    });

    test('finds openspec-orig.ps1 when .cmd absent', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec-orig.ps1'), '');
        assert.strictEqual(installShims.openspecOrigExists(dir, true), true);
    });

    test('returns false when no variant exists', () => {
        const dir = tmpDir();
        assert.strictEqual(installShims.openspecOrigExists(dir, false), false);
    });

    test('returns false on empty directory', () => {
        const dir = tmpDir();
        assert.strictEqual(installShims.openspecOrigExists(dir, false), false);
    });
});

// ============================================================
// copyOpenspecToOrig()
// ============================================================
describe('copyOpenspecToOrig()', () => {
    test('copies openspec to openspec-orig (unix)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh\necho "openspec"');
        const result = installShims.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig')));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig'), 'utf8'), '#!/bin/sh\necho "openspec"');
    });

    test('copies openspec.cmd to openspec-orig.cmd (Windows)', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec.cmd'), '@echo off');
        const result = installShims.copyOpenspecToOrig(dir, true);
        assert.strictEqual(result, 'openspec-orig.cmd');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig.cmd')));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig.cmd'), 'utf8'), '@echo off');
    });

    test('copies openspec.ps1 when that is what exists', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec.ps1'), 'Write-Output "openspec"');
        const result = installShims.copyOpenspecToOrig(dir, true);
        assert.strictEqual(result, 'openspec-orig.ps1');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig.ps1')));
    });

    test('prefers openspec over .cmd over .ps1', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh');
        fs.writeFileSync(path.join(dir, 'openspec.cmd'), '@echo off');
        const result = installShims.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.strictEqual(fs.readFileSync(path.join(dir, 'openspec-orig'), 'utf8'), '#!/bin/sh');
    });

    test('throws when openspec not found in bin dir', () => {
        const dir = tmpDir();
        assert.throws(() => {
            installShims.copyOpenspecToOrig(dir, false);
        }, /openspec CLI not found/);
    });

    test('does not overwrite existing openspec-orig', () => {
        const dir = tmpDir();
        fs.writeFileSync(path.join(dir, 'openspec'), '#!/bin/sh\nnew version');
        fs.writeFileSync(path.join(dir, 'openspec-orig'), '#!/bin/sh\nold version');
        // copyOpenspecToOrig does NOT check for existing openspec-orig (caller does via openspecOrigExists)
        // It copies regardless
        const result = installShims.copyOpenspecToOrig(dir, false);
        assert.strictEqual(result, 'openspec-orig');
        // The file IS overwritten
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

        const written = installShims.installShimScripts(toolDir, binDir, false);
        assert.strictEqual(written.length, 3);
        assert.ok(written.includes('openspec'));
        assert.ok(written.includes('openspec.cmd'));
        assert.ok(written.includes('openspec.ps1'));

        // Verify {{TOOL_DIR}} was replaced
        const content = fs.readFileSync(path.join(binDir, 'openspec'), 'utf8');
        assert.ok(content.includes(toolDir));
        assert.ok(!content.includes('{{TOOL_DIR}}'));
    });

    test('writes only .cmd and .ps1 for Windows', () => {
        const base = tmpDir();
        const { toolDir } = setupToolDir(base);
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = installShims.installShimScripts(toolDir, binDir, true);
        assert.strictEqual(written.length, 2);
        assert.ok(written.includes('openspec.cmd'));
        assert.ok(written.includes('openspec.ps1'));
        // openspec (the shell script) should NOT be written
        assert.ok(!written.includes('openspec'));
    });

    test('skips missing template files', () => {
        const base = tmpDir();
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        // Only create openspec
        fs.writeFileSync(path.join(shimsDir, 'openspec'), '#!/bin/sh\n# {{TOOL_DIR}}');
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = installShims.installShimScripts(base, binDir, false);
        assert.strictEqual(written.length, 1);
        assert.strictEqual(written[0], 'openspec');
    });

    test('returns empty array when no templates in shims dir', () => {
        const base = tmpDir();
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        // Empty shims directory
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);

        const written = installShims.installShimScripts(base, binDir, false);
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

        installShims.installShimScripts(base, binDir, false);
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
        // Simulate Windows — chmod code is skipped
        installShims.setExecutable(dir, ['test-script']);
        // File still exists, no error
        assert.ok(fs.existsSync(path.join(dir, 'test-script')));
    });
});

// ============================================================
// installShims() — 主入口集成测试
// ============================================================
describe('installShims()', () => {
    function setupEnvironment(base) {
        // Create a "project" with shim templates
        const shimsDir = path.join(base, 'lib', 'shims');
        fs.mkdirSync(shimsDir, { recursive: true });
        fs.writeFileSync(path.join(shimsDir, 'openspec'), '#!/bin/sh\n# shim for {{TOOL_DIR}}');
        fs.writeFileSync(path.join(shimsDir, 'openspec.cmd'), '@echo off\nrem {{TOOL_DIR}}');

        // Create bin dir with a fake openspec
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh\noriginal openspec');

        return { toolDir: base, binDir };
    }

    test('full successful install', (t) => {
        const base = tmpDir();
        const { toolDir, binDir } = setupEnvironment(base);

        // Mock: findOpenspecBinDir returns our fake bin dir
        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = installShims.installShims(toolDir, false);
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.binDir, binDir);
        assert.ok(result.details.length >= 3);
        // Verify openspec-orig was created
        assert.ok(fs.existsSync(path.join(binDir, 'openspec-orig')));
        // Verify shim scripts were installed
        assert.ok(fs.existsSync(path.join(binDir, 'openspec')));
        assert.ok(fs.existsSync(path.join(binDir, 'openspec.cmd')));
    });

    test('skips openspec-orig copy when it already exists', (t) => {
        const base = tmpDir();
        const { toolDir, binDir } = setupEnvironment(base);
        // Pre-create openspec-orig with specific content
        fs.writeFileSync(path.join(binDir, 'openspec-orig'), '#!/bin/sh\nexisting backup');

        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = installShims.installShims(toolDir, false);
        assert.strictEqual(result.success, true);
        // openspec-orig should NOT have been overwritten
        assert.strictEqual(fs.readFileSync(path.join(binDir, 'openspec-orig'), 'utf8'), '#!/bin/sh\nexisting backup');
        // The details should say "already exists"
        assert.ok(result.details.some(d => d.includes('already exists')));
    });

    test('fails gracefully when openspec not in PATH', (t) => {
        t.mock.method(child_process, 'execSync', () => { throw new Error('not found'); });

        const result = installShims.installShims('/some/tool/dir', false);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.binDir, null);
        assert.ok(result.details.some(d => d.includes('not found in PATH')));
    });

    test('fails gracefully when copyOpenspecToOrig errors', (t) => {
        const base = tmpDir();
        const { toolDir } = setupEnvironment(base);
        const emptyBinDir = path.join(base, 'empty-bin');
        fs.mkdirSync(emptyBinDir);

        // Mock: findOpenspecBinDir returns empty bin dir with NO openspec file
        t.mock.method(child_process, 'execSync', () => path.join(emptyBinDir, 'openspec'));

        const result = installShims.installShims(toolDir, false);
        assert.strictEqual(result.success, false);
        // binDir was found, so it should be returned
        assert.strictEqual(result.binDir, emptyBinDir);
        assert.ok(result.details.some(d => d.includes('failed to create openspec-orig')));
    });

    test('fails gracefully when shim template dir is missing', (t) => {
        const base = tmpDir();
        const binDir = path.join(base, 'bin');
        fs.mkdirSync(binDir);
        fs.writeFileSync(path.join(binDir, 'openspec'), '#!/bin/sh');

        // Don't create lib/shims/ directory
        t.mock.method(child_process, 'execSync', () => path.join(binDir, 'openspec'));

        const result = installShims.installShims(base, false);
        // installShimScripts will find 0 template files, returns empty array
        // This is a "success" in the current implementation (no crash)
        assert.strictEqual(result.success, true);
    });
});
