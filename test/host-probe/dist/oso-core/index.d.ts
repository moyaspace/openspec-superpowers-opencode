/**
 * 最小共享 Core（0A 探针用）。
 * 目的：证明同一 Core 模块可被 CLI 入口与 OpenCode 插件入口同时复用，
 * 且两侧加载互不产生副作用。
 */
/** Core 版本标识：CLI 与插件各自加载后比对，证明复用同一模块实例语义 */
export declare const OSO_CORE_PROBE_VERSION = "0.0.0-probe";
export declare function markLoad(entrant: "cli" | "plugin" | "plugin-typed" | "test"): number;
export declare function getLoadMarks(): readonly string[];
/** 确定性纯函数：验证 ESM 导入/导出与运行时 .js 扩展名解析正常 */
export declare function add(a: number, b: number): number;
//# sourceMappingURL=index.d.ts.map