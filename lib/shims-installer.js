/**
 * shims-installer.js — 在 openspec CLI 所在目录安装/卸除垫片脚本。
 *
 * 工作流：
 * === 安装 ===
 * 1. 定位 openspec CLI bin 目录
 * 2. openspec-orig 不存在时复制 openspec → openspec-orig
 * 3. 从 lib/shims/ 读取平台垫片模板，替换 {{TOOL_DIR}}，写入同名文件
 * 4. 设置可执行权限
 *
 * === 卸除 ===
 * 1. 定位 openspec CLI bin 目录
 * 2. 删除垫片文件
 * 3. 恢复 openspec-orig → openspec
 *
 * 被 `openspec-superpowers-opencode install-shims` 和 `uninstall-shims` 调用。
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

/**
 * 从工具安装目录推算 npm prefix bin 目录。
 *
 * 不用 PATH/where/which，纯路径计算，适用于 npm uninstall 这类
 * 环境变量被修改的场景。
 *
 * 例：
 *   td = .../node_modules/@scope/pkg  →  ...               (Windows)
 *   td = .../node_modules/pkg         →  .../bin            (Unix)
 *
 * @param {string} td — 工具安装根目录（package dir in node_modules）
 * @param {boolean} isWin
 * @returns {string}
 */
function binDirFromToolDir(td, isWin) {
    const nmDir = path.resolve(td, '..');
    const isScoped = path.basename(path.dirname(td)).startsWith('@');

    // Levels up from nmDir to reach prefix:
    //   Windows non-scoped: nmDir = {prefix}/node_modules → 1 up
    //   Windows scoped:     nmDir = {prefix}/node_modules/@scope → 2 up
    //   Unix    non-scoped: nmDir = {prefix}/lib/node_modules → 2 up
    //   Unix    scoped:     nmDir = {prefix}/lib/node_modules/@scope → 3 up
    const levelsUp = (isScoped ? 1 : 0) + (isWin ? 1 : 2);
    const ups = Array.from({ length: levelsUp }, () => '..');
    const prefix = path.resolve(nmDir, ...ups);
    return isWin ? prefix : path.join(prefix, 'bin');
}

/**
 * 查找 openspec CLI 的 bin 目录。
 * @param {boolean} isWin
 * @returns {string|null}
 */
function findOpenspecBinDir(isWin) {
    try {
        const whichCmd = isWin ? 'where openspec' : 'which openspec';
        const output = child_process.execSync(whichCmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
        // where 可能返回多行，取第一行
        const firstLine = output.split('\n')[0].trim();
        if (!firstLine) return null;
        return path.dirname(firstLine);
    } catch {
        return null;
    }
}

/**
 * 检测 openspec-orig 是否已存在于 bin 目录。
 * @param {string} binDir
 * @param {boolean} isWin
 * @returns {boolean}
 */
function openspecOrigExists(binDir, isWin) {
    const candidates = isWin
        ? ['openspec-orig.cmd', 'openspec-orig.ps1', 'openspec-orig']
        : ['openspec-orig', 'openspec-orig.cmd', 'openspec-orig.ps1'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(binDir, c))) return true;
    }
    return false;
}

/**
 * 在 npm 全局安装中找到真正的 openspec 文件路径。
 * 当 openspec 已被垫片覆盖时，无法从 bin 目录获取原版信息，
 * 需要通过 npm 全局安装目录定位。
 * @param {string} toolDir — 工具安装根目录（package dir in node_modules）
 * @param {string} binDir — openspec CLI bin 目录
 * @param {boolean} isWin
 * @returns {string|null}  openspec.js 的绝对路径，找不到返回 null
 */
