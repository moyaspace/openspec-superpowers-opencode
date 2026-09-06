#!/usr/bin/env node
/**
 * shims-installer.mjs — npm install lifecycle hook.
 *
 * npm v7+ does NOT run preuninstall/uninstall/postuninstall scripts during
 * `npm uninstall` (by design).  Uninstall cleanup is handled by the shims
 * themselves — they detect when the package is gone and self-restore.
 *
 * Usage:
 *   node scripts/shims-installer.mjs install    install shims (called by npm install)
 *   node scripts/shims-installer.mjs uninstall  manual-only; npm will never call this
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installShims, uninstallShims } from '../dist/shims-installer.js';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const action = process.argv[2];

if (!action || (action !== 'install' && action !== 'uninstall')) {
    console.error('Usage: node scripts/shims-installer.mjs <install|uninstall>');
    process.exit(1);
}

if (action === 'install') {
    const result = installShims(toolDir, isWin);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
} else {
    // manual uninstall only — npm never calls this on v7+
    const result = uninstallShims(toolDir, isWin);
    for (const d of result.details) console.log(`  ${d}`);
    process.exit(result.success ? 0 : 1);
}
