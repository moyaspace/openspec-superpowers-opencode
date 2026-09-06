/**
 * 探针测试显式发现入口（规范要求：不依赖 shell 展开 **）。
 * 用法：node --import tsx test/run-tests.ts（或经 npm test）
 */
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = join(dirname(fileURLToPath(import.meta.url)));

export function discoverTestFiles(dir: string = testDir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...discoverTestFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".test.ts")) {
      files.push(join(dir, entry.name));
    }
  }
  return files.sort();
}

// 直接执行时：打印发现的测试文件供 node --test 消费（node:test 支持文件参数）
const isDirect =
  process.argv[1] !== undefined &&
  (await import("node:url")).pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirect) {
  for (const f of discoverTestFiles()) {
    process.stdout.write(`${f}\n`);
  }
}
