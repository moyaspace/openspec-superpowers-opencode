/**
 * verify.ts — 5 项系统完整性检查 + 逐项修复建议。
 *
 * 检查项：
 * 1. openspec CLI 是否在 PATH 中
 * 2. openspec-orig 是否存在（原版 CLI 备份）
 * 3. openspec 是否为包装脚本
 * 4. openspec/oso-change-registry.json 是否有效 JSON
 * 5. 注册表中所有 worktree 目录是否存在
 * 6. Superpowers 主版本 ≥ 6 时追加 bash 可用性检查（缺失为 warn，不判失败）
 *
 * 输出格式：
 *   ✓ openspec: installed at /usr/local/bin/openspec
 *   ⚠ openspec-orig: not found
 *     修复：openspec-superpowers-opencode install-shims
 *
 * exit code: 全 ✓/∼/⚠(warn) → 0, 有 fail → 1
 */
/** 单项检查结果。 */
interface CheckResult {
    check: string;
    status: 'pass' | 'fail' | 'skip' | 'warn';
    message: string;
    fix: string | null;
}
/** bash 探测结果。 */
interface BashDetection {
    available: boolean;
    path: string | null;
}
/**
 * 查找 openspec CLI 路径。
 * @param isWin
 * @returns string|null
 */
declare function findOpenspec(isWin: boolean): string | null;
/**
 * 探测 bash 可用性。
 * Windows 先查 PATH（where bash），再查 Git for Windows 的默认安装路径；
 * 类 Unix 用 which bash。
 * @param isWin
 */
declare function detectBash(isWin: boolean): BashDetection;
/**
 * 检查 openspec-orig 是否存在。
 * @param binDir
 * @param isWin
 * @returns string|null 存在返回路径，否则 null
 */
declare function findOpenspecOrig(binDir: string, isWin: boolean): string | null;
/**
 * 检查 openspec 文件是否已被垫片替换。
 * @param openspecPath
 */
declare function isShimScript(openspecPath: string): boolean;
/**
 * 定位实际承载垫片内容的文件路径：Unix 为 `openspec` 本体，Windows 为同目录的
 * `openspec.cmd` / `openspec.ps1` 旁路文件。
 * @param openspecPath
 * @param binDir
 * @param isWin
 * @returns string|null
 */
declare function findShimFile(openspecPath: string, binDir: string, isWin: boolean): string | null;
/**
 * 检查 oso-change-registry.json 是否有效，返回条目数。
 * @param projectRoot
 * @returns {valid, count, error}
 */
declare function checkRegistryFile(projectRoot: string): {
    valid: boolean;
    count: number;
    error: string | null;
};
/**
 * 检查所有 worktree 目录是否存在。
 * @param projectRoot
 * @returns {valid, missing}
 */
declare function checkWorktrees(projectRoot: string): {
    valid: boolean;
    missing: Array<{
        name: string;
        worktree: string;
    }>;
};
interface RunAllChecksOptions {
    detectBash?: ((isWin: boolean) => BashDetection) | undefined;
    superpowersVersion?: string | null | undefined;
    packagesDir?: string | undefined;
}
/**
 * 运行所有检查（5 项固定 + Superpowers major ≥ 6 时的 bash 项），返回结构化结果。
 *
 * @param toolDir — 工具安装目录
 * @param isWin
 * @param projectRoot — 项目根目录（可选，非项目环境下跳过 4+5）
 * @param options — 测试可注入的 bash 检测与 Superpowers 版本来源
 * @returns CheckResult[]
 */
declare function runAllChecks(toolDir: string, isWin: boolean, projectRoot: string | null, options?: RunAllChecksOptions): CheckResult[];
/**
 * 格式化检查结果为可读文本。
 * @param results
 * @returns string
 */
declare function formatResults(results: CheckResult[]): string;
/**
 * 检查是否全部通过。warn 与 pass / skip 一样视为通过（仅提示）。
 * @param results
 */
declare function allPass(results: Array<Pick<CheckResult, 'status'>>): boolean;
export { runAllChecks, formatResults, allPass, detectBash, findOpenspec, findOpenspecOrig, findShimFile, isShimScript, checkRegistryFile, checkWorktrees };
//# sourceMappingURL=verify.d.ts.map