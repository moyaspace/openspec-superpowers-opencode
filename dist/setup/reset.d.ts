import { type Manifest } from './manifest.js';
export interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    n?: number;
    total?: number;
    detail?: string;
}
export type ProgressCallback = (event: ProgressEvent) => void;
export declare function protectedManifestPath(relativePath: string): boolean;
export type ResetOperation = {
    type: 'preserve';
    path: string;
} | {
    type: 'delete';
    path: string;
    target: string;
};
export declare function createResetPlan(projectRoot: string, manifest: Manifest): ResetOperation[];
export interface ResetProjectOptions {
    targetDir?: string | undefined;
    progress?: ProgressCallback | undefined;
    lang?: string | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    confirm?: string | undefined;
}
export interface ResetResult {
    success: boolean;
    cancelled: boolean;
    operations: ResetOperation[];
}
declare function resetProject(options?: ResetProjectOptions): Promise<ResetResult>;
export { resetProject };
//# sourceMappingURL=reset.d.ts.map