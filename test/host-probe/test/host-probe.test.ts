/**
 * Task 4（IMP-50/51/53）：真实 OpenCode 宿主探针（可重复运行）。
 * 不用测试替身：真实 opencode run、真实 npm tarball 安装、真实模型调用。
 *
 * 实测发现的加载路径（见 capability-matrix.md）：
 *   - plugin: ["oso-probe"]（bare name）由 OpenCode 启动时 bun install 自 registry——未发布包静默失败
 *   - .opencode/plugins/ 本地桥 re-export "oso-probe"——Bun 从项目 node_modules 解析 tarball 产物（开发期路径）
 *   - 包发布 npm 后 bare name 为生产路径（同载入机制）
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const probeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runNpm(args: readonly string[], cwd: string): { stdout: string; status: number } {
  if (process.platform === "win32") {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], { cwd, encoding: "utf8", timeout: 300_000 });
    return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
  }
  const r = spawnSync("npm", args, { cwd, encoding: "utf8", timeout: 300_000 });
  return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
}

interface ProbeEvent {
  ts: string;
  type: string;
  name?: string;
  message?: string | null;
  session_id?: string;
  [k: string]: unknown;
}

function readEvents(logPath: string): ProbeEvent[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ProbeEvent);
}

const MODEL = process.env.OSO_PROBE_MODEL ?? "routez-ai/glm-5.3-flash";

// TEMP 环境变量可能是 8.3 短名（RLOESS~1）；opencode 报告长名——从 USERPROFILE（长名）构造 Temp 根
const tmpRoot = join(process.env.USERPROFILE ?? tmpdir(), "AppData", "Local", "Temp");

test("真实 OpenCode：加载 ESM 插件、typed 工具调用、session.idle", { timeout: 900_000 }, () => {
  const packDir = mkdtempSync(join(tmpRoot, "oso-hostprobe-pack-"));
  const projectDir = mkdtempSync(join(tmpRoot, "oso-hostprobe-project-"));
  const eventLog = join(projectDir, "probe-events.jsonl");
  try {
    const pack = runNpm(["pack", "--pack-destination", packDir], probeRoot);
    assert.equal(pack.status, 0, `npm pack 失败: ${pack.stdout}`);
    const tgzs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    assert.equal(tgzs.length, 1);
    const tgzPath = join(packDir, tgzs[0]!);

    const install = runNpm(["install", tgzPath, "--no-audit", "--no-fund"], projectDir);
    assert.equal(install.status, 0, `npm install 失败: ${install.stdout}`);
    assert.equal(
      existsSync(join(projectDir, "node_modules", "oso-probe", "dist", "opencode-plugin", "index.js")),
      true,
      "tarball 安装后缺少插件入口",
    );

    writeFileSync(
      join(projectDir, "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json" }, null, 2),
    );
    mkdirSync(join(projectDir, ".opencode", "plugins"), { recursive: true });
    writeFileSync(
      join(projectDir, ".opencode", "plugins", "oso-probe-bridge.js"),
      'import { osoProbeTypedPlugin } from "oso-probe/plugin/typed"; export { default } from "oso-probe/plugin/typed"; export const osoProbePlugin = osoProbeTypedPlugin;',
    );

    // Windows 下 opencode 是 .ps1/.cmd shim，shell:false 直接 spawn 找不到——经 cmd /c 解析 PATH
    const ocCmd = process.platform === "win32" ? ["cmd.exe", "/d", "/s", "/c", "opencode"] : ["opencode"];
    const run = spawnSync(
      ocCmd[0]!,
      [
        ...ocCmd.slice(1),
        "run",
        "--model",
        MODEL,
        "Call the probe_typed_echo tool with message exactly 'phase-0a-host-check', then reply with only the tool result.",
      ],
      {
        cwd: projectDir,
        encoding: "utf8",
        timeout: 600_000,
        env: { ...process.env, OSO_PROBE_EVENT_LOG: eventLog },
      },
    );
    const runOutput = (run.stdout ?? "") + (run.stderr ?? "");
    const events = readEvents(eventLog);

    const called = events.filter((e) => e.type === "plugin-called");
    assert.ok(called.length >= 1, `插件未被加载；opencode 输出: ${runOutput.slice(0, 1500)}`);
    assert.ok(called.length <= 1, `插件函数被调用 ${called.length} 次（应只一次）`);
    assert.equal(called[0]!.has_project, true, "上下文缺 project");
    assert.equal(called[0]!.has_client, true, "上下文缺 client");
    assert.equal(called[0]!.directory, realpathSync(projectDir), "上下文 directory 与项目目录不符");

    const toolCalls = events.filter((e) => e.type === "tool-call");
    assert.ok(toolCalls.length >= 1, `自定义工具未被真实调用；opencode 输出: ${runOutput.slice(0, 1500)}`);
    assert.equal(toolCalls[0]!.message, "phase-0a-host-check", "typed 工具参数未按声明传递");
    assert.equal(typeof toolCalls[0]!.tool_directory, "string", "工具上下文缺 directory");
    assert.equal(typeof toolCalls[0]!.tool_worktree, "string", "工具上下文缺 worktree");

    const hostEvents = events.filter((e) => e.type === "host-event").map((e) => String(e.name));
    const idleSeen = hostEvents.includes("session.idle");
    assert.ok(idleSeen, "未观察到 session.idle 事件");

    const uniqueHostEvents = [...new Set(hostEvents)].sort();
    const matrixDir = resolve(
      probeRoot,
      "..",
      "openspec",
      "changes",
      "oso-typescript-esm-foundation-and-host-feasibility",
    );
    mkdirSync(matrixDir, { recursive: true });
    writeFileSync(
      join(matrixDir, "host-probe-run.json"),
      JSON.stringify(
        {
          opencode_version: "1.18.29",
          node_version: process.version,
          model: MODEL,
          platform: process.platform,
          plugin_called_count: called.length,
          tool_call_count: toolCalls.length,
          first_tool_call: toolCalls[0] ?? null,
          unique_host_event_names: uniqueHostEvents,
          session_idle_observed: idleSeen,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
});
