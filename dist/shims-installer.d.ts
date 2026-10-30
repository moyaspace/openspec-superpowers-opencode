/**
 * shims-installer.ts — 在 openspec CLI 所在目录安装/卸除垫片脚本。
 *
 * 工作流：
 * === 安装 ===
 * 1. 定位 openspec CLI bin 目录
 * 2. openspec-orig 不存在时复制 openspec → openspec-orig
 * 3. 从 assets/shims/ 读取平台垫片模板，替换 {{TOOL_DIR}}，写入同名文件
 * 4. 设置可执行权限
 *
 * === 卸除 ===
 * 1. 定位 openspec CLI bin 目录
 * 2. 删除垫片文件
 * 3. 恢复 openspec-orig → openspec
 *
 * 被 `openspec-superpowers-opencode install-shims` 和 `uninstall-shims` 调用。
 */
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
 * @param td — 工具安装根目录（package dir in node_modules）
 * @param isWin
 */
declare function binDirFromToolDir(td: string, isWin: boolean): string;
/**
 * 查找 openspec CLI 的 bin 目录。
 * @param isWin
 * @returns string|null
 */
declare function findOpenspecBinDir(isWin: boolean): string | null;
/**
 * 检测 openspec-orig 是否已存在于 bin 目录。
 * @param binDir
 * @param isWin
 */
declare function openspecOrigExists(binDir: string, isWin: boolean): boolean;
/**
 * 在 npm 全局安装中找到真正的 openspec 文件路径。
 * 当 openspec 已被垫片覆盖时，无法从 bin 目录获取原版信息，
 * 需要通过 npm 全局安装目录定位。
 * @param toolDir — 工具安装根目录（package dir in node_modules）
 * @param binDir — openspec CLI bin 目录
 * @param isWin
 * @returns string|null  openspec.js 的绝对路径，找不到返回 null
 */
declare function findRealOpenspec(toolDir: string, binDir: string, isWin: boolean): string | null;
/**
 * 复制 openspec 为 openspec-orig。
 * @param toolDir — 工具安装根目录（用于 findRealOpenspec 定位 openspec.js）
 * @param binDir
 * @param isWin
 * @returns string 复制的目标文件名
 */
declare function copyOpenspecToOrig(toolDir: string, binDir: string, isWin: boolean): string;
/**
 * 安装垫片脚本（替换 TOOL_DIR 占位符 + 写入 bin 目录）。
 * @param toolDir — 工具安装根目录（替换 {{TOOL_DIR}}）
 * @param binDir — openspec CLI 所在 bin 目录
 * @param isWin
 * @returns string[] 写入的文件名列表
 */
declare function installShimScripts(toolDir: string, binDir: string, isWin: boolean): string[];
/**
 * 设置可执行权限。
 * @param binDir
 * @param files
 */
declare function setExecutable(binDir: string, files: string[]): void;
/**
 * 解析 openspec-orig 的实际文件名。
 * 优先顺序取决于平台：
 * - Unix: openspec-orig → openspec-orig.cmd → openspec-orig.ps1
 * - Windows: openspec-orig.cmd → openspec-orig.ps1 → openspec-orig
 * @param binDir
 * @param isWin
 * @returns string|null 找到的文件名，null 表示不存在
 */
declare function findOpenspecOrigFile(binDir: string, isWin: boolean): string | null;
/**
 * 解析目标 openspec 文件名（还原目标）。
 * 由 openspec-orig 文件名推导：去掉 -orig 后缀。
 * @param origFile — openspec-orig 文件名
 * @returns string 还原后的目标文件名
 */
declare function getRestoreTarget(origFile: string): string;
/**
 * 获取平台对应的垫片文件列表。
 * @param isWin
 * @returns string[]
 */
declare function getShimFiles(isWin: boolean): string[];
/** installShims / uninstallShims 的统一返回结构。 */
interface ShimOperationResult {
    success: boolean;
    binDir: string | null;
    details: string[];
}
/**
 * 主入口：安装垫片脚本。
 * @param toolDir — 工具安装根目录
 * @param isWin
 * @returns ShimOperationResult
 */
declare function installShims(toolDir: string, isWin: boolean): ShimOperationResult;
/**
 * 卸除垫片脚本。
 * @param toolDir — 工具安装根目录（当前仅用于日志）
 * @param isWin
 * @returns ShimOperationResult
 */
declare function uninstallShims(toolDir: string, isWin: boolean): ShimOperationResult;
export { installShims, uninstallShims, findOpenspecBinDir, openspecOrigExists, copyOpenspecToOrig, installShimScripts, setExecutable, findOpenspecOrigFile, getRestoreTarget, getShimFiles, binDirFromToolDir, findRealOpenspec, };
export type { ShimOperationResult };
//# sourceMappingURL=shims-installer.d.ts.map