#!/usr/bin/env node
/**
 * shims-installer.js — npm install lifecycle hook.
 *
 * npm v7+ does NOT run preuninstall/uninstall/postuninstall scripts during
 * `npm uninstall` (by design).  Uninstall cleanup is handled by the shims
 * themselves — they detect when the package is gone and self-restore.
 *
 * Usage:
 *   node scripts/shims-installer.js install    install shims (called by npm install)
 *   node scripts/shims-installer.js uninstall  manual-only; npm will never call this
 */

const path = require('path');
const toolDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const action = process.argv[2];

if (!action || (action !== 'install' && action !== 'uninstall')) {
    console.error('Usage: node scripts/shims-installer.js <install|uninstall>');
    process.exit(1);
}

let lib;
try {
    lib = require(path.join(toolDir, 'lib', 'shims-installer'));
} catch (e) {
    console.error(`Failed to load shims-installer: ${e.message}`);
    process.exit(1);
}

if (action === 'install') {
    const result = lib.installShims(toolDir, isWin);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
} else {
    // manual uninstall only — npm never calls this on v7+
    const result = lib.uninstallShims(toolDir, isWin);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
}
