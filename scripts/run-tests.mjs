#!/usr/bin/env node
/**
 * npm test 编排器：跑 typecheck / build / 主套件 / elevated，并在**结束时**
 * 把全局 openspec 垫片恢复为「机器上正式安装的 oso」，无论测试成功还是失败。
 *
 * 为什么需要：
 *   测试会调用 `installShims()`（`oso init` 的 `ensureShim`、`install-shims`
 *   子命令、以及垫片相关用例），把全局垫片的 TOOL_DIR 改写为当前工作区或临时
 *   目录。测试期间指向 V1 代码是必要的（有测试要验证垫片拦截），但临时目录
 *   / worktree 用完即删——
 *   一旦垫片还指着它，下一次 `openspec` 调用就会触发自愈降级（还原成原版、
 *   删掉 openspec-orig），全局跨 worktree 合并能力静默消失。
 *
 *   所以规矩是：**测试期间可以用 V1，测试结束必须还回正式安装版本**。
 *   详见 docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md。
 *
 * 用法（package.json 的 test 脚本调用）：
 *   node scripts/run-tests.mjs node --test "test/*.test.js"
 *
 * 备注：把主测试命令作为参数传入（而不是硬编码），既保留了
 * `package.json` 里 `node --test` 的契约字面量，也让编排器专注于
 * 「顺序执行 + 失败即停 + 无论如何恢复」。
 *
 * 退出码：
 *   测试链的退出码；若测试全绿但垫片恢复失败，返回 1。
 *
 * 环境变量：
 *   OSO_SKIP_SHIM_RESTORE=1  跳过恢复（调试用）
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

/**
 * 定位全局安装的 oso 命令（`npm i -g` 装到 PATH 里的那个）。
 * @returns {string | null} 命令名；找不到返回 null
 */
function findGlobalOso() {
  for (const name of ["oso", "openspec-superpowers-opencode"]) {
    const probe = spawnSync(isWin ? "where.exe" : "which", [name], { encoding: "utf8" });
    if (probe.status === 0 && (probe.stdout ?? "").trim()) return name;
  }
  return null;
}

/**
 * 把全局垫片恢复为「正式安装的 oso」。
 * 做法：调用全局 oso 的 `install-shims`——它内部的 toolDir 是全局包目录，
 * 因此与本仓库当前在哪个 worktree 无关。
 * @returns {{ ok: boolean, skipped: boolean, message: string }}
 */
function restoreGlobalShim() {
  if (process.env.OSO_SKIP_SHIM_RESTORE === "1") {
    return { ok: true, skipped: true, message: "[shim] OSO_SKIP_SHIM_RESTORE=1，跳过恢复" };
  }

  const oso = findGlobalOso();
  if (!oso) {
    return {
      ok: true,
      skipped: true,
      message: "[shim] 未找到全局安装的 oso，跳过恢复（CI / 未安装环境）",
    };
  }

  console.log(`[shim] 恢复全局垫片 → ${oso} install-shims`);
  const result = spawnSync(oso, ["install-shims"], { stdio: "inherit", shell: isWin });

  if (result.error) {
    return { ok: false, skipped: false, message: `[shim] 恢复失败: ${result.error.message}` };
  }
  if ((result.status ?? 1) !== 0) {
    return {
      ok: false,
      skipped: false,
      message: `[shim] 恢复失败（exit ${result.status}）；请手动执行 \`${oso} install-shims\``,
    };
  }
  return { ok: true, skipped: false, message: "[shim] ✓ 全局垫片已恢复为正式安装版本" };
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

  let code = 0;
  try {
    code = runSteps(steps);
  } finally {
    // 无论测试成败都要恢复：失败时 worktree 也可能被后续步骤删除
    const restored = restoreGlobalShim();
    console.log(restored.message);
    if (!restored.ok && code === 0) code = 1;
  }

  return code;
}

process.exit(main(process.argv.slice(2)));