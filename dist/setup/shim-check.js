import path from 'node:path';
import { findOpenspec, findOpenspecOrig, findShimFile } from '../verify.js';
import { installShims } from '../shims-installer.js';
/** 判定 openspec 垫片是否已生效：`openspec` 是垫片 **且** `openspec-orig` 存在。 */
export function checkShim(deps = {}) {
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
export function ensureShim(toolDir, deps = {}) {
    const status = checkShim(deps);
    if (status.active)
        return { ok: true, repaired: false, details: [status.reason] };
    const isWin = deps.isWin ?? process.platform === 'win32';
    const install = deps.install ?? installShims;
    const result = install(toolDir, isWin);
    // 安装器的 success 不代表垫片真的写入了（例如 assets/shims 缺失），必须复检。
    const after = checkShim(deps);
    return {
        ok: after.active,
        repaired: after.active,
        details: [status.reason, ...result.details, after.reason],
    };
}
//# sourceMappingURL=shim-check.js.map