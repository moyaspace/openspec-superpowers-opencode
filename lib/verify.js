/**
 * verify.js — 5 项系统完整性检查 + 逐项修复建议。
 *
 * 检查项：
 * 1. openspec CLI 是否在 PATH 中
 * 2. openspec-orig 是否存在（原版 CLI 备份）
 * 3. openspec 是否为包装脚本
 * 4. openspec/oso-change-registry.json 是否有效 JSON
 * 5. 注册表中所有 worktree 目录是否存在
 *
 * 输出格式：
 *   ✓ openspec: installed at /usr/local/bin/openspec
 *   ⚠ openspec-orig: not found
 *     修复：openspec-superpowers-opencode install-shims
 *
 * exit code: 全 ✓ → 0, 有 ⚠ → 1
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

/**
 * 查找 openspec CLI 路径。
 * @param {boolean} isWin
 * @returns {string|null}
 */
function findOpenspec(isWin) {
    try {
        const whichCmd = isWin ? 'where openspec' : 'which openspec';
        const output = child_process.execSync(whichCmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
        return output.split('\n')[0].trim() || null;
    } catch {
        return null;
    }
}

/**
 * 检查 openspec-orig 是否存在。
 * @param {string} binDir
 * @param {boolean} isWin
 * @returns {string|null} 存在返回路径，否则 null
 */
function findOpenspecOrig(binDir, isWin) {
    const candidates = isWin
        ? ['openspec-orig.cmd', 'openspec-orig.ps1', 'openspec-orig']
        : ['openspec-orig', 'openspec-orig.cmd', 'openspec-orig.ps1'];
    for (const c of candidates) {
        const p = path.join(binDir, c);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * 检查 openspec 文件是否已被垫片替换。
 * @param {string} openspecPath
 * @returns {boolean}
 */
function isShimScript(openspecPath) {
    try {
        const content = fs.readFileSync(openspecPath, 'utf-8');
        return content.includes('openspec shim for oso registry');
    } catch {
        return false;
    }
}

/**
 * 检查 oso-change-registry.json 是否有效，返回条目数。
 * @param {string} projectRoot
 * @returns {{valid: boolean, count: number, error: string|null}}
 */
function checkRegistryFile(projectRoot) {
    const regPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (!fs.existsSync(regPath)) {
        return { valid: false, count: 0, error: 'not found' };
    }
    try {
        const data = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
        const count = data && Array.isArray(data.changes) ? data.changes.length : 0;
        return { valid: true, count, error: null };
    } catch (e) {
        return { valid: false, count: 0, error: 'parse error' };
    }
}

/**
 * 检查所有 worktree 目录是否存在。
 * @param {string} projectRoot
 * @returns {{valid: boolean, missing: Array<{name: string, worktree: string}>}}
 */
function checkWorktrees(projectRoot) {
    const regPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    const missing = [];
    try {
        const data = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
        const changes = data && Array.isArray(data.changes) ? data.changes : [];
        for (const c of changes) {
            if (c.worktree && !fs.existsSync(path.join(projectRoot, c.worktree))) {
                missing.push({ name: c.name, worktree: c.worktree });
            }
        }
    } catch {
        // registry file is corrupted — can't check worktrees
        return { valid: false, missing: [] };
    }
    return { valid: missing.length === 0, missing };
}

/**
 * 运行所有 5 项检查，返回结构化结果。
 *
 * @param {string} toolDir — 工具安装目录
 * @param {boolean} isWin
 * @param {string|null} projectRoot — 项目根目录（可选，非项目环境下跳过 4+5）
 * @returns {Array<{check: string, status: 'pass'|'fail', message: string, fix: string|null}>}
 */
function runAllChecks(toolDir, isWin, projectRoot) {
    const results = [];

    // ---- Check 1: openspec 存在 ----
    const openspecPath = findOpenspec(isWin);
    if (openspecPath) {
        results.push({
            check: 'openspec',
            status: 'pass',
            message: `installed at ${openspecPath}`,
            fix: null
        });
    } else {
        results.push({
            check: 'openspec',
            status: 'fail',
            message: 'not found',
            fix: '请确保 openspec CLI 已安装（npm install -g @fission-ai/openspec）'
        });
    }

    // ---- Checks 2+3: openspec-orig + 包装脚本检测 ----
    if (openspecPath) {
        const binDir = path.dirname(openspecPath);

        // Check 2: openspec-orig
        const origPath = findOpenspecOrig(binDir, isWin);
        if (origPath) {
            results.push({
                check: 'openspec-orig',
                status: 'pass',
                message: `found at ${origPath}`,
                fix: null
            });
        } else {
            results.push({
                check: 'openspec-orig',
                status: 'fail',
                message: 'not found',
                fix: 'openspec-superpowers-opencode install-shims'
            });
        }

        // Check 3: openspec 已被垫片替换
        const shimmed = isShimScript(openspecPath);
        if (shimmed) {
            results.push({
                check: 'openspec (shim)',
                status: 'pass',
                message: 'is shim script',
                fix: null
            });
        } else {
            results.push({
                check: 'openspec (shim)',
                status: 'fail',
                message: 'not shim script',
                fix: 'openspec-superpowers-opencode install-shims'
            });
        }
    } else {
        // openspec 不存在，这两项无法检查
        results.push({
            check: 'openspec-orig',
            status: 'skip',
            message: 'openspec not installed',
            fix: null
        });
        results.push({
            check: 'openspec (shim)',
            status: 'skip',
            message: 'openspec not installed',
            fix: null
        });
    }

    // ---- Checks 4+5: 注册表文件 + worktree 目录 ----
    if (projectRoot) {
        const regCheck = checkRegistryFile(projectRoot);
        if (regCheck.valid) {
            results.push({
                check: 'oso-change-registry.json',
                status: 'pass',
                message: `valid (${regCheck.count} changes)`,
                fix: null
            });
        } else {
            results.push({
                check: 'oso-change-registry.json',
                status: 'fail',
                message: regCheck.error === 'not found' ? 'not found' : 'parse error',
                fix: regCheck.error === 'not found'
                    ? '在项目根目录创建 openspec/oso-change-registry.json 或运行 openspec-superpowers-opencode init'
                    : 'openspec-superpowers-opencode registry reset'
            });
        }

        const wtCheck = checkWorktrees(projectRoot);
        if (wtCheck.valid) {
            if (wtCheck.missing.length === 0) {
                results.push({
                    check: 'worktrees',
                    status: 'pass',
                    message: 'all present',
                    fix: null
                });
            } else {
                results.push({
                    check: 'worktrees',
                    status: 'pass',
                    message: 'no active changes',
                    fix: null
                });
            }
        } else {
            for (const m of wtCheck.missing) {
                results.push({
                    check: `worktree (${m.name})`,
                    status: 'fail',
                    message: `not found at ${m.worktree}`,
                    fix: `openspec-superpowers-opencode registry remove ${m.name}`
                });
            }
        }
    } else {
        results.push({
            check: 'oso-change-registry.json',
            status: 'skip',
            message: 'not in a project',
            fix: null
        });
        results.push({
            check: 'worktrees',
            status: 'skip',
            message: 'not in a project',
            fix: null
        });
    }

    return results;
}

/**
 * 格式化检查结果为可读文本。
 * @param {Array} results
 * @returns {string}
 */
function formatResults(results) {
    const lines = [];
    for (const r of results) {
        const icon = r.status === 'pass' ? '✓' : r.status === 'skip' ? '∼' : '⚠';
        lines.push(`${icon} ${r.check}: ${r.message}`);
        if (r.status === 'fail' && r.fix) {
            lines.push(`  修复：${r.fix}`);
        }
    }
    return lines.join('\n');
}

/**
 * 检查是否全部通过。
 * @param {Array} results
 * @returns {boolean}
 */
function allPass(results) {
    return results.every(r => r.status === 'pass' || r.status === 'skip');
}

/**
 * CLI 入口。
 */
function runCLI() {
    const toolDir = path.resolve(__dirname, '..');
    const isWin = process.platform === 'win32';

    // 尝试查找项目根
    let projectRoot = null;
    try {
        const findRoot = require('./registry-utils').findProjectRoot;
        projectRoot = findRoot(process.cwd());
    } catch {
        // registry-utils 不可用时用 cli.js 的 findProjectRoot
        try {
            const cliFindRoot = require('../bin/cli');
            // cli.js 不导出 findProjectRoot，跳过
        } catch {}
    }

    const results = runAllChecks(toolDir, isWin, projectRoot);
    const output = formatResults(results);
    console.log(output);

    const ok = allPass(results);
    process.exit(ok ? 0 : 1);
}

if (require.main === module) {
    runCLI();
}

module.exports = { runAllChecks, formatResults, allPass, findOpenspec, findOpenspecOrig, isShimScript, checkRegistryFile, checkWorktrees };
