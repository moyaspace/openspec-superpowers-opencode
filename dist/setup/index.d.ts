import { type Manifest } from './manifest.js';
import { type InitDecisions, type InitPlan } from './planner.js';
import { type ProcessRunner } from './process-runner.js';
import { resetProject } from './reset.js';
interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    detail?: string;
    target?: string;
    n?: number;
    total?: number;
}
type ProgressCallback = (event: ProgressEvent) => void;
interface LockVerification {
    allMatch: boolean;
    warnings: string[];
}
interface SetupOptions {
    mode?: string | undefined;
    lang?: string | undefined;
    targetDir?: string | undefined;
    templateDir?: string | undefined;
    runner?: ProcessRunner | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    progress?: ProgressCallback | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    superpowersPath?: string | undefined;
    superpowersVersion?: string | undefined;
    decisions?: InitDecisions | undefined;
}
export interface ProjectResult {
    success: boolean;
    cancelled?: boolean;
    plan?: InitPlan;
    manifest?: Manifest;
    verification?: {
        passed: boolean;
        changeName: string;
        error?: unknown;
    };
    lockVerification?: LockVerification;
}
declare function dryRunProject(options?: SetupOptions): Promise<InitPlan | {
    mode: 'dry-run';
    cancelled: boolean;
    operations: never[];
}>;
declare function initProject(options?: SetupOptions): Promise<ProjectResult>;
export { dryRunProject, initProject, resetProject, };
//# sourceMappingURL=index.d.ts.map