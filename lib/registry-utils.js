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
 * 格式化一个注册表条目为 openspec list 风格的输出行。
 * @param {{name:string, status:string, worktree:string}} entry
 * @returns {string}
 */
function formatWorktreeEntry(entry) {
    const name = entry.name.padEnd(20).slice(0, 20);
    const status = (entry.status || 'created').padEnd(12).slice(0, 12);
    const wt = entry.worktree || '';
    return `  ${name} ${status} worktree      ${wt}`;
}

/**
 * 合并原生 openspec list 输出与 registry 注册表。
 *
 * 逻辑：
 * 1. 保留原生输出的 header + 每个条目行
 * 2. 遍历 registry 条目，检测 worktree 目录是否存在
 * 3. 跳过目录不存在的条目
 * 4. 同名条目以 registry 为准（去重）
 * 5. 追加 registry 条目到原生输出后
 *
 * @param {string} nativeOutput — openspec-orig list 的原始输出
 * @param {{changes:Array}} registry — 注册表数据
 * @param {string} [projectRoot] — 项目根目录，用于检测 worktree 目录存在性
 * @returns {string}
 */
function mergeList(nativeOutput, registry, projectRoot) {
    const entries = registry.changes || [];
    if (entries.length === 0) return nativeOutput;

    // 收集 registry 中活跃的条目名（去重用）
    const registryNames = new Set();

    // 格式化 registry 条目，跳过目录不存在的
    const wtLines = [];
    for (const entry of entries) {
    const wtPath = entry.worktree
        ? (projectRoot ? path.join(projectRoot, entry.worktree) : entry.worktree)
        : null;
    if (wtPath && projectRoot && !fs.existsSync(wtPath)) {
        continue; // 跳过 worktree 目录不存在的条目
    }
        registryNames.add(entry.name);
        wtLines.push(formatWorktreeEntry(entry));
    }

    if (wtLines.length === 0) return nativeOutput;

    // 处理原生输出：保留 header，过滤被 registry 覆盖的条目
    const lines = nativeOutput.split('\n');
    const result = [];
    let hasChangesHeader = false;

    for (const line of lines) {
        // 保留 Changes: header
        if (line.trim().startsWith('Changes:')) {
            result.push(line);
            hasChangesHeader = true;
            continue;
        }
        // 跳过空行
        if (!line.trim()) continue;
        // 尝试提取条目名（格式：两个空格 + 名称）
        const trimmed = line.trimStart();
        const nameMatch = trimmed.match(/^(\S+)/);
        if (nameMatch && registryNames.has(nameMatch[1])) {
            continue; // 被 registry 覆盖的原生条目
        }
        result.push(line);
    }

    // 如果原生输出没有 Changes: header，补一个
    if (!hasChangesHeader) {
        result.push('Changes:');
    }

    // 追加 registry 条目
    for (const wtLine of wtLines) {
        result.push(wtLine);
    }

    // 补结尾空行（如果有的话）
    if (nativeOutput.endsWith('\n')) {
        result.push('');
    }

    return result.join('\n');
}

const { execSync } = require('child_process');

/**
 * CLI 入口：node registry-utils.js list <projectRoot>
 * 被包装脚本调用，输出合并后的 list 结果。
 */
function runCLI() {
    const [cmd, projectRoot] = process.argv.slice(2);

    if (cmd === 'list' && projectRoot) {
        let nativeOutput = '';
        try {
            nativeOutput = execSync('openspec-orig list', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: projectRoot
            });
        } catch (e) {
            nativeOutput = e.stdout || '';
        }

        const registryPath = path.join(projectRoot, 'openspec', 'changes.json');
        const registry = readRegistry(registryPath);
        const merged = mergeList(nativeOutput, registry, projectRoot);
        process.stdout.write(merged);
        process.exit(0);
    }

    process.exit(1);
}

if (require.main === module) {
    runCLI();
}

module.exports = { findProjectRoot, readRegistry, formatWorktreeEntry, mergeList };
