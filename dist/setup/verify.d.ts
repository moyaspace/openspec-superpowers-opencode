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
//# sourceMappingURL=verify.d.ts.map