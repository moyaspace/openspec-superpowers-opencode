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
 * 复制 openspec 为 openspec-orig。
 * @param {string} binDir
 * @param {boolean} isWin
 * @returns {string} 复制的目标文件名
 */
function copyOpenspecToOrig(binDir, isWin) {
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

    fs.copyFileSync(path.join(binDir, srcFile), destPath);
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
    const origExists = openspecOrigExists(binDir, isWin);
    if (!origExists) {
        try {
            const origName = copyOpenspecToOrig(binDir, isWin);
            details.push(`created: ${origName}`);
        } catch (e) {
            return {
                success: false,
                binDir,
                details: [...details, `failed to create openspec-orig: ${e.message}`]
            };
        }
    } else {
        details.push('openspec-orig already exists, skipped');
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

module.exports = { installShims, uninstallShims, findOpenspecBinDir, openspecOrigExists, copyOpenspecToOrig, installShimScripts, setExecutable, findOpenspecOrigFile, getRestoreTarget, getShimFiles, binDirFromToolDir };
