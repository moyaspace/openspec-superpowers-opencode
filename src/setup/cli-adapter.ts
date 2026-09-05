export type SetupCommandResultValue = { success?: boolean | undefined };

export interface SetupApi {
    [method: string]:
        | ((options: unknown) => SetupCommandResultValue | Promise<SetupCommandResultValue>)
        | undefined;
}

export interface SetupCommandResult {
    code: number;
    value?: unknown;
    error?: unknown;
}

async function runSetupCommand(
    command: string,
    options: unknown,
    api: SetupApi,
): Promise<SetupCommandResult> {
    const method = ({
        init: 'initProject',
        reset: 'resetProject',
        'dry-run': 'dryRunProject',
    } as Record<string, string>)[command];
    if (!method || typeof api[method] !== 'function') {
        return { code: 1, error: new Error(`Unsupported setup command: ${command}`) };
    }
    try {
        const value = await api[method]!(options);
        return { code: value && value.success === false ? 1 : 0, value };
    } catch (error) {
        return { code: 1, error };
    }
}

export { runSetupCommand };
