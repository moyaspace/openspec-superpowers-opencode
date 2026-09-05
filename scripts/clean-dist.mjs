#!/usr/bin/env node
/**
 * 跨平台清理构建输出目录（0A 探针与 0B 构建共用）。
 * 用法（在包目录内执行）：node <repo>/scripts/clean-dist.mjs
 * 删除进程当前工作目录下的 dist/；目录不存在时静默成功。
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
rmSync(distDir, { recursive: true, force: true });
