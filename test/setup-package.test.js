const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('setup package surface', () => {
    it('exposes the Node test suite as the package test command', () => {
        const pkg = require('../package.json');

        // 阶段 0 规范固定：test 先 typecheck/build 再跑 node 测试
        assert.match(pkg.scripts.test, /node --test/);
    });

    it('ships the JavaScript setup modules instead of platform scripts', () => {
        const root = path.resolve(__dirname, '..');

        assert.equal(fs.existsSync(path.join(root, 'lib', 'setup', 'index.js')), true);
        assert.equal(fs.existsSync(path.join(root, 'scripts', 'setup.ps1')), false);
        assert.equal(fs.existsSync(path.join(root, 'scripts', 'setup.sh')), false);
    });
});
