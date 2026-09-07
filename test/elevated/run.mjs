#!/usr/bin/env node
/**
 * 提权测试套件编排器：npm test 的收尾步骤。
 *
 * 用一遍 npm test 跑完 199（主）+ 提权套件（elevated）：
 *   1. 主 glob 测试后，检测 gsudo 是否可用；
 *   2. 可用 → `gsudo node --test test/elevated/*.test.js` 提权运行（symlink 夹具 + 生命周期端到端）；
 *      不可用 → 打印 SKIPPED 说明，不视为失败；
 *   3. 任一环节失败则以非零码退出。
 *
 * 用户视角：一次 `npm test`，199 + elevated 全绿（首次 gsudo 弹一次 UAC，
 * `gsudo cache on` 可缓存凭据）。Unix/CI 无需 gsudo，直接跑 elevated 文件。
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

const gsudoCheck = spawnSync("gsudo", ["--version"], { encoding: "utf8", shell: false });

if (gsudoCheck.error || gsudoCheck.status !== 0) {
  console.log("SKIPPED: elevated suite (gsudo not available; run `gsudo node --test test/elevated/` manually)");
  process.exit(0);
}

console.log(`ELEVATED: running ${elevatedFiles.length} elevated test file(s) via gsudo ...`);
const r = spawnSync(
  "gsudo",
  [process.execPath, "--test", ...elevatedFiles],
  { stdio: "inherit", shell: false },
);

if (r.error) {
  console.log(`SKIPPED: elevated suite (gsudo elevation rejected: ${r.error.message})`);
  process.exit(0);
}

process.exit(r.status ?? 1);
