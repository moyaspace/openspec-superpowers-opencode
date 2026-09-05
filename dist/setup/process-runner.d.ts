import childProcess from 'node:child_process';
interface ProcessRunnerOptions {
    spawnSync?: typeof childProcess.spawnSync;
    platform?: string;
    comSpec?: string;
}
export interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeout?: number;
}
export interface RunResult {
    code: number;
    signal: string | null;
    stdout: string;
    stderr: string;
}
export interface ProcessRunner {
    run(program: string, args?: string[], runOptions?: RunOptions): RunResult;
}
declare function createProcessRunner(options?: ProcessRunnerOptions): ProcessRunner;
export { createProcessRunner, };
//# sourceMappingURL=process-runner.d.ts.map