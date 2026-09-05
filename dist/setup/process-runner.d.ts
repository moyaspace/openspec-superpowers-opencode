import childProcess from 'node:child_process';
interface ProcessRunnerOptions {
    spawnSync?: typeof childProcess.spawnSync;
    platform?: string;
    comSpec?: string;
}
interface RunOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    timeout?: number;
}
interface RunResult {
    code: number;
    signal: string | null;
    stdout: string;
    stderr: string;
}
interface ProcessRunner {
    run(program: string, args?: string[], runOptions?: RunOptions): RunResult;
}
declare function createProcessRunner(options?: ProcessRunnerOptions): ProcessRunner;
export { createProcessRunner, };
//# sourceMappingURL=process-runner.d.ts.map