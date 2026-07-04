/**
 * install-shims.js — 在 openspec CLI 所在目录安装/覆盖垫片脚本。
 *
 * 工作流：
 * 1. 定位 openspec CLI bin 目录
 * 2. openspec-orig 不存在时复制 openspec → openspec-orig
 * 3. 从 lib/shims/ 读取平台垫片模板，替换 {{TOOL_DIR}}，写入同名文件
 * 4. 设置可执行权限
 *
 * 被 `openspec-superpowers-opencode install-shims` 调用。
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

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

module.exports = { installShims, findOpenspecBinDir, openspecOrigExists, copyOpenspecToOrig, installShimScripts, setExecutable };
