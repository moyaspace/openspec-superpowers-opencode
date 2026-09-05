/**
 * CLI 薄入口（0A 探针用）。
 * 规范约束：执行 CLI 不得注册 OpenCode Hook；加载插件不得执行 CLI 参数解析或退出逻辑。
 * 通过进程退出码与 stdout 验证 ESM CLI 在 Node 下可执行。
 */
import { pathToFileURL } from "node:url";
import { OSO_CORE_PROBE_VERSION, markLoad } from "../oso-core/index.js";
const CLI_LOAD_MARK = "cli-entry-executed";
// CLI 侧副作用标记：插件入口若被同一进程加载，可检测到该标记
const globalMarkers = globalThis;
globalMarkers.__OSO_PROBE_CLI_MARK__ = CLI_LOAD_MARK;
markLoad("cli");
export function cliMain(argv) {
    if (argv.includes("--version") || argv.includes("-v")) {
        process.stdout.write(`oso-probe ${OSO_CORE_PROBE_VERSION}\n`);
        return 0;
    }
    if (argv.includes("--check-plugin-not-loaded")) {
        // 隔离断言：CLI 进程内不得存在插件入口标记
        if (globalMarkers.__OSO_PROBE_PLUGIN_MARK__ !== undefined) {
            process.stdout.write("ISOLATION-FAIL: plugin entry executed in CLI process\n");
            return 1;
        }
        process.stdout.write("ISOLATION-OK: plugin entry not executed in CLI process\n");
        return 0;
    }
    process.stdout.write("oso-probe: minimal ESM CLI entry\n");
    return 0;
}
// 直接执行时才调用 process.exit；被 import 时不退出（双入口隔离的关键边界）
const isDirectExecution = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
    process.exit(cliMain(process.argv.slice(2)));
}
//# sourceMappingURL=index.js.map