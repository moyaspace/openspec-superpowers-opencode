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
const os = require('os');

// ========== 诊断日志 ==========
const diagLog = [];
function diag(...args) { diagLog.push(args.join(' ')); }

// 也写到 TEMP 文件（因为 npm 可能吞 stdout/stderr）
const diagFile = path.join(os.tmpdir(), `shims-uninstall-${Date.now()}.log`);
diag('SHIMS-INSTALLER DIAGNOSTIC');
diag('timestamp:', new Date().toISOString());
diag('argv:', process.argv.join(' '));
diag('cwd:', process.cwd());
diag('__dirname:', __dirname);
diag('platform:', process.platform);
diag('PATH:', process.env.PATH || '(unset)');
diag('toolDir (resolved):', path.resolve(__dirname, '..'));

const toolDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

const action = process.argv[2];
diag('action:', action);

if (!action || (action !== 'install' && action !== 'uninstall')) {
    const msg = 'Usage: node scripts/shims-installer.js <install|uninstall>';
    console.error(msg);
    diag(msg);
    fs.writeFileSync(diagFile, diagLog.join('\n'), 'utf8');
    process.exit(1);
}

// 尝试从 lib 加载
let lib;
try {
    const libPath = path.join(toolDir, 'lib', 'shims-installer');
    diag('trying require:', libPath);
    lib = require(libPath);
    diag('lib loaded successfully, exports:', Object.keys(lib).join(', '));
} catch (e) {
    diag('lib require FAILED:', e.message);
    diag('lib require stack:', e.stack);
    lib = null;
}

// binDirFromToolDir: 优先 lib 导出，否则内联
const binDirFromToolDir = lib
    ? lib.binDirFromToolDir
    : (function(td) {
        const nmDir = path.resolve(td, '..');
        diag('  binDirFromToolDir: nmDir =', nmDir);
        const parentName = path.basename(path.dirname(td));
        diag('  binDirFromToolDir: parentName =', parentName);
        const nmParent = parentName.startsWith('@')
            ? path.resolve(nmDir, '..', '..')
            : path.resolve(nmDir, '..');
        diag('  binDirFromToolDir: nmParent =', nmParent);
        const result = isWin ? nmParent : path.join(nmParent, 'bin');
        diag('  binDirFromToolDir: result =', result);
        return result;
    });

// 辅助函数
function getShimFiles(win) {
    return lib ? lib.getShimFiles(win) : (win
        ? ['openspec.cmd', 'openspec.ps1']
        : ['openspec', 'openspec.cmd', 'openspec.ps1']);
}

function findOpenspecOrigFile(dir2, win) {
    if (lib) return lib.findOpenspecOrigFile(dir2, win);
    const candidates = win
        ? ['openspec-orig.cmd', 'openspec-orig.ps1', 'openspec-orig']
        : ['openspec-orig', 'openspec-orig.cmd', 'openspec-orig.ps1'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(dir2, c))) return c;
    }
    return null;
}

function getRestoreTarget(origFile) {
    return lib ? lib.getRestoreTarget(origFile) : 'openspec' + path.extname(origFile);
}

function checkDir(dir) {
    const entries = [];
    try {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const f of files) {
                if (f.includes('openspec')) entries.push(f);
            }
        } else {
            entries.push('(DIRECTORY DOES NOT EXIST)');
        }
    } catch (e) {
        entries.push('(READ ERROR: ' + e.message + ')');
    }
    return entries;
}

// ============================================================
// 卸载
// ============================================================
function uninstallShims(td) {
    const details = [];
    diag('--- uninstallShims ---');
    diag('td =', td);

    const binDir = binDirFromToolDir(td, isWin);
    diag('binDirFromToolDir result:', binDir);
    details.push(`computed bin dir: ${binDir}`);

    diag('checking binDir exists?', fs.existsSync(binDir));
    diag('openspec* files in binDir:', checkDir(binDir).join(', ') || '(none)');

    const origFile = findOpenspecOrigFile(binDir, isWin);
    diag('findOpenspecOrigFile result:', origFile);
    if (!origFile) {
        const msg = 'openspec-orig not found — nothing to restore';
        diag(msg);
        return { success: false, binDir, details: [...details, msg] };
    }
    details.push(`found backup: ${origFile}`);

    for (const sf of getShimFiles(isWin)) {
        const p = path.join(binDir, sf);
        diag('checking shim:', sf, 'exists?', fs.existsSync(p));
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            diag('deleted:', sf);
            details.push(`deleted: ${sf}`);
        }
    }

    const target = getRestoreTarget(origFile);
    diag('renaming', origFile, '→', target);
    const srcPath = path.join(binDir, origFile);
    const dstPath = path.join(binDir, target);
    diag('src exists?', fs.existsSync(srcPath));
    diag('dst exists?', fs.existsSync(dstPath));
    try {
        fs.renameSync(srcPath, dstPath);
        diag('rename succeeded');
    } catch (e) {
        diag('rename FAILED:', e.message);
        diag('rename stack:', e.stack);
        return { success: false, binDir, details: [...details, `rename failed: ${e.message}`] };
    }
    details.push(`restored: ${origFile} → ${target}`);
    diag('after restore, openspec* files:', checkDir(binDir).join(', ') || '(none)');

    return { success: true, binDir, details };
}

// ============================================================
// 入口
// ============================================================

try {
    if (action === 'install') {
        if (!lib) {
            const msg = 'Failed to load shims-installer module';
            console.error(msg);
            diag(msg);
            fs.writeFileSync(diagFile, diagLog.join('\n'), 'utf8');
            process.exit(1);
        }
        diag('--- installShims ---');
        const result = lib.installShims(toolDir, isWin);
        for (const d of result.details) console.log(`  ${d}`);
        diag('installShims result:', JSON.stringify(result));
        fs.writeFileSync(diagFile, diagLog.join('\n'), 'utf8');
        process.exit(result.success ? 0 : 1);
    } else {
        const result = uninstallShims(toolDir);
        for (const d of result.details) console.log(`  ${d}`);
        diag('uninstallShims result:', JSON.stringify(result));
        diag('diagnostic log written to:', diagFile);
        fs.writeFileSync(diagFile, diagLog.join('\n'), 'utf8');
        console.error('DIAGNOSTIC LOG:', diagFile);
        process.exit(result.success ? 0 : 1);
    }
} catch (e) {
    diag('UNCAUGHT ERROR:', e.message);
    diag('UNCAUGHT STACK:', e.stack);
    fs.writeFileSync(diagFile, diagLog.join('\n'), 'utf8');
    console.error('DIAGNOSTIC LOG:', diagFile);
    process.exit(1);
}
