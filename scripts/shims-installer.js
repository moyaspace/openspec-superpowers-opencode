#!/usr/bin/env node
/**
 * shims-installer.js — npm lifecycle hook。
 *
 * 用    法:
 *   node scripts/shims-installer.js install    安装垫片
 *   node scripts/shims-installer.js uninstall  卸除垫片
 *
 * 被 package.json 中的 scripts.install / scripts.preuninstall 调用。
 *
 * 卸载时用 toolDir 推算 npm prefix bin 目录（不依赖 PATH，因为
 * npm uninstall 会在运行脚本前改动环境变量导致 where/which 查不到）。
 */

const path = require('path');
const fs = require('fs');

const toolDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

const action = process.argv[2];

if (!action || (action !== 'install' && action !== 'uninstall')) {
    console.error('Usage: node scripts/shims-installer.js <install|uninstall>');
    process.exit(1);
}

// ============================================================
// 从 toolDir 推算 npm prefix bin 目录
// 例：toolDir = .../node_modules/@scope/pkg
//     prefix = .../node_modules/@scope/pkg/../../.. = ...
//     binDir = prefix (Windows) 或 prefix/bin (Unix)
// ============================================================
function getBinDirFromToolDir(td) {
    // 先取 node_modules 的父目录 → npm prefix
    const nmDir = path.resolve(td, '..');
    // 如果上一级叫 @xxx（scoped package），再多取一级
    const nmParent = path.basename(path.dirname(td)).startsWith('@')
        ? path.resolve(nmDir, '..', '..')
        : path.resolve(nmDir, '..');
    return isWin ? nmParent : path.join(nmParent, 'bin');
}

// ============================================================
// 内联卸载逻辑（不依赖 lib/ 下的模块，因为 require 可能失败）
// ============================================================
function getShimFiles(win) {
    return win
        ? ['openspec.cmd', 'openspec.ps1']
        : ['openspec', 'openspec.cmd', 'openspec.ps1'];
}

function findOpenspecOrigFile(dir, win) {
    const candidates = win
        ? ['openspec-orig.cmd', 'openspec-orig.ps1', 'openspec-orig']
        : ['openspec-orig', 'openspec-orig.cmd', 'openspec-orig.ps1'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(dir, c))) return c;
    }
    return null;
}

function getRestoreTarget(origFile) {
    return 'openspec' + path.extname(origFile);
}

function uninstallShimsInline(td) {
    const details = [];
    const binDir = getBinDirFromToolDir(td);
    details.push(`computed bin dir: ${binDir}`);

    const origFile = findOpenspecOrigFile(binDir, isWin);
    if (!origFile) {
        return { success: false, binDir, details: [...details, 'openspec-orig not found — nothing to restore'] };
    }
    details.push(`found backup: ${origFile}`);

    // 删除垫片
    for (const sf of getShimFiles(isWin)) {
        const p = path.join(binDir, sf);
        if (fs.existsSync(p)) { fs.unlinkSync(p); details.push(`deleted: ${sf}`); }
    }

    // 恢复 openspec-orig → openspec
    const target = getRestoreTarget(origFile);
    fs.renameSync(path.join(binDir, origFile), path.join(binDir, target));
    details.push(`restored: ${origFile} → ${target}`);

    return { success: true, binDir, details };
}

// ============================================================
// 入口
// ============================================================

if (action === 'install') {
    // install 依赖 lib 模块（垫片模板等）
    let installer;
    try {
        installer = require(path.join(toolDir, 'lib', 'shims-installer'));
    } catch (e) {
        console.error(`Failed to load shims-installer: ${e.message}`);
        process.exit(1);
    }
    const result = installer.installShims(toolDir, isWin);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
} else {
    const result = uninstallShimsInline(toolDir);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
}