function findRealOpenspec(toolDir, binDir, isWin) {
    // 工具函数：在给定 node_modules 根下搜索 openspec.js
    function searchInNmRoot(nmRoot) {
        if (!nmRoot || !fs.existsSync(nmRoot)) return null;
        for (const rel of [
            '@fission-ai/openspec/bin/openspec.js',
            'openspec/bin/openspec.js',
        ]) {
            const p = path.join(nmRoot, rel);
            if (fs.existsSync(p)) return p;
        }
        return null;
    }

    // 1. 从 toolDir（当前包安装目录）推导 node_modules 根
    //    toolDir = .../node_modules/@scope/pkg  → 上两级到 node_modules
    //    toolDir = .../node_modules/pkg         → 上一级到 node_modules
    let found = searchInNmRoot(path.resolve(toolDir, '..', '..'));
    if (found) return found;
    found = searchInNmRoot(path.resolve(toolDir, '..'));
    if (found) return found;

    // 2. 回退：npm root -g
    try {
        const npmRoot = child_process.execSync('npm root -g', { stdio: 'pipe', encoding: 'utf8' }).trim();
        found = searchInNmRoot(npmRoot);
        if (found) return found;
    } catch { }

    // 3. 回退：从 binDir 推算
    //    Unix: binDir = /usr/local/bin  → prefix = /usr/local →  lib/node_modules
    //    Windows: binDir = C:\prefix    →  node_modules（同级）
    try {
        const prefix = path.resolve(binDir, '..');
        for (const dir of [
            path.join(binDir, 'node_modules'),
            path.join(prefix, 'lib', 'node_modules'),
            path.join(prefix, 'node_modules'),
        ]) {
            found = searchInNmRoot(dir);
            if (found) return found;
        }
    } catch { }

    return null;
}

/**
 * 复制 openspec 为 openspec-orig。
 * @param {string} toolDir — 工具安装根目录（用于 findRealOpenspec 定位 openspec.js）
 * @param {string} binDir
 * @param {boolean} isWin
 * @returns {string} 复制的目标文件名
 */
function copyOpenspecToOrig(toolDir, binDir, isWin) {
    // 找出实际的 openspec 文件名
    const candidates = isWin
        ? ['openspec.cmd', 'openspec.ps1', 'openspec']
        : ['openspec', 'openspec.cmd', 'openspec.ps1'];
    let srcFile = null;
    for (const c of candidates) {
        const p = path.join(binDir, c);
        if (fs.existsSync(p)) { srcFile = c; break; }
    }
    if (!srcFile) throw new Error('openspec CLI not found in bin directory');

    // 目标文件名：openspec → openspec-orig（保持后缀一致）
    const ext = path.extname(srcFile);
    const destName = `openspec-orig${ext}` || 'openspec-orig';
    const destPath = path.join(binDir, destName);

    const srcPath = path.join(binDir, srcFile);

    // 工具函数：Windows 上创建 .cmd 包装器（替代符号链接到 .js）
    function writeWinCmdWrapper(jsAbsPath) {
        // 统一正斜杠，避免 cmd 中转义问题
        const normalized = jsAbsPath.replace(/\\/g, '/');
        const wrapper = '@echo off\r\nnode "' + normalized + '" %*\r\n';
        fs.writeFileSync(destPath, wrapper, 'utf8');
    }

    // 工具函数：获取 realOrig 的绝对路径，Windows 上写 .cmd 包装器
    function createWinSafeOrig(jsPath) {
        if (isWin) {
            writeWinCmdWrapper(jsPath);
        } else {
            fs.symlinkSync(jsPath, destPath);
        }
    }

    // 如果 openspec 已经是垫片（前一次安装留下），不要备份垫片本身
    try {
        const content = fs.readFileSync(srcPath, 'utf8');
        if (content.includes('openspec shim for oso registry')) {
            // openspec 已是垫片 — 验证 openspec-orig 是否有效
            if (fs.existsSync(destPath)) {
                const origStat = fs.lstatSync(destPath);
                if (origStat.isSymbolicLink() || origStat.size > 100) {
                    // Unix 符号链接或 Windows 有效 .cmd 包装器，保留
                    // 符号链接不会走到这里（Windows 返回 .cmd 包装器后不再是链接）
                    return destName;
                }
                // 文件内容损坏（旧版本留下的损坏文件），删除重建
                fs.unlinkSync(destPath);
            }
            // 找到真正的 openspec（npm 全局安装的符号链接目标），创建有效备份
            const realOrig = findRealOpenspec(toolDir, binDir, isWin);
            if (realOrig) {
                createWinSafeOrig(realOrig);
            }
            if (!fs.existsSync(destPath)) {
                throw new Error('openspec is already a shim but no openspec-orig backup found');
            }
            return destName;
        }
    } catch (e) {
        if (e.message.includes('openspec is already a shim')) throw e;
        // 读取失败（二进制文件等）则继续走正常流程
    }
    // 如果 openspec 是符号链接（npm -g 安装的典型情况），
    // Unix 保留为符号链接以避免相对路径 import 错误；
    // Windows 则写 .cmd 包装器，因为 cmd.exe 无法执行指向 .js 的符号链接
    try {
        const stat = fs.lstatSync(srcPath);
        if (stat.isSymbolicLink()) {
            const linkTarget = fs.readlinkSync(srcPath);
            createWinSafeOrig(linkTarget);
            return destName;
        }
    } catch {
        // lstat 失败时回退到 copyFile
    }
    fs.copyFileSync(srcPath, destPath);
    return destName;
}

