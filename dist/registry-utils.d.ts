import type { RegistryEntry } from './registry.js';
/**
 * 通过 git rev-parse 定位项目根目录。
 * 在任何 checkout（main / worktree）中都返回同一路径。
 * @param cwd
 * @returns string|null
 */
declare function findProjectRoot(cwd: string): string | null;
/**
 * 返回注册表文件的完整路径：<root>/openspec/oso-change-registry.json。
 * 不在项目中时返回 null。
 * @param cwd
 * @returns string|null
 */
declare function getChangeRegistryPath(cwd: string): string | null;
export interface RegistryFileData {
    changes: RegistryEntry[];
}
/**
 * 读取 openspec/oso-change-registry.json。
 * 文件不存在或 JSON 损坏时返回空注册表。
 * @param registryPath
 */
declare function readRegistry(registryPath: string): RegistryFileData;
/**
 * 遍历活跃变更的 worktree，在每个 worktree 内执行 openspec-orig list，
 * 收集并合并输出结果。同名以第一个 worktree 的输出为准（first wins）。
 *
 * @param entries — registry 条目（仅 name + worktree）
 * @param projectRoot — 项目根目录
 * @returns 合并后的 list 输出
 */
declare function mergeList(entries: RegistryEntry[], projectRoot: string | null): string;
export type ListDecision = {
    action: 'passthrough';
} | {
    action: 'merge';
    data: RegistryFileData;
    projectRoot: string;
};
/**
 * 决策：list 命令应该透传还是合并。
 * @param registryPath
 * @param projectRoot
 */
declare function handleList(registryPath: string | null, projectRoot: string | null): ListDecision;
/**
 * 透传执行 openspec-orig 并退出。
 * @param args
 */
declare function execOpenspecOrig(args: string[]): never;
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
declare function mergeListJson(entries: RegistryEntry[], projectRoot: string | null): string;
export { findProjectRoot, getChangeRegistryPath, readRegistry, mergeList, mergeListJson, handleList, execOpenspecOrig };
//# sourceMappingURL=registry-utils.d.ts.map