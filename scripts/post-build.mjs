#!/usr/bin/env node
/**
 * 构建后置：把 src/package.json（{"type":"module"}）复制到 dist/，
 * 使编译产物被 Node 判定为 ESM（根 package.json 在过渡期保持无 type 以兼容未迁移 CJS）。
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "src", "package.json");
const targetDir = join(root, "dist");
if (!existsSync(source)) {
  console.error("src/package.json missing; cannot mark dist as ESM");
  process.exit(1);
}
copyFileSync(source, join(targetDir, "package.json"));