/**
 * 安装垫片脚本（替换 TOOL_DIR 占位符 + 写入 bin 目录）。
 * @param {string} toolDir — 工具安装根目录（替换 {{TOOL_DIR}}）
 * @param {string} binDir — openspec CLI 所在 bin 目录
 * @param {boolean} isWin
 * @returns {string[]} 写入的文件名列表
 */
function installShimScripts(toolDir, binDir, isWin) {
    const shimsDir = path.join(toolDir, 'lib', 'shims');
    const templates = isWin
        ? ['openspec.cmd', 'openspec.ps1']
        : ['openspec', 'openspec.cmd', 'openspec.ps1'];

    const written = [];

    for (const tmpl of templates) {
        const tmplPath = path.join(shimsDir, tmpl);
        if (!fs.existsSync(tmplPath)) continue;

        let content = fs.readFileSync(tmplPath, 'utf8');
        // 替换 {{TOOL_DIR}} 占位符
        content = content.replace(/{{TOOL_DIR}}/g, toolDir);

        const destPath = path.join(binDir, tmpl);
        // 先删除已有文件/符号链接，避免 writeFileSync 跟随链接覆盖目标文件
        try { fs.unlinkSync(destPath); } catch { /* 不存在则忽略 */ }
        fs.writeFileSync(destPath, content, 'utf8');
        written.push(tmpl);
    }

    return written;
}

/**
 * 设置可执行权限。
 * @param {string} binDir
 * @param {string[]} files
 */
function setExecutable(binDir, files) {
    if (process.platform === 'win32') return; // Windows 不需要 chmod
    for (const f of files) {
        const p = path.join(binDir, f);
        try {
            fs.chmodSync(p, 0o755);
        } catch {
            // 权限不足时静默跳过
        }
    }
}

/**
 * 解析 openspec-orig 的实际文件名。
 * 优先顺序取决于平台：
 * - Unix: openspec-orig → openspec-orig.cmd → openspec-orig.ps1
 * - Windows: openspec-orig.cmd → openspec-orig.ps1 → openspec-orig
 * @param {string} binDir
 * @param {boolean} isWin
 * @returns {string|null} 找到的文件名，null 表示不存在
 */
function findOpenspecOrigFile(binDir, isWin) {
    const candidates = isWin
        ? ['openspec-orig.cmd', 'openspec-orig.ps1', 'openspec-orig']
        : ['openspec-orig', 'openspec-orig.cmd', 'openspec-orig.ps1'];
    for (const c of candidates) {
        if (fs.existsSync(path.join(binDir, c))) return c;
    }
    return null;
}

/**
 * 解析目标 openspec 文件名（还原目标）。
 * 由 openspec-orig 文件名推导：去掉 -orig 后缀。
 * @param {string} origFile — openspec-orig 文件名
 * @returns {string} 还原后的目标文件名
 */
function getRestoreTarget(origFile) {
    // openspec-orig → openspec, openspec-orig.cmd → openspec.cmd
    return 'openspec' + path.extname(origFile);
}

