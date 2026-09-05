/**
 * lib/setup/console-reporter.js 行为刻画（IMP-48：迁移前无覆盖，先补基线）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConsoleReporter, progressFromReporter } = require("../lib/setup/console-reporter.js");

test("createConsoleReporter: 暴露计划中的报告方法且调用不抛异常", () => {
  const reporter = createConsoleReporter({ quiet: true });
  assert.equal(typeof reporter, "object");
  for (const method of ["plan", "step", "info", "warn", "error", "success", "finish"]) {
    if (reporter[method] !== undefined) {
      assert.equal(typeof reporter[method], "function", `reporter.${method} 应为函数`);
    }
  }
});

test("progressFromReporter: 从 reporter 派生进度（返回函数式进度记录器）", () => {
  const reporter = createConsoleReporter({ quiet: true });
  const progress = progressFromReporter(reporter);
  assert.equal(typeof progress, "function");
});
