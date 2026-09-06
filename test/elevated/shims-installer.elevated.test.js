/**
 * 提权测试套件：包含所有需要管理员权限的用例。
 *
 * Windows 创建符号链接是特权操作（需管理员或开发者模式）。
 * 本文件不在 `npm test` 的主 glob 内，由 test/run-elevated.mjs 编排：
 * 检测到 gsudo 可用时经 gsudo 提权运行，否则报告 skipped。
 * Unix/CI 上无需提权，普通 node --test 直接可跑。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import * as shimsInstaller from '../../dist/shims-installer.js';

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'shims-installer-test-'));
}

describe('copyOpenspecToOrig() [elevated]', () => {
    test('preserves symlink when openspec is a symlink', () => {
        const dir = tmpDir();
        // 模拟 npm -g 安装：openspec 是符号链接指向另一个目录的 JS 文件
        const targetDir = tmpDir();
        fs.writeFileSync(path.join(targetDir, 'openspec.js'), '#!/usr/bin/env node\nimport "../dist/cli/index.js";');
        fs.symlinkSync(path.join(targetDir, 'openspec.js'), path.join(dir, 'openspec'));
        const result = shimsInstaller.copyOpenspecToOrig(dir, dir, false);
        assert.strictEqual(result, 'openspec-orig');
        assert.ok(fs.existsSync(path.join(dir, 'openspec-orig')));
        const stat = fs.lstatSync(path.join(dir, 'openspec-orig'));
        assert.ok(stat.isSymbolicLink());
        assert.strictEqual(fs.readlinkSync(path.join(dir, 'openspec-orig')), path.join(targetDir, 'openspec.js'));
    });
});
