/**
 * 测试运行入口（规范固定做法：显式发现文件，不依赖 shell 展开 **）。
 * 用法：node --import tsx test/run.mjs
 *
 * 实现说明：通过 node --test 以子进程方式运行显式文件清单——
 * 与阶段 0 Gate 的命令形态（node --import tsx --test <file>）等价，
 * 退出码直接来自 node:test runner，不做自研事件判定（事件级判定
 * 在编程模式 run() 下与子进程退出码存在语义差异，见 2026-09-06 迁移记录）。
 */
import { spawnSync } from "node:child_process";
import { discoverTestFiles } from "./run-tests.ts";
import { pathToFileURL } from "node:url";
import process from "node:process";

const files = discoverTestFiles();
if (files.length === 0) {
  console.error("no test files discovered");
  process.exit(1);
}

const fileArgs = files.map((f) => f.replace(/\\/g, "/"));
const r = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...fileArgs],
  { stdio: "inherit" },
);
process.exit(r.status ?? 1);
