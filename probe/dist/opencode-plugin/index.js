/**
 * OpenCode 插件薄入口（0A 探针用）。
 * 规范约束：加载插件入口不得执行 CLI 初始化、参数解析、文件修改或进程退出。
 * 真实 OpenCode 加载本模块后：
 *  - 记录插件被加载一次（重复加载检测）
 *  - 注册最小自定义工具 probe_echo（验证工具注册与调用链路）
 *  - 订阅 event 钩子记录真实事件名称/参数/时序（能力矩阵证据来源）
 *  - 记录上下文字段（project/client/$/directory/worktree）是否存在
 */
import { OSO_CORE_PROBE_VERSION, markLoad } from "../oso-core/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const globalMarkers = globalThis;
// 插件侧标记：CLI 入口若被同一进程加载，可检测到该标记
globalMarkers.__OSO_PROBE_PLUGIN_MARK__ = "plugin-entry-executed";
const loadCount = (globalMarkers.__OSO_PROBE_PLUGIN_LOAD_COUNT__ ?? 0) + 1;
globalMarkers.__OSO_PROBE_PLUGIN_LOAD_COUNT__ = loadCount;
markLoad("plugin");
/** 探针事件日志路径：由环境变量指定；未指定时跳过写文件（不产生意外副作用） */
function recordEvent(entry) {
    const logPath = process.env.OSO_PROBE_EVENT_LOG;
    if (!logPath)
        return;
    try {
        const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
        mkdirSync(join(logPath, ".."), { recursive: true });
        writeFileSync(logPath, line, { flag: "a" });
    }
    catch {
        // 日志失败不影响探针插件本身的行为
    }
}
recordEvent({
    type: "plugin-init",
    core_version: OSO_CORE_PROBE_VERSION,
    load_count: loadCount,
});
export const osoProbePlugin = async (ctx) => {
    recordEvent({
        type: "plugin-called",
        has_project: ctx.project !== undefined,
        has_client: ctx.client !== undefined,
        has_dollar: ctx.$ !== undefined,
        directory: ctx.directory ?? null,
        worktree: ctx.worktree ?? null,
    });
    return {
        tool: {
            probe_echo: {
                description: "0A probe tool: echoes input to verify custom tool registration and invocation",
                args: {
                    message: "string",
                },
                async execute(args, toolCtx) {
                    recordEvent({
                        type: "tool-call",
                        tool: "probe_echo",
                        message: args.message ?? null,
                        tool_directory: toolCtx?.directory ?? null,
                    });
                    return `echo:${args.message ?? ""}`;
                },
            },
        },
        "chat.message": async (input, output) => {
            // 时序与 await 验证：宿主若等待本 Promise，sleep 500ms 会推迟后续事件
            await new Promise((resolve) => setTimeout(resolve, 500));
            recordEvent({
                type: "chat-message-hook",
                session_id: input.sessionID,
                agent: input.agent ?? null,
                model: input.model ?? null,
                message_id: input.messageID ?? null,
                variant: input.variant ?? null,
                message_id_present: input.messageID !== undefined && input.messageID !== "",
                part_count: output.parts.length,
            });
        },
        "tool.execute.after": async (input, output) => {
            recordEvent({
                type: "tool-execute-after-hook",
                tool: input.tool,
                session_id: input.sessionID,
                call_id: input.callID,
            });
        },
        event: async ({ event }) => {
            recordEvent({ type: "host-event", name: event.type });
            // session.idle / message.updated 等事件到达即记录，供能力矩阵统计真实事件名
        },
    };
};
export default osoProbePlugin;
//# sourceMappingURL=index.js.map