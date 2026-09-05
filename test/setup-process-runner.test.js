import { createProcessRunner } from '../dist/setup/process-runner.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('process runner', () => {
    it('executes a program with an argument array and captures output', () => {
        const runner = createProcessRunner();

        const result = runner.run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', 'hello world']);

        assert.equal(result.code, 0);
        assert.equal(result.stdout, 'hello world');
        assert.equal(result.stderr, '');
    });

    it('invokes Windows command shims through ComSpec without shell mode', () => {
        const calls = [];
        const runner = createProcessRunner({
            platform: 'win32',
            spawnSync(program, args, options) {
                calls.push({ program, args, options });
                return { status: 0, stdout: '', stderr: '', signal: null };
            },
        });

        runner.run('opencode', ['--version']);
        runner.run('git', ['--version']);

        assert.equal(calls[0].program, process.env.ComSpec || 'cmd.exe');
        assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/s', '/c']);
        assert.equal(calls[0].options.shell, false);
        assert.equal(calls[1].program, 'git');
        assert.equal(calls[1].options.shell, false);
    });

    it('preserves arguments passed through a Windows command shim', { skip: process.platform !== 'win32' }, (t) => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-runner-'));
        const shim = path.join(tempDir, 'with space', 'echo-argument.cmd');
        t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
        fs.mkdirSync(path.dirname(shim));
        fs.writeFileSync(shim, '@node -e "process.stdout.write(process.argv[1])" %*\r\n');

        const result = createProcessRunner().run(shim, ['hello world']);

        assert.equal(result.code, 0);
        assert.equal(result.stdout, 'hello world');
        assert.equal(result.stderr, '');
    });
});
