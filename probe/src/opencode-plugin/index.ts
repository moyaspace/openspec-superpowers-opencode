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

const globalMarkers = globalThis as typeof globalThis & {
  __OSO_PROBE_CLI_MARK__?: string;
  __OSO_PROBE_PLUGIN_MARK__?: string;
  __OSO_PROBE_PLUGIN_LOAD_COUNT__?: number;
};

// 插件侧标记：CLI 入口若被同一进程加载，可检测到该标记
globalMarkers.__OSO_PROBE_PLUGIN_MARK__ = "plugin-entry-executed";
const loadCount = (globalMarkers.__OSO_PROBE_PLUGIN_LOAD_COUNT__ ?? 0) + 1;
globalMarkers.__OSO_PROBE_PLUGIN_LOAD_COUNT__ = loadCount;
markLoad("plugin");

/** 探针事件日志路径：由环境变量指定；未指定时跳过写文件（不产生意外副作用） */
function recordEvent(entry: Record<string, unknown>): void {
  const logPath = process.env.OSO_PROBE_EVENT_LOG;
  if (!logPath) return;
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    mkdirSync(join(logPath, ".."), { recursive: true });
    writeFileSync(logPath, line, { flag: "a" });
  } catch {
    // 日志失败不影响探针插件本身的行为
  }
}

recordEvent({
  type: "plugin-init",
  core_version: OSO_CORE_PROBE_VERSION,
  load_count: loadCount,
});

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

export const osoProbePlugin = async (ctx: OsoProbePluginContext) => {
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
        async execute(args: { message?: string }, toolCtx: { directory?: string }) {
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
    "chat.message": async (
      input: {
        sessionID: string;
        agent?: string;
        model?: { providerID: string; modelID: string };
        messageID?: string;
        variant?: string;
      },
      output: { message: unknown; parts: unknown[] },
    ) => {
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
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string; args: unknown },
      output: { title: string; output: string; metadata: unknown },
    ) => {
      recordEvent({
        type: "tool-execute-after-hook",
        tool: input.tool,
        session_id: input.sessionID,
        call_id: input.callID,
      });
    },
    event: async ({ event }: { event: { type: string; properties?: unknown } }) => {
      recordEvent({ type: "host-event", name: event.type });
      // session.idle / message.updated 等事件到达即记录，供能力矩阵统计真实事件名
    },
  };
};

export default osoProbePlugin;
