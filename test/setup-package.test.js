import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPkg() {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
}

describe('setup package surface', () => {
    it('exposes the Node test suite as the package test command', () => {
        const pkg = readPkg();

        // 阶段 0 规范固定：test 先 typecheck/build 再跑 node 测试
        assert.match(pkg.scripts.test, /node --test/);
    });

    it('ships the JavaScript setup modules instead of platform scripts', () => {
        const root = path.resolve(__dirname, '..');

        assert.equal(fs.existsSync(path.join(root, 'dist', 'setup', 'index.js')), true);
        assert.equal(fs.existsSync(path.join(root, 'scripts', 'setup.ps1')), false);
        assert.equal(fs.existsSync(path.join(root, 'scripts', 'setup.sh')), false);
    });
});
