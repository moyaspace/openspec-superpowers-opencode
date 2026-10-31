#!/usr/bin/env node
/**
 * 全局 bin 守卫：跑命令前后对比全局 npm bin 里 openspec* 的哈希。
 *
 * 用途：拦住「测试偷偷改开发机全局状态」。本仓库的 `oso init` 与包的
 * `install` 生命周期脚本都会调用 `installShims()`，它用 `where openspec`
 * 定位 bin —— 若测试不隔离 PATH，就会写进机器全局 npm bin，跑完留下
 * 指向已删临时目录的垫片（详见 docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md）。
 *
 * 为什么要包住整次运行而不是写成普通测试：Node 的测试文件并行执行，
 * 普通测试无法保证「在所有测试之前/之后」采样。
 *
 * 用法：
 *   node scripts/assert-global-bin-unchanged.mjs -- <command> [args...]
 *
 * 退出码：
 *   子命令非零 → 透传子命令退出码
 *   全局 bin 被改 → 1（并打印是哪个文件、怎么改的）
 *   用法错误 → 2
 *   找不到全局 openspec → 跳过检查，直接透传子命令退出码
 *
 * 调试用环境变量：
 *   OSO_GUARD_BIN_DIR  指定要监视的目录（测试用；生产不设）
 */
import { spawnSync } from 'node:child_process';
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** 与 installShims 的定位方式一致：只看 openspec 系列文件 */
const PREFIX = "openspec";

/**
 * 定位全局 bin 目录（openspec 所在目录）。
 * @returns {string | null} 目录绝对路径；找不到返回 null
 */
function findBinDir() {
  const override = process.env.OSO_GUARD_BIN_DIR;
  if (override) return override;

  const probe = process.platform === "win32"
    ? spawnSync("where.exe", [PREFIX], { encoding: "utf8" })
    : spawnSync("which", [PREFIX], { encoding: "utf8" });
  if (probe.status !== 0) return null;

  const first = (probe.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
  return first ? dirname(first) : null;
}

/**
 * 采集目录里 openspec* 文件快照（内容哈希 + 符号链接目标）。
 * @param {string | null} dir
 * @returns {{ dir: string, files: Record<string, { hash: string, symlink: boolean, target: string | null }> } | null}
 */
function snapshotBin(dir) {
  if (!dir || !existsSync(dir)) return null;

  let isDir = false;
  try {
    isDir = statSync(dir).isDirectory();
  } catch {
    return null;
  }
  if (!isDir) return null;

  /** @type {Record<string, { hash: string, symlink: boolean, target: string | null }>} */
  const files = {};
  for (const entry of readdirSync(dir)) {
    if (!entry.startsWith(PREFIX)) continue;
    const abs = join(dir, entry);

    let entryStats;
    try {
      entryStats = lstatSync(abs);
    } catch {
      continue;
    }
    if (!entryStats.isFile() && !entryStats.isSymbolicLink()) continue;

    const symlink = entryStats.isSymbolicLink();
    let hash;
    try {
      hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
    } catch {
      continue;
    }

    let target = null;
    if (symlink) {
      try {
        target = realpathSync(abs);
      } catch {
        target = null;
      }
    }
    files[entry] = { hash, symlink, target };
  }

  return { dir, files };
}

/**
 * 比较两个快照。
 * @param {{ files: Record<string, { hash: string, target: string | null }> }} before
 * @param {{ files: Record<string, { hash: string, target: string | null }> }} after
 * @returns {Array<{ kind: "added" | "removed" | "modified" | "retargeted", name: string, detail?: string }>}
 */
function diffSnapshots(before, after) {
  const changes = [];
  const names = [...new Set([...Object.keys(before.files), ...Object.keys(after.files)])].sort();

  for (const name of names) {
    const b = before.files[name];
    const a = after.files[name];
    if (!b) {
      changes.push({ kind: "added", name });
      continue;
    }
    if (!a) {
      changes.push({ kind: "removed", name });
      continue;
    }
    if (b.hash !== a.hash) {
      changes.push({ kind: "modified", name });
      continue;
    }
    if (b.target !== a.target) {
      changes.push({ kind: "retargeted", name, detail: `${b.target} -> ${a.target}` });
    }
  }
  return changes;
}

/**
 * @param {Array<{ kind: string, name: string, detail?: string }>} changes
 */
function formatChanges(changes) {
  return changes
    .map((c) => `  - ${c.kind}: ${c.name}${c.detail ? ` (${c.detail})` : ""}`)
    .join("\n");
}

/**
 * 运行子命令，继承 stdio。
 * `node` 直接用 process.execPath，避免在 Windows 上再经一层 shell 的引号处理。
 * @param {string} cmd
 * @param {string[]} args
 * @returns {number} 子命令退出码
 */
function runChild(cmd, args) {
  const useExecPath = cmd === "node" || cmd === process.execPath;
  const result = useExecPath
    ? spawnSync(process.execPath, args, { stdio: "inherit" })
    : spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

  if (result.error) {
    console.error(`[guard] 无法启动子命令: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * @param {string[]} argv
 * @returns {number} 退出码
 */
function main(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    console.error("用法: node scripts/assert-global-bin-unchanged.mjs -- <command> [args...]");
    return 2;
  }

  const cmd = argv[separator + 1];
  const args = argv.slice(separator + 2);

  const dir = findBinDir();
  const before = snapshotBin(dir);
  if (!before) {
    console.log(`[guard] 跳过全局 bin 检查（未找到 openspec：${dir ?? "不在 PATH 中"}）`);
    return runChild(cmd, args);
  }

  const fileCount = Object.keys(before.files).length;
  const childCode = runChild(cmd, args);

  const changes = diffSnapshots(before, snapshotBin(dir) ?? before);
  if (changes.length > 0) {
    console.error("");
    console.error(`[guard] ✗ 全局 bin 在运行期间被修改: ${before.dir}`);
    console.error(formatChanges(changes));
    console.error("  这是测试污染，不是断言失败。");
    console.error("  给触发 installShims / npm install 的测试隔离 PATH，而不是备份-恢复全局 bin。");
    console.error("  参考: docs/GLOBAL-BIN-TEST-POLLUTION-POSTMORTEM.md");
    return 1;
  }

  console.log(`[guard] ✓ 全局 bin 未被修改（${fileCount} 个文件）`);
  return childCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}

export { findBinDir, snapshotBin, diffSnapshots, formatChanges, main };
