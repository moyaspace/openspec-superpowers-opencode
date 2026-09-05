/**
 * verify.ts — 5 项系统完整性检查 + 逐项修复建议。
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

import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findProjectRoot } from './registry-utils.js';

/** 单项检查结果。 */
interface CheckResult {
    check: string;
    status: 'pass' | 'fail' | 'skip';
    message: string;
    fix: string | null;
}

/** 注册表 JSON 的解析形状（宽松）。 */
interface RegistryJsonLike {
    changes?: Array<{ name?: unknown; worktree?: unknown }> | unknown;
}

/**
 * 查找 openspec CLI 路径。
 * @param isWin
 * @returns string|null
 */
function findOpenspec(isWin: boolean): string | null {
    try {
        const whichCmd = isWin ? 'where openspec' : 'which openspec';
        const output = child_process.execSync(whichCmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
        return output.split('\n')[0]?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * 检查 openspec-orig 是否存在。
 * @param binDir
 * @param isWin
 * @returns string|null 存在返回路径，否则 null
 */
function findOpenspecOrig(binDir: string, isWin: boolean): string | null {
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
 * @param openspecPath
 */
function isShimScript(openspecPath: string): boolean {
    try {
        const content = fs.readFileSync(openspecPath, 'utf-8');
        return content.includes('openspec shim for oso registry');
    } catch {
        return false;
    }
}

/**
 * 检查 oso-change-registry.json 是否有效，返回条目数。
 * @param projectRoot
 * @returns {valid, count, error}
 */
function checkRegistryFile(projectRoot: string): { valid: boolean; count: number; error: string | null } {
    const regPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (!fs.existsSync(regPath)) {
        return { valid: false, count: 0, error: 'not found' };
    }
    try {
        const data = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as RegistryJsonLike;
        const count = data && Array.isArray(data.changes) ? data.changes.length : 0;
        return { valid: true, count, error: null };
    } catch {
        return { valid: false, count: 0, error: 'parse error' };
    }
}

/**
 * 检查所有 worktree 目录是否存在。
 * @param projectRoot
 * @returns {valid, missing}
 */
function checkWorktrees(projectRoot: string): { valid: boolean; missing: Array<{ name: string; worktree: string }> } {
    const regPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    const missing: Array<{ name: string; worktree: string }> = [];
    try {
        const data = JSON.parse(fs.readFileSync(regPath, 'utf-8')) as RegistryJsonLike;
        const changes = data && Array.isArray(data.changes) ? data.changes : [];
        for (const c of changes) {
            const entry = c as { name?: unknown; worktree?: unknown };
            const wt = typeof entry.worktree === 'string' ? entry.worktree : undefined;
            const nm = typeof entry.name === 'string' ? entry.name : undefined;
            if (wt && !fs.existsSync(path.join(projectRoot, wt))) {
                missing.push({ name: nm ?? '', worktree: wt });
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
 * @param toolDir — 工具安装目录
 * @param isWin
 * @param projectRoot — 项目根目录（可选，非项目环境下跳过 4+5）
 * @returns CheckResult[]
 */
function runAllChecks(toolDir: string, isWin: boolean, projectRoot: string | null): CheckResult[] {
    const results: CheckResult[] = [];

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
        let shimmed = isShimScript(openspecPath);
        // Windows 上垫片是 .cmd/.ps1 旁路文件，原 openspec 无扩展名文件不变
        if (!shimmed && isWin) {
            shimmed = isShimScript(path.join(binDir, 'openspec.cmd'))
                   || isShimScript(path.join(binDir, 'openspec.ps1'));
        }
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
 * @param results
 * @returns string
 */
function formatResults(results: CheckResult[]): string {
    const lines: string[] = [];
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
 * @param results
 */
function allPass(results: Array<Pick<CheckResult, 'status'>>): boolean {
    return results.every(r => r.status === 'pass' || r.status === 'skip');
}

/**
 * CLI 入口。
 *
 * ESM 迁移说明：原 CJS 版在 try/catch 中动态加载 registry-utils，
 * 并回退到加载 bin/cli（后者注释明确"cli.js 不导出
 * findProjectRoot，跳过"——该兜底从不产生可用值）。registry-utils 与本
 * 模块同属 dist/ 静态资源，加载不会失败，故等价转换为顶层静态 import，
 * 删除无副作用的 cli.js 兜底加载（动态 import('../cli/index.js') 反而
 * 会触发 CLI 副作用执行）。
 */
function runCLI(): void {
    const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const isWin = process.platform === 'win32';

    // 尝试查找项目根
    const projectRoot = findProjectRoot(process.cwd());

    const results = runAllChecks(toolDir, isWin, projectRoot);
    const output = formatResults(results);
    console.log(output);

    const ok = allPass(results);
    process.exit(ok ? 0 : 1);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCLI();
}

export { runAllChecks, formatResults, allPass, findOpenspec, findOpenspecOrig, isShimScript, checkRegistryFile, checkWorktrees };
