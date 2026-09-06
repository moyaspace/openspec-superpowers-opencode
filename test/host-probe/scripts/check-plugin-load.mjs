// 0A 探针：验证 dist ESM 插件入口可被 Node import（Bun/OpenCode 兼容性由真实宿主验证）
import osoProbePlugin from "../dist/opencode-plugin/index.js";

const result = await osoProbePlugin({ directory: process.cwd(), worktree: null });
const toolRegistered = result.tool && typeof result.tool.probe_echo === "object";
console.log(`plugin-load-ok default=${typeof osoProbePlugin} tool=${toolRegistered}`);
const echo = await result.tool.probe_echo.execute({ message: "phase0a" }, { directory: process.cwd() });
console.log(`tool-call-ok result=${echo}`);
process.exit(toolRegistered && echo === "echo:phase0a" ? 0 : 1);
