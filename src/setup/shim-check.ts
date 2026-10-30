import path from 'node:path';

import { findOpenspec, findOpenspecOrig, findShimFile } from '../verify.js';
import { installShims, type ShimOperationResult } from '../shims-installer.js';

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
export function checkShim(deps: ShimDeps = {}): ShimStatus {
    const isWin = deps.isWin ?? process.platform === 'win32';
    const locateOpenspec = deps.findOpenspec ?? findOpenspec;
    const locateShim = deps.findShimFile ?? findShimFile;
    const locateOrig = deps.findOpenspecOrig ?? findOpenspecOrig;

    const openspecPath = locateOpenspec(isWin);
    if (!openspecPath) {
        return { active: false, openspecPath: null, binDir: null, reason: 'openspec CLI not found in PATH' };
    }
    const binDir = path.dirname(openspecPath);
    const shimPath = locateShim(openspecPath, binDir, isWin);
    if (!shimPath) {
        return { active: false, openspecPath, binDir, reason: 'openspec is not a shim' };
    }
    const origPath = locateOrig(binDir, isWin);
    if (!origPath) {
        return { active: false, openspecPath, binDir, reason: 'openspec-orig is missing' };
    }
    return { active: true, openspecPath, binDir, reason: 'ok' };
}

/** 未生效时尝试自动安装垫片；已生效则不触碰全局 bin。 */
export function ensureShim(
    toolDir: string,
    deps: ShimDeps = {},
): { ok: boolean; repaired: boolean; details: string[] } {
    const status = checkShim(deps);
    if (status.active) return { ok: true, repaired: false, details: [status.reason] };

    const isWin = deps.isWin ?? process.platform === 'win32';
    const install = deps.install ?? installShims;
    const result = install(toolDir, isWin);
    return {
        ok: result.success,
        repaired: result.success,
        details: [status.reason, ...result.details],
    };
}