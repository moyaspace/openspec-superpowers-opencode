const { test, describe } = require('node:test');
const assert = require('node:assert');
const child_process = require('child_process');
const path = require('path');

const cliPath = path.resolve(__dirname, '..', 'bin', 'cli.js');

function runCli(...args) {
    try {
        const stdout = child_process.execFileSync(process.execPath, [cliPath, ...args], {
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
