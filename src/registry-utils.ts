import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import { pathToFileURL } from 'node:url';

import type { RegistryEntry } from './registry.js';

// ESM 具名绑定是不可变快照——测试通过 t.mock.method(child_process,
// 'execSync', ...) 在命名空间对象上打补丁，只有属性访问形式才能观测到，
// 故保持 child_process.execSync 调用形式而非解构具名导入。

/**
 * 通过 git rev-parse 定位项目根目录。
 * 在任何 checkout（main / worktree）中都返回同一路径。
 * @param cwd
 * @returns string|null
 */
function findProjectRoot(cwd: string): string | null {
    try {
        const result = child_process.execSync('git rev-parse --git-common-dir', {
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
 * @param cwd
 * @returns string|null
 */
function getChangeRegistryPath(cwd: string): string | null {
    const root = findProjectRoot(cwd);
    return root ? path.join(root, 'openspec', 'oso-change-registry.json') : null;
}

export interface RegistryFileData {
    changes: RegistryEntry[];
}

/**
 * 读取 openspec/oso-change-registry.json。
 * 文件不存在或 JSON 损坏时返回空注册表。
 * @param registryPath
 */
function readRegistry(registryPath: string): RegistryFileData {
    try {
        if (!fs.existsSync(registryPath)) {
            return { changes: [] };
        }
        const raw = fs.readFileSync(registryPath, 'utf8').trim();
        if (!raw) return { changes: [] };
        const parsed = JSON.parse(raw) as RegistryFileData;
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
 * @param entries — registry 条目（仅 name + worktree）
 * @param projectRoot — 项目根目录
 * @returns 合并后的 list 输出
 */
function mergeList(entries: RegistryEntry[], projectRoot: string | null): string {
    if (entries.length === 0) return 'No active changes found.\n';

    const seenNames = new Set<string>();
    const lines: string[] = [];
    const COLUMN = 52;
    const NAME_COL = 24;

    /**
     * 补齐 name 列宽度：将 "  <name>" 部分 padEnd 到 NAME_COL，
     * 使得不同长度的 name 后面 status/tasks/time 列对齐。
     * 不会截断长 name，只补齐短 name。
     */
    function alignName(line: string): string {
        const indentEnd = line.slice(2).search(/\s{2,}/);
        if (indentEnd > 0) {
            const head = line.slice(0, 2 + indentEnd);
            const tail = line.slice(2 + indentEnd).trimStart();
            return head.padEnd(NAME_COL) + '  ' + tail;
        }
        return line.padEnd(NAME_COL);
    }

    for (const entry of entries) {
        if (seenNames.has(entry.name)) continue;
        seenNames.add(entry.name);

        const wtPath = entry.worktree
            ? (projectRoot ? path.join(projectRoot, entry.worktree) : entry.worktree)
            : null;

        if (!wtPath || !fs.existsSync(wtPath)) {
            lines.push(alignName('  ' + entry.name).padEnd(COLUMN) + '  (no worktree)');
            continue;
        }

        let output = '';
        try {
            output = child_process.execSync('openspec-orig list', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: wtPath
            });
        } catch {
            lines.push(alignName('  ' + entry.name).padEnd(COLUMN) + '  (no worktree)');
            continue;
        }

        const outputLines = output.split('\n');
        const wtSuffix = '  ' + entry.worktree.replace(/\\/g, '/');
        let merged = false;
        for (const line of outputLines) {
            if (/^  \S/.test(line)) {
                const nameMatch = line.trim().match(/^(\S+)/);
                if (nameMatch && nameMatch[1] === entry.name) {
                    lines.push(alignName(line).padEnd(COLUMN) + wtSuffix);
                    merged = true;
                    break;
                }
            }
        }
        if (!merged) {
            lines.push(alignName('  ' + entry.name).padEnd(COLUMN) + '  (no worktree)');
        }
    }

    if (projectRoot) {
        try {
            const rootOutput = child_process.execSync('openspec-orig list', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: projectRoot
            });
            const rootLines = rootOutput.split('\n');
            for (const line of rootLines) {
                if (/^  \S/.test(line)) {
                    const nameMatch = line.trim().match(/^(\S+)/);
                    if (nameMatch && nameMatch[1] && !seenNames.has(nameMatch[1])) {
                        seenNames.add(nameMatch[1]);
                        lines.push(alignName(line).padEnd(COLUMN) + '  .');
                    }
                }
            }
        } catch {
        }
    }

    if (lines.length === 0) return 'No active changes found.\n';
    return 'Changes:\n' + lines.join('\n') + '\n';
}

export type ListDecision =
    | { action: 'passthrough' }
    | { action: 'merge'; data: RegistryFileData; projectRoot: string };

/**
 * 决策：list 命令应该透传还是合并。
 * @param registryPath
 * @param projectRoot
 */
function handleList(registryPath: string | null, projectRoot: string | null): ListDecision {
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
 * 透传执行 openspec-orig 并退出。
 * @param args
 */
function execOpenspecOrig(args: string[]): never {
    try {
        child_process.execSync('openspec-orig ' + args.join(' '), { stdio: 'inherit' });
    } catch (error) {
        process.exit((error as NodeJS.ErrnoException & { status?: number }).status || 1);
    }
    process.exit(0);
}

interface MergedChange {
    name?: unknown;
    worktree?: string | null;
    baseBranch?: string;
    [key: string]: unknown;
}

function withBaseBranch(change: MergedChange, entry: RegistryEntry): MergedChange {
    if (entry.baseBranch !== undefined) {
        change.baseBranch = entry.baseBranch;
    }
    return change;
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
 * @param entries
 * @param projectRoot
 * @returns 合并后的 JSON 字符串
 */
function mergeListJson(entries: RegistryEntry[], projectRoot: string | null): string {
    if (entries.length === 0) return '{"changes":[]}\n';

    const seenNames = new Set<string>();
    const allChanges: MergedChange[] = [];

    for (const entry of entries) {
        if (seenNames.has(entry.name)) continue;
        seenNames.add(entry.name);

        const wtPath = entry.worktree
            ? (projectRoot ? path.join(projectRoot, entry.worktree) : entry.worktree)
            : null;

        if (!wtPath || !fs.existsSync(wtPath)) {
            allChanges.push(withBaseBranch({ name: entry.name, worktree: null }, entry));
            continue;
        }

        let output = '';
        try {
            output = child_process.execSync('openspec-orig list --json', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: wtPath
            });
        } catch {
            allChanges.push(withBaseBranch({ name: entry.name, worktree: null }, entry));
            continue;
        }

        let parsed: { changes?: MergedChange[] } | undefined;
        try {
            parsed = JSON.parse(output) as { changes?: MergedChange[] };
        } catch {
            allChanges.push(withBaseBranch({ name: entry.name, worktree: null }, entry));
            continue;
        }
        if (!parsed || !Array.isArray(parsed.changes)) {
            allChanges.push(withBaseBranch({ name: entry.name, worktree: null }, entry));
            continue;
        }

        let merged = false;
        for (const change of parsed.changes) {
            if (change.name === entry.name) {
                change.worktree = entry.worktree.replace(/\\/g, '/');
                allChanges.push(withBaseBranch(change, entry));
                merged = true;
                break;
            }
        }
        if (!merged) {
            allChanges.push(withBaseBranch({ name: entry.name, worktree: null }, entry));
        }
    }

    if (projectRoot) {
        try {
            const rootOutput = child_process.execSync('openspec-orig list --json', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                cwd: projectRoot
            });
            const rootParsed = JSON.parse(rootOutput) as { changes?: MergedChange[] };
            if (rootParsed && Array.isArray(rootParsed.changes)) {
                for (const change of rootParsed.changes) {
                    if (!seenNames.has(change.name as string)) {
                        seenNames.add(change.name as string);
                        change.worktree = '.';
                        allChanges.push(change);
                    }
                }
            }
        } catch {
        }
    }

    return JSON.stringify({ changes: allChanges }, null, 2) + '\n';
}

function runCLI(): void {
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

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runCLI();
}

export { findProjectRoot, getChangeRegistryPath, readRegistry, mergeList, mergeListJson, handleList, execOpenspecOrig };