/**
 * 获取平台对应的垫片文件列表。
 * @param {boolean} isWin
 * @returns {string[]}
 */
function getShimFiles(isWin) {
    return isWin
        ? ['openspec.cmd', 'openspec.ps1']
        : ['openspec', 'openspec.cmd', 'openspec.ps1'];
}

/**
 * 主入口：安装垫片脚本。
 * @param {string} toolDir — 工具安装根目录
 * @param {boolean} isWin
 * @returns {{success: boolean, binDir: string|null, details: string[]}}
 */
function installShims(toolDir, isWin) {
    const details = [];

    // 1. 定位 bin 目录
    const binDir = findOpenspecBinDir(isWin);
    if (!binDir) {
        return {
            success: false,
            binDir: null,
            details: ['openspec CLI not found in PATH']
        };
    }
    details.push(`found openspec at: ${binDir}`);

    // 2. 处理 openspec-orig
    // 始终重建 openspec-orig，前任版本可能留下了损坏的副本（普通文件而非符号链接）
    try {
        const origName = copyOpenspecToOrig(toolDir, binDir, isWin);
        const origPath = path.join(binDir, origName);
        const stat = fs.existsSync(origPath) ? fs.lstatSync(origPath) : null;
        const backupDesc = stat && stat.isSymbolicLink() ? `symlink` : `file`;
        details.push(`openspec-orig: ${origName} (${backupDesc})`);
    } catch (e) {
        return {
            success: false,
            binDir,
            details: [...details, `failed to create openspec-orig: ${e.message}`]
        };
    }

    // 3. 安装垫片脚本
    let written;
    try {
        written = installShimScripts(toolDir, binDir, isWin);
        details.push(`installed shim scripts: ${written.join(', ')}`);
    } catch (e) {
        return {
            success: false,
            binDir,
            details: [...details, `failed to install shim scripts: ${e.message}`]
        };
    }

    // 4. 设置可执行权限
    setExecutable(binDir, written);

    return { success: true, binDir, details };
}

/**
 * 卸除垫片脚本。
 * @param {string} toolDir — 工具安装根目录（当前仅用于日志）
 * @param {boolean} isWin
 * @returns {{success: boolean, binDir: string|null, details: string[]}}
 */
function uninstallShims(toolDir, isWin) {
    const details = [];

    // 1. 定位 bin 目录：优先 PATH，失败时用 toolDir 推算（npm uninstall 场景 PATH 不可靠）
    let binDir = findOpenspecBinDir(isWin);
    if (!binDir) {
        binDir = binDirFromToolDir(toolDir, isWin);
        details.push(`PATH lookup failed, computed bin dir from toolDir: ${binDir}`);
    } else {
        details.push(`found openspec at: ${binDir}`);
    }

    // 2. 验证 openspec-orig 存在
    const origFile = findOpenspecOrigFile(binDir, isWin);
    if (!origFile) {
        return {
            success: false,
            binDir,
            details: [...details, 'openspec-orig not found — nothing to restore from']
        };
    }
    details.push(`found backup: ${origFile}`);

    // 3. 删除垫片文件
    const shimFiles = getShimFiles(isWin);
    const deleted = [];
    for (const sf of shimFiles) {
        const p = path.join(binDir, sf);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
            deleted.push(sf);
        }
    }
    details.push(`deleted shim files: ${deleted.join(', ') || '(none)'}`);

    // 4. 恢复 openspec-orig → openspec
    const targetName = getRestoreTarget(origFile);
    const srcPath = path.join(binDir, origFile);
    const destPath = path.join(binDir, targetName);

    fs.renameSync(srcPath, destPath);
    details.push(`restored: ${origFile} → ${targetName}`);

    return { success: true, binDir, details };
}

module.exports = { installShims, uninstallShims, findOpenspecBinDir, openspecOrigExists, copyOpenspecToOrig, installShimScripts, setExecutable, findOpenspecOrigFile, getRestoreTarget, getShimFiles, binDirFromToolDir, findRealOpenspec };
