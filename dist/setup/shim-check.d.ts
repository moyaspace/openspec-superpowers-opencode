import { type ShimOperationResult } from '../shims-installer.js';
export interface ShimDeps {
    findOpenspec?: ((isWin: boolean) => string | null) | undefined;
    findOpenspecOrig?: ((binDir: string, isWin: boolean) => string | null) | undefined;
    findShimFile?: ((openspecPath: string, binDir: string, isWin: boolean) => string | null) | undefined;
    install?: ((toolDir: string, isWin: boolean) => ShimOperationResult) | undefined;
    isWin?: boolean | undefined;
}
export interface ShimStatus {
    active: boolean;
    openspecPath: string | null;
    binDir: string | null;
    reason: string;
}
/** 判定 openspec 垫片是否已生效：`openspec` 是垫片 **且** `openspec-orig` 存在。 */
export declare function checkShim(deps?: ShimDeps): ShimStatus;
/** 未生效时尝试自动安装垫片；已生效则不触碰全局 bin。 */
export declare function ensureShim(toolDir: string, deps?: ShimDeps): {
    ok: boolean;
    repaired: boolean;
    details: string[];
};
//# sourceMappingURL=shim-check.d.ts.map