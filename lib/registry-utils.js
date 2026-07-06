const fs = require('fs');
const path = require('path');

/**
 * 从 cwd 开始向上查找 openspec/changes.json，找到返回目录路径。
 * @param {string} cwd
 * @returns {string|null}
 */
function findProjectRoot(cwd) {
    let dir = path.resolve(cwd);
    const { root } = path.parse(dir);
    while (true) {
        const marker = path.join(dir, 'openspec', 'changes.json');
        if (fs.existsSync(marker)) {
            return dir;
        }
        if (dir === root) return null;
        dir = path.dirname(dir);
    }
}

/**
 * 读取 openspec/changes.json。
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
    if (entries.length === 0) return '';

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
 * CLI 入口：node registry-utils.js list <projectRoot>
 * 被包装脚本调用，输出合并后的 list 结果。
 */
function runCLI() {
    const [cmd, projectRoot] = process.argv.slice(2);

    if (cmd === 'list' && projectRoot) {
        const registryPath = path.join(projectRoot, 'openspec', 'changes.json');
        const registry = readRegistry(registryPath);
        const merged = mergeList(registry.changes, projectRoot);
        process.stdout.write(merged);
        process.exit(0);
    }

    process.exit(1);
}

if (require.main === module) {
    runCLI();
}

module.exports = { findProjectRoot, readRegistry, mergeList };
