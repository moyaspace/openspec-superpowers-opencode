/**
 * typed 插件变体：真实 import @opencode-ai/plugin 运行时（tool.schema），
 * 验证"依赖宿主插件包"的正式插件形态也能被 OpenCode 加载（0B 后正式插件即此形态）。
 * 通过环境变量 OSO_PROBE_USE_TYPED=1 时由测试项目 opencode.json 指定使用。
 */
import { type Plugin } from "@opencode-ai/plugin";
export declare const osoProbeTypedPlugin: Plugin;
export default osoProbeTypedPlugin;
//# sourceMappingURL=typed.d.ts.map