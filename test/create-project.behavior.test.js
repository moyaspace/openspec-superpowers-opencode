/**
 * bin/create-project.js 行为刻画（IMP-48：迁移前无覆盖，先补基线）。
 * 该入口委托 bin/cli.js 的 init 子命令——验证 argv 注入与委托关系。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 隔离 bin 目录：放一个 dummy openspec，并前置到 PATH。
 *
 * 为什么需要：`init` 会走真实 `installShims()`，它用 `where`/`which openspec`
 * 定位 bin 目录。不隔离时命中的是**机器全局** npm bin，于是：
 *   1. 每次跑测试都往全局写垫片（TOOL_DIR 指向临时项目），跑完就留下坏垫片；
 *   2. 另一个并行测试若正在 `cmd.exe` 执行同一个 `openspec.cmd`，文件被原地替换
 *      会让 cmd 按旧偏移读进新文件中间，报 `9009`（见 docs/ELEVATED-... 同批排查）。
 * 前置 dummy 后 `where openspec` 只命中临时目录，全局零副作用。
 */
function makeIsolatedBin() {
  const bin = mkdtempSync(join(tmpdir(), "createproj-bin-"));
  writeFileSync(join(bin, "openspec.cmd"), "@echo off\r\nexit /b 0\r\n");
  writeFileSync(join(bin, "openspec.ps1"), "exit 0\r\n");
  writeFileSync(join(bin, "openspec"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return bin;
}

test("create-project: --help 委托到 cli 的 init 用法（退出码 0 且不真正初始化）", () => {
  const project = mkdtempSync(join(tmpdir(), "createproj-"));
  const r = spawnSync(process.execPath, [join(root, "dist", "cli", "create-project.js"), "--help"], {
    cwd: project,
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(
    (r.stdout ?? "").includes("init"),
    `期望 init 用法说明，实际输出: ${(r.stdout ?? "").slice(0, 400)}`,
  );
});

test("create-project: 非交互环境下新项目初始化失败路径可观察（不挂起、退出码非零或输出错误说明）", () => {
  const project = mkdtempSync(join(tmpdir(), "createproj-"));
  const bin = makeIsolatedBin();
  try {
    const r = spawnSync(process.execPath, [join(root, "dist", "cli", "create-project.js"), "some-target"], {
      cwd: project,
      encoding: "utf8",
      timeout: 120_000,
      env: {
        ...process.env,
        OSO_SETUP_NONINTERACTIVE: "1",
        PATH: bin + delimiter + (process.env.PATH ?? ""),
      },
    });
    // 非交互无 TTY：init 需要确认输入——期望明确失败而不是挂起
    assert.notEqual(r.status, null, "进程不应被信号杀死");
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    assert.ok(out.length > 0, "应有可观察输出");
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
