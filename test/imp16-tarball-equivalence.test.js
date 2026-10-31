/**
 * IMP-16：从真实 npm tarball 重复运行全部入口，对比迁移前行为基线。
 * 基线来源：迁移前 CommonJS 测试冻结的 203/202/1 行为基线 + 迁移映射清单的已批准结构变化。
 * 断言：除已批准的模块与发布结构变化（bin/→dist/cli/、lib/→dist/、lib/shims→assets/shims）外，
 * 输出、退出码、文件结果一致。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runNpm(args, cwd, timeout = 300000, env) {
  const merged = env ? { ...process.env, ...env } : undefined;
  if (process.platform === "win32") {
    const r = spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], { cwd, encoding: "utf8", timeout, env: merged });
    return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
  }
  const r = spawnSync("npm", args, { cwd, encoding: "utf8", timeout, env: merged });
  return { stdout: (r.stdout ?? "") + (r.stderr ?? ""), status: r.status ?? -1 };
}

/**
 * 隔离 bin 目录：放一个 dummy openspec 并前置到 PATH，供 `npm install <tarball>` 使用。
 *
 * 被安装的包带有 `install` 生命周期脚本（shims-installer install），它用
 * `where`/`which openspec` 定位 bin。不隔离就会写进**机器全局** npm bin，
 * 并在并发时把正在被 cmd 执行的 openspec.cmd 原地换掉 → 另一测试拿到 9009。
 */
function makeIsolatedBin() {
  const bin = mkdtempSync(join(tmpdir(), "oso-imp16-bin-"));
  writeFileSync(join(bin, "openspec.cmd"), "@echo off\r\nexit /b 0\r\n");
  writeFileSync(join(bin, "openspec.ps1"), "exit 0\r\n");
  writeFileSync(join(bin, "openspec"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return bin;
}

function runNode(script, args, cwd, timeout = 120000) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout });
  return { stdout: r.stdout ?? "", status: r.status ?? -1 };
}

test("tarball: CLI 版本输出与退出码与基线一致（1.1.1/0）", () => {
  const packDir = mkdtempSync(join(tmpdir(), "oso-imp16-pack-"));
  const projectDir = mkdtempSync(join(tmpdir(), "oso-imp16-project-"));
  const binDir = makeIsolatedBin();
  try {
    const pack = runNpm(["pack", "--pack-destination", packDir], root);
    assert.equal(pack.status, 0, `npm pack 失败: ${pack.stdout}`);
    const tgzs = readdirSync(packDir).filter((f) => f.endsWith(".tgz"));
    assert.equal(tgzs.length, 1);
    const install = runNpm(
      ["install", join(packDir, tgzs[0]), "--no-audit", "--no-fund", "--force"],
      projectDir,
      300000,
      { PATH: binDir + delimiter + (process.env.PATH ?? "") },
    );
    assert.equal(install.status, 0, `npm install 失败: ${install.stdout}`);

    const pkgDir = join(projectDir, "node_modules", "@moyaspace", "openspec-superpowers-opencode");
    assert.equal(existsSync(join(pkgDir, "dist", "cli", "index.js")), true, "tarball 缺少 CLI 入口");
    assert.equal(existsSync(join(pkgDir, "dist", "registry-utils.js")), true, "tarball 缺少 registry-utils");

    // 基线：bin/cli.js --version → "1.1.1"、退出码 0（迁移前行为刻画测试 cli.test.js 冻结）
    const version = runNode(join(pkgDir, "dist", "cli", "index.js"), ["--version"], projectDir);
    assert.equal(version.status, 0, `CLI --version 失败: ${version.stdout}`);
    assert.match(version.stdout, /^1\.1\.1/);

    // 基线：--help 输出 init 用法、退出码 0
    const help = runNode(join(pkgDir, "dist", "cli", "index.js"), ["--help"], projectDir);
    assert.equal(help.status, 0, `CLI --help 失败`);
    assert.ok(help.stdout.includes("init"), `--help 应含 init 用法`);

    // 基线：create-project --help 委托（迁移前 test/create-project.behavior.test.js 冻结）
    const cpHelp = runNode(join(pkgDir, "dist", "cli", "create-project.js"), ["--help"], projectDir);
    assert.equal(cpHelp.status, 0, `create-project --help 失败: ${cpHelp.stdout}`);
    assert.ok(cpHelp.stdout.includes("init"));

    // 基线：registry-utils 顶层导出面（迁移前 test/registry.test.js / registry-utils.test.js 冻结）
    const registryApi = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import * as m from ${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "registry.js")).href)};
         const named = ["read", "write", "add", "remove", "list", "reset"];
         for (const k of named) { if (typeof m[k] !== "function") throw new Error("registry missing: " + k); }
         import * as u from ${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "registry-utils.js")).href)};
         const namedU = ["findProjectRoot", "getChangeRegistryPath", "readRegistry", "mergeList", "mergeListJson", "handleList", "execOpenspecOrig"];
         for (const k of namedU) { if (typeof u[k] !== "function") throw new Error("registry-utils missing: " + k); }
         console.log("API-OK");`,
      ],
      { cwd: projectDir, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(registryApi.status, 0, `registry API 面变化: ${registryApi.stderr}`);

    // 基线：setup 公共 API 面（迁移前 test/setup-api.test.js 冻结）
    const setupApi = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import * as m from ${JSON.stringify(pathToFileURL(join(pkgDir, "dist", "setup", "index.js")).href)};
         for (const k of ["dryRunProject", "initProject", "resetProject"]) {
           if (typeof m[k] !== "function") throw new Error("setup missing: " + k);
         }
         console.log("SETUP-OK");`,
      ],
      { cwd: projectDir, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(setupApi.status, 0, `setup API 面变化: ${setupApi.stderr}`);

    // 基线：shim 资产在 tarball 中且委托 dist 路径
    const shimsDir = join(pkgDir, "assets", "shims");
    assert.equal(existsSync(join(shimsDir, "openspec")), true, "tarball 缺少 sh shim");
    assert.equal(existsSync(join(shimsDir, "openspec.cmd")), true, "tarball 缺少 .cmd shim");
    assert.equal(existsSync(join(shimsDir, "openspec.ps1")), true, "tarball 缺少 .ps1 shim");
    const ps1 = readFileSync(join(shimsDir, "openspec.ps1"), "utf8");
    assert.ok(ps1.includes("dist"), "ps1 shim 未委托 dist 路径");
    assert.ok(!ps1.includes('Join-Path $TOOL_DIR "lib"'), "ps1 shim 仍引用旧 lib 路径");

    // 基线：安装副作用为零（无 .opencode/package.json、无源码副本）
    assert.equal(existsSync(join(projectDir, ".opencode", "package.json")), false);
    assert.equal(existsSync(join(pkgDir, "src")), false, "tarball 含 src 源码");
    assert.equal(existsSync(join(pkgDir, "tsconfig.json")), false, "tarball 含 tsconfig");

    // 基线：dry-run 错误输入退出码非零（迁移前 cli.test.js 错误输入场景）
    const bad = runNode(join(pkgDir, "dist", "cli", "index.js"), ["__no_such_command__"], projectDir, 60_000);
    assert.notEqual(bad.status, 0, "未知命令应失败退出");
  } finally {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});




