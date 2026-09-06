/**
 * typed 插件变体：真实 import @opencode-ai/plugin 运行时（tool.schema），
 * 验证"依赖宿主插件包"的正式插件形态也能被 OpenCode 加载（0B 后正式插件即此形态）。
 * 通过环境变量 OSO_PROBE_USE_TYPED=1 时由测试项目 opencode.json 指定使用。
 */
import { tool, type Plugin } from "@opencode-ai/plugin";
import { markLoad } from "../oso-core/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

markLoad("plugin-typed");

function recordEvent(entry: Record<string, unknown>): void {
  const logPath = process.env.OSO_PROBE_EVENT_LOG;
  if (!logPath) return;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), variant: "typed", ...entry }) + "\n", {
      flag: "a",
    });
  } catch {
    // 日志失败不影响探针插件本身的行为
  }
}

export const osoProbeTypedPlugin: Plugin = async (ctx) => {
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
      probe_typed_echo: tool({
        description: "0A probe tool (typed variant using @opencode-ai/plugin tool.schema)",
        args: {
          message: tool.schema.string(),
        },
        async execute(args, toolCtx) {
          recordEvent({
            type: "tool-call",
            tool: "probe_typed_echo",
            message: args.message ?? null,
            tool_directory: toolCtx.directory ?? null,
            tool_worktree: toolCtx.worktree ?? null,
          });
          return `typed-echo:${args.message}`;
        },
      }),
    },
    event: async ({ event }) => {
      recordEvent({ type: "host-event", name: event.type });
    },
  };
};

export default osoProbeTypedPlugin;
