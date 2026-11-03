#!/usr/bin/env node
/**
 * 提权测试套件编排器：npm test 的收尾步骤。
 *
 * 用一遍 npm test 跑完主套件 + elevated 套件：
 *   1. Unix（Linux / macOS）：elevated 套件不需要提权，直接串行运行。
 *      lifecycle-e2e 用本地安装 + 隔离 bin 目录，不写机器全局 npm bin；
 *   2. Windows：检测 gsudo 是否可用；
 *      - 可用 → `gsudo node --test --test-concurrency=1 test/elevated/*.test.js`
 *        （symlink 夹具在 Windows 建链属特权操作）；
 *      - 不可用 → 打印 SKIPPED 说明，不视为失败；
 *   3. 必须串行（--test-concurrency=1）：lifecycle-e2e 安装 tarball 会改写隔离 bin，
 *      与其他套件并发会让后者的 openspec 调用指向临时项目而失败；
 *   4. 任一环节失败则以非零码退出。
 *
 * 用户视角：一次 `npm test`，主套件 + elevated 全绿（Windows 首次 gsudo 弹一次 UAC，
 * `gsudo cache on` 可缓存凭据；Unix/CI 无需提权）。
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const elevatedDir = join("test", "elevated");
const elevatedFiles = readdirSync(elevatedDir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(elevatedDir, f).replace(/\\/g, "/"));

if (elevatedFiles.length === 0) {
  console.error("no elevated test files found");
  process.exit(1);
}

function runDirect() {
  const r = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...elevatedFiles],
    { stdio: "inherit", shell: false },
  );
  if (r.error) {
    console.error(`elevated suite failed to start: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

// Unix（Linux / macOS）：elevated 套件无需提权，直接运行。
if (process.platform !== "win32") {
  console.log(`ELEVATED: running ${elevatedFiles.length} elevated test file(s) ...`);
  process.exit(runDirect());
}

// Windows：symlink 夹具需要管理员权限，经 gsudo 提权运行。
const gsudoCheck = spawnSync("gsudo", ["--version"], { encoding: "utf8", shell: false });

if (gsudoCheck.error || gsudoCheck.status !== 0) {
  console.log("SKIPPED: elevated suite (gsudo not available; run `gsudo node --test test/elevated/` manually)");
  process.exit(0);
}

console.log(`ELEVATED: running ${elevatedFiles.length} elevated test file(s) via gsudo ...`);
const r = spawnSync(
  "gsudo",
  ["node", "--test", "--test-concurrency=1", ...elevatedFiles],
  { stdio: "inherit", shell: false },
);

if (r.error) {
  console.log(`SKIPPED: elevated suite (gsudo elevation rejected: ${r.error.message})`);
  process.exit(0);
}

process.exit(r.status ?? 1);
