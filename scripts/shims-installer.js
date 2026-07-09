#!/usr/bin/env node
/**
 * shims-installer.js — npm lifecycle hook。
 *
 * 用    法:
 *   node scripts/shims-installer.js install    安装垫片
 *   node scripts/shims-installer.js uninstall  卸除垫片
 *
 * 被 package.json 中的 scripts.install / scripts.preuninstall 调用。
 * preuninstall 阶段 npm 还未删除包文件，require 和 PATH 都可用。
 */

const path = require('path');
const toolDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

const action = process.argv[2];

if (!action || (action !== 'install' && action !== 'uninstall')) {
    console.error('Usage: node scripts/shims-installer.js <install|uninstall>');
    process.exit(1);
}

let installer;
try {
    installer = require(path.join(toolDir, 'lib', 'shims-installer'));
} catch (e) {
    console.error(`Failed to load shims-installer: ${e.message}`);
    process.exit(1);
}

const result = action === 'install'
    ? installer.installShims(toolDir, isWin)
    : installer.uninstallShims(toolDir, isWin);

for (const d of result.details) {
    console.log(`  ${d}`);
}

process.exit(result.success ? 0 : 1);
