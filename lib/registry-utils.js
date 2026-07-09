const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 通过 git rev-parse 定位项目根目录。
 * 在任何 checkout（main / worktree）中都返回同一路径。
 * @param {string} cwd
 * @returns {string|null}
 */
function findProjectRoot(cwd) {
    try {
        const result = execSync('git rev-parse --git-common-dir', {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        }).trim();
        if (!result) return null;
        // result 可能是相对路径（如 ".git"）或绝对路径
        return path.resolve(cwd, path.dirname(result));
    } catch {
        return null;
    }
}

/**
 * 返回注册表文件的完整路径：<root>/openspec/oso-change-registry.json。
 * 不在项目中时返回 null。
 * @param {string} cwd
 * @returns {string|null}
 */
function getChangeRegistryPath(cwd) {
    const root = findProjectRoot(cwd);
    return root ? path.join(root, 'openspec', 'oso-change-registry.json') : null;
}

/**
 * 读取 openspec/oso-change-registry.json。
 * 文件不存在或 JSON 损坏时返回空注册表。
 * @param {string} registryPath
 * @returns {{changes: Array}}
 */
function readRegistry(registryPath) {
    try {
        if (!fs.existsSync(registryPath)) {
            return { changes: [] };
        }
        const raw = fs.readFileSync(registryPath, 'utf8').trim();
        if (!raw) return { changes: [] };
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.changes)) {
            return parsed;
        }
        return { changes: [] };
    } catch {
        return { changes: [] };
    }
}

/**
 * 遍历活跃变更的 worktree，在每个 worktree 内执行 openspec-orig list，
 * 收集并合并输出结果。同名以第一个 worktree 的输出为准（first wins）。
 *
 * @param {Array<{name:string, worktree:string}>} entries — registry 条目（仅 name + worktree）
 * @param {string} projectRoot — 项目根目录
 * @returns {string} 合并后的 list 输出
 */
function mergeList(entries, projectRoot) {
    if (entries.length === 0) return 'No active changes found.\n';

    const cp = require('child_process');
    const seenNames = new Set();
    const lines = [];

    for (const entry of entries) {
        if (seenNames.has(entry.name)) continue;

        const wtPath = entry.worktree
            ? (projectRoot ? path.join(projectRoot, entry.worktree) : entry.worktree)
            : null;

        if (!wtPath || !fs.existsSync(wtPath)) continue;

        let output = '';
        try {
            output = cp.execSync('openspec-orig list', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: wtPath
            });
        } catch {
            continue;
        }

        const outputLines = output.split('\n');
        for (const line of outputLines) {
            // 匹配 openspec list 数据行：以两个空格开头后跟非空字符
            if (/^  \S/.test(line)) {
                const nameMatch = line.trim().match(/^(\S+)/);
                if (nameMatch && !seenNames.has(nameMatch[1])) {
                    seenNames.add(nameMatch[1]);
                    lines.push(line);
                }
            }
        }
    }

    if (lines.length === 0) return 'No active changes found.\n';
    return 'Changes:\n' + lines.join('\n') + '\n';
}

/**
 * 决策：list 命令应该透传还是合并。
 * @param {string|null} registryPath
 * @param {string|null} projectRoot
 * @returns {{action: 'passthrough'} | {action: 'merge', data: object, projectRoot: string}}
 */
function handleList(registryPath, projectRoot) {
    if (!registryPath || !projectRoot) {
        return { action: 'passthrough' };
    }
    if (!fs.existsSync(registryPath)) {
        return { action: 'passthrough' };
    }
    const data = readRegistry(registryPath);
    return { action: 'merge', data, projectRoot };
}

/**
 * 透传执行 openspec-orig list 并退出。
 * @param {string[]} args
 */
function execOpenspecOrig(args) {
    const cp = require('child_process');
    try {
        cp.execSync('openspec-orig ' + args.join(' '), { stdio: 'inherit' });
    } catch (e) {
        process.exit(e.status || 1);
    }
    process.exit(0);
}

/**
 * CLI 入口：node registry-utils.js list
 * 被包装脚本调用，输出合并后的 list 结果。
 * 不再接收 projectRoot 参数——自己通过 findProjectRoot 计算。
 */
/**
 * 与 mergeList 逻辑相同，但输出 JSON 格式（openspec-orig list --json 格式）。
 * 遍历每个 registry entry 的 worktree，执行 openspec-orig list --json，
 * 收集并合并 changes 数组。同名以第一个 worktree 为准（first wins）。
 *
 * @param {Array<{name:string, worktree:string}>} entries
 * @param {string} projectRoot
 * @returns {string} 合并后的 JSON 字符串
 */
function mergeListJson(entries, projectRoot) {
    if (entries.length === 0) return '{"changes":[]}\n';

    const cp = require('child_process');
    const seenNames = new Set();
    const allChanges = [];

    for (const entry of entries) {
        if (seenNames.has(entry.name)) continue;

        const wtPath = entry.worktree
            ? (projectRoot ? path.join(projectRoot, entry.worktree) : entry.worktree)
            : null;
        if (!wtPath || !fs.existsSync(wtPath)) continue;

        let output = '';
        try {
            output = cp.execSync('openspec-orig list --json', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: wtPath
            });
        } catch {
            continue;
        }

        let parsed;
        try {
            parsed = JSON.parse(output);
        } catch {
            continue;
        }
        if (!parsed || !Array.isArray(parsed.changes)) continue;

        for (const change of parsed.changes) {
            if (change.name && !seenNames.has(change.name)) {
                seenNames.add(change.name);
                allChanges.push(change);
            }
        }
    }

    return JSON.stringify({ changes: allChanges }, null, 2) + '\n';
}

function runCLI() {
    const args = process.argv.slice(2);
    const cmd = args[0];
    const rest = args.slice(1);

    if (cmd === 'list') {
        const wantJson = rest.includes('--json');
        const registryPath = getChangeRegistryPath(process.cwd());
        const root = findProjectRoot(process.cwd());
        const decision = handleList(registryPath, root);
        if (decision.action === 'passthrough') {
            execOpenspecOrig(args);
            return;
        }
        if (wantJson) {
            const merged = mergeListJson(decision.data.changes, root);
            process.stdout.write(merged);
        } else {
            const merged = mergeList(decision.data.changes, root);
            process.stdout.write(merged);
        }
        process.exit(0);
    }

    process.exit(1);
}

if (require.main === module) {
    runCLI();
}

module.exports = { findProjectRoot, getChangeRegistryPath, readRegistry, mergeList, mergeListJson, handleList, execOpenspecOrig };
