interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    n?: number;
    total?: number;
    detail?: string;
}
export type ProgressCallback = (event: ProgressEvent) => void;
import { type ProcessRunner } from './process-runner.js';
export declare function parseTemplateOutput(stdout: string): {
    ok: boolean;
    count: number;
};
export declare function changeListed(stdout: string, changeName: string): boolean;
export declare function parseStatusOutput(stdout: string, minimum?: number): {
    ok: boolean;
    count: number;
};
export interface VerifyProjectOptions {
    runner: ProcessRunner;
    targetDir: string;
    uniquePart?: () => string;
    progress?: ProgressCallback | undefined;
    cleanup?: ((name: string) => void | Promise<void>) | undefined;
}
export interface VerifyProjectResult {
    passed: boolean;
    changeName: string;
    error?: unknown;
}
declare function verifyProject(options: VerifyProjectOptions): Promise<VerifyProjectResult>;
export { verifyProject };
export declare function resolveToolRoot(): string;
/**
 * 校验落盘文件不含路径占位符。以目标文件为准，不看模板源——
 * 模板源含占位符是正常的，落盘后仍含才是缺陷。
 */
declare function verifyNoPlaceholders(targetDir: string, targets: readonly string[]): void;
export { verifyNoPlaceholders };
//# sourceMappingURL=verify.d.ts.map