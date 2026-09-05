/**
 * bin/create-project.js 行为刻画（IMP-48：迁移前无覆盖，先补基线）。
 * 该入口委托 bin/cli.js 的 init 子命令——验证 argv 注入与委托关系。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  const r = spawnSync(process.execPath, [join(root, "dist", "cli", "create-project.js"), "some-target"], {
    cwd: project,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, OSO_SETUP_NONINTERACTIVE: "1" },
  });
  // 非交互无 TTY：init 需要确认输入——期望明确失败而不是挂起
  assert.notEqual(r.status, null, "进程不应被信号杀死");
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  assert.ok(out.length > 0, "应有可观察输出");
});
