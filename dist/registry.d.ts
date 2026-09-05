export interface RegistryEntry {
    name: string;
    worktree: string;
    createdAt?: string | undefined;
    [key: string]: unknown;
}
export interface RegistryData {
    changes: RegistryEntry[];
}
/**
 * 读注册表文件
 * @param registryPath — openspec/oso-change-registry.json 的绝对路径
 */
declare function read(registryPath: string): RegistryData;
/**
 * 写注册表文件（确保目录存在）
 */
declare function write(registryPath: string, data: RegistryData): void;
/**
 * 添加条目（同名覆盖）
 */
declare function add(registryPath: string, name: string, worktree: string): void;
/**
 * 删除条目（保留空文件）
 */
declare function remove(registryPath: string, name: string): void;
/**
 * 格式化输出所有活跃变更
 */
declare function list(registryPath: string): string;
export interface RegistryResetResult {
    backupPath: string | null;
    changesCount: number;
}
/**
 * 重置注册表为空（可选备份原文件）。
 * @param backup — 是否备份原文件为 oso-change-registry.json.bak（默认 true）
 */
declare function reset(registryPath: string, backup?: boolean | undefined): RegistryResetResult;
export { read, write, add, remove, list, reset };
//# sourceMappingURL=registry.d.ts.map