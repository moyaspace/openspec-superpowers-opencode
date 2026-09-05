/**
 * Task 3（IMP-52）核心测试：真实 npm tarball 的 CLI/插件双入口隔离 + 安装副作用。
 * 约束：不用测试替身——真实 npm pack、真实 npm install、真实 Node 进程加载。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync, rmSync, mkdtempSync as mkTemp } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const probeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 跨平台调用 npm：Node 24 起 spawnSync 直接执行 .cmd 返回 EINVAL（BatBadBut 缓解），
 * Windows 上经 cmd /d /s /c 包装，参数数组仍由 execFileSync 转义，避免 shell 注入。
 */
function runNpm(args: readonly string[], cwd: string, capture: "buffer" | "pipe" = "buffer"): { stdout: string; status: number } {
  if (process.platform === "win32") {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], { cwd, encoding: "utf8" });
    return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
  }
  const r = spawnSync("npm", args, { cwd, encoding: "utf8" });
  return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
}

function run(cmd: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv): { stdout: string; status: number } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: false, env: env ? { ...process.env, ...env } : undefined });
  return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
}

test("tarball 只包含 dist/ 与 package.json（files 白名单生效）", () => {
  const outDir = mkTemp(join(tmpdir(), "oso-probe-pack-"));
  try {
    const pack = runNpm(["pack", "--pack-destination", outDir], probeRoot);
    assert.equal(pack.status, 0, `npm pack 失败: ${pack.stdout}`);
    const tgzs = readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
    assert.equal(tgzs.length, 1, `npm pack 未产出唯一 tarball: ${tgzs.join(", ")}`);
    const tgzName = tgzs[0]!;
    const tgzPath = join(outDir, tgzName);
    // 列出 tarball 内容（tar 随 Windows 10+/Linux 提供）
    const list = run("tar", ["-tzf", tgzName], outDir);
    assert.equal(list.status, 0, `tar -tzf 失败: ${list.stdout}`);
    const entries = list.stdout.split(/\r?\n/).filter(Boolean);
    const unexpected = entries.filter(
      (e) => !e.startsWith("package/dist/") && e !== "package/package.json" && e !== "package/" && e !== "package",
    );
    assert.deepEqual(unexpected, [], `tarball 包含白名单外文件: ${unexpected.join(", ")}`);
    assert.ok(entries.some((e) => e.includes("dist/cli/index.js")), "tarball 缺少 CLI 入口");
    assert.ok(entries.some((e) => e.includes("dist/opencode-plugin/index.js")), "tarball 缺少插件入口");
    assert.ok(entries.some((e) => e.includes("dist/oso-core/index.js")), "tarball 缺少共享 Core");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("安装 tarball 后：插件入口可 import、CLI 可执行且互不越界、无安装副作用", () => {
  const outDir = mkTemp(join(tmpdir(), "oso-probe-pack-"));
  const projectDir = mkdtempSync(join(tmpdir(), "oso-probe-project-"));
  try {
    const pack = runNpm(["pack", "--pack-destination", outDir], probeRoot);
    assert.equal(pack.status, 0, `npm pack 失败: ${pack.stdout}`);
    const tgzs = readdirSync(outDir).filter((f) => f.endsWith(".tgz"));
    assert.equal(tgzs.length, 1, `npm pack 未产出唯一 tarball: ${tgzs.join(", ")}`);
    const tgzPath = join(outDir, tgzs[0]!);

    // 真实 npm install
    const install = runNpm(["install", tgzPath, "--no-audit", "--no-fund"], projectDir);
    assert.equal(install.status, 0, `npm install 失败: ${install.stdout}`);

    // 副作用检查 1：不创建 .opencode/package.json
    assert.equal(existsSync(join(projectDir, ".opencode", "package.json")), false, "安装创建了 .opencode/package.json");
    // 副作用检查 2：不部署源码副本（无 src/、tsconfig）
    assert.equal(existsSync(join(projectDir, "src")), false, "安装部署了 src/");
    assert.equal(existsSync(join(projectDir, "tsconfig.json")), false, "安装部署了 tsconfig.json");
    // 副作用检查 3：安装的包内只有 dist（无 test/tsconfig）
    const pkgDir = join(projectDir, "node_modules", "oso-probe");
    assert.equal(existsSync(join(pkgDir, "tsconfig.json")), false, "包内含 tsconfig.json");
    assert.equal(existsSync(join(pkgDir, "test")), false, "包内含 test/");

    // 双入口 1：插件入口 import（真实 Node ESM 加载）
    const pluginLoad = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import p from ${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "opencode-plugin", "index.js")).href)};
         const hooks = await p({ directory: process.cwd(), worktree: null });
         if (!hooks.tool?.probe_echo) throw new Error("probe_echo 未注册");
         const out = await hooks.tool.probe_echo.execute({ message: "x" }, { directory: process.cwd() });
         if (out !== "echo:x") throw new Error("工具调用结果异常: " + out);
         console.log("PLUGIN-ENTRY-OK");`,
      ],
      { cwd: projectDir, encoding: "utf8" },
    );
    assert.equal(pluginLoad.status, 0, `插件入口加载失败: ${pluginLoad.stderr}`);
    assert.ok(pluginLoad.stdout.includes("PLUGIN-ENTRY-OK"));

    // 双入口 2：CLI 入口执行
    const cliVersion = spawnSync(process.execPath, [join(pkgDir, "dist", "cli", "index.js"), "--version"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    assert.equal(cliVersion.status, 0, `CLI --version 失败: ${cliVersion.stderr}`);
    assert.match(cliVersion.stdout, /^oso-probe /);

    // 双入口隔离：CLI 进程内插件入口未执行
    const cliIsolation = spawnSync(
      process.execPath,
      [join(pkgDir, "dist", "cli", "index.js"), "--check-plugin-not-loaded"],
      { cwd: projectDir, encoding: "utf8" },
    );
    assert.equal(cliIsolation.status, 0, "CLI 隔离断言失败");
    assert.ok(cliIsolation.stdout.includes("ISOLATION-OK"), `期望 ISOLATION-OK，得到: ${cliIsolation.stdout}`);

    // 反向隔离：import 插件入口的进程内 CLI 退出逻辑未执行（插件进程不该打印 CLI 输出）
    const pluginOnly = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "opencode-plugin", "index.js")).href)});
         const m = globalThis;
         if (m.__OSO_PROBE_CLI_MARK__ !== undefined) throw new Error("CLI 入口在插件进程中执行了");
         console.log("PLUGIN-ONLY-OK");`,
      ],
      { cwd: projectDir, encoding: "utf8" },
    );
    assert.equal(pluginOnly.status, 0, `反向隔离失败: ${pluginOnly.stderr}`);
    assert.ok(pluginOnly.stdout.includes("PLUGIN-ONLY-OK"));

    // typed 变体：真实运行时加载 @opencode-ai/plugin（effect 依赖链）
    const typedLoad = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import p from ${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "opencode-plugin", "typed.js")).href)};
         const hooks = await p({ directory: process.cwd(), worktree: null });
         if (!hooks.tool?.probe_typed_echo) throw new Error("probe_typed_echo 未注册");
         const out = await hooks.tool.probe_typed_echo.execute({ message: "y" }, { directory: process.cwd(), worktree: null });
         if (out !== "typed-echo:y") throw new Error("typed 工具调用结果异常: " + out);
         console.log("TYPED-ENTRY-OK");`,
      ],
      { cwd: projectDir, encoding: "utf8" },
    );
    assert.equal(typedLoad.status, 0, `typed 插件入口加载失败: ${typedLoad.stderr}`);
    assert.ok(typedLoad.stdout.includes("TYPED-ENTRY-OK"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
});




