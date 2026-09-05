/**
 * 与 @opencode-ai/plugin 的 Plugin 签名一致的最小插件。
 * 0A 阶段直接手写同形签名，不 import 该包的类型（探针包不依赖宿主包即可被宿主加载——
 * 这是"npm tarball 由 OpenCode 按自身机制加载"的更严格证明；0B 起正式插件改为 import 类型）。
 */
export type OsoProbePluginContext = {
    project?: unknown;
    client?: unknown;
    $?: unknown;
    directory?: string;
    worktree?: string;
};
export declare const osoProbePlugin: (ctx: OsoProbePluginContext) => Promise<{
    tool: {
        probe_echo: {
            description: string;
            args: {
                message: string;
            };
            execute(args: {
                message?: string;
            }, toolCtx: {
                directory?: string;
            }): Promise<string>;
        };
    };
    event: ({ event }: {
        event: {
            type: string;
            properties?: unknown;
        };
    }) => Promise<void>;
}>;
export default osoProbePlugin;
//# sourceMappingURL=index.d.ts.map