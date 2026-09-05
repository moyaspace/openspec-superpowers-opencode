/**
 * 测试运行入口（规范固定做法：显式发现文件，不依赖 shell 展开 **）。
 * 用法：node --import tsx test/run.mjs
 */
import { run } from "node:test";
import { discoverTestFiles } from "./run-tests.ts";
import { pathToFileURL } from "node:url";
import process from "node:process";

const files = discoverTestFiles();
if (files.length === 0) {
  console.error("no test files discovered");
  process.exit(1);
}
let failed = false;
const runner = run({
  files: files.map((f) => pathToFileURL(f).href),
  concurrency: false,
});
runner.on("test:fail", (e) => {
  failed = true;
  console.error(`FAIL: ${e.name} — ${e.details?.error?.message ?? ""}`);
});
runner.on("test:pass", (e) => {
  console.log(`PASS: ${e.name}`);
});
runner.on("close", () => {
  process.exit(failed ? 1 : 0);
});
