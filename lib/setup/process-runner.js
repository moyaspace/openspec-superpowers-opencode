const childProcess = require('node:child_process');

function escapeCmdToken(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function buildCmdCommand(program, args) {
    const hasWhitespace = /\s/.test(program);
    const command = hasWhitespace ? escapeCmdToken(program) : String(program);
    const commandLine = [command, ...args.map(escapeCmdToken)].join(' ');
    return hasWhitespace ? `"${commandLine}"` : commandLine;
}

function createProcessRunner(options = {}) {
    const spawnSync = options.spawnSync || childProcess.spawnSync;
    const platform = options.platform || process.platform;
    const comSpec = options.comSpec || process.env.ComSpec || 'cmd.exe';

    return {
        run(program, args = [], runOptions = {}) {
            if (!Array.isArray(args)) throw new TypeError('Process arguments must be an array');
            const windowsShim = /\.(?:cmd|bat)$/i.test(program)
                || ['npm', 'npx', 'opencode', 'openspec'].includes(program.toLowerCase());
            const useComSpec = platform === 'win32' && windowsShim;
            const executable = useComSpec ? comSpec : program;
            const executableArgs = useComSpec
                ? ['/d', '/s', '/c', buildCmdCommand(program, args)]
                : args;
            const result = spawnSync(executable, executableArgs, {
                cwd: runOptions.cwd,
                encoding: 'utf8',
                env: runOptions.env,
                input: runOptions.input,
                shell: false,
                timeout: runOptions.timeout || 30000,
                windowsVerbatimArguments: useComSpec,
                windowsHide: true,
            });
            if (result.error) throw result.error;
            return {
                code: result.status === null ? 1 : result.status,
                signal: result.signal,
                stdout: result.stdout || '',
                stderr: result.stderr || '',
            };
        },
    };
}

module.exports = {
    createProcessRunner,
};
