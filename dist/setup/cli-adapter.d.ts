export type SetupCommandResultValue = {
    success?: boolean | undefined;
};
export interface SetupApi {
    [method: string]: ((options: unknown) => SetupCommandResultValue | Promise<SetupCommandResultValue>) | undefined;
}
export interface SetupCommandResult {
    code: number;
    value?: unknown;
    error?: unknown;
}
declare function runSetupCommand(command: string, options: unknown, api: SetupApi): Promise<SetupCommandResult>;
export { runSetupCommand };
//# sourceMappingURL=cli-adapter.d.ts.map