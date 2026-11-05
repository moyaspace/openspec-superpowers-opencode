#!/usr/bin/env node
/**
 * npm test 编排器：跑 typecheck / build / 主套件 / elevated，失败即停。
 *
 * 关于全局 openspec 垫片：
 *   测试会调用 `installShims()`，但所有真正落盘的入口都已把 bin 目录隔离到
 *   临时目录（`test/create-project.behavior.test.js` 与
 *   `test/elevated/lifecycle-e2e.test.js` 的 `makeIsolatedBin`，
 *   `test/shims-installer.test.js` 对 `execSync` 的替身）。主套件与 elevated
 *   前后由 `scripts/assert-global-bin-unchanged.mjs` 比对全局 bin 哈希，
 *   一旦测试写进机器全局 bin 即判失败——不需要「跑完再恢复」的兜底。
 *   详见 docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md。
 *
 * 用法（package.json 的 test 脚本调用）：
 *   node scripts/run-tests.mjs node --test "test/*.test.js"
 *
 * 备注：把主测试命令作为参数传入（而不是硬编码），既保留了
 * `package.json` 里 `node --test` 的契约字面量，也让编排器专注于
 * 「顺序执行 + 失败即停」。
 *
 * 退出码：测试链的退出码。
 */
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

/**
 * 解析主测试命令（`--` 之后的第一个 token 是可执行文件，其余为参数）。
 * @param {string[]} argv
 * @returns {{ cmd: string, args: string[] } | null}
 */
function parseMainTest(argv) {
  if (argv.length === 0) return null;
  return { cmd: argv[0], args: argv.slice(1) };
}

/**
 * 顺序执行命令，失败即停。
 * @param {Array<{ label: string, cmd: string, args: string[] }>} steps
 * @returns {number} 0 表示全部成功
 */
function runSteps(steps) {
  for (const step of steps) {
    const result = spawnSync(step.cmd, step.args, {
      stdio: "inherit",
      shell: isWin,
    });
    if (result.error) {
      console.error(`[test] 无法启动 ${step.label}: ${result.error.message}`);
      return 1;
    }
    const code = result.status ?? 1;
    if (code !== 0) {
      console.error(`[test] ${step.label} 失败（exit ${code}），后续步骤停止`);
      return code;
    }
  }
  return 0;
}

function main(argv) {
  const mainTest = parseMainTest(argv);
  if (!mainTest) {
    console.error("用法: node scripts/run-tests.mjs <command> [args...]");
    console.error('示例: node scripts/run-tests.mjs node --test "test/*.test.js"');
    return 2;
  }

  const guard = ["scripts/assert-global-bin-unchanged.mjs", "--"];
  const steps = [
    { label: "typecheck", cmd: "npm", args: ["run", "typecheck"] },
    { label: "build", cmd: "npm", args: ["run", "build"] },
    {
      label: "主套件",
      cmd: "node",
      args: [...guard, mainTest.cmd, ...mainTest.args],
    },
    {
      label: "elevated",
      cmd: "node",
      args: [...guard, "node", "test/elevated/run.mjs"],
    },
  ];

  return runSteps(steps);
}

process.exit(main(process.argv.slice(2)));
