#!/usr/bin/env node
/**
 * 0A 探针 CLI 的可执行 shim：直接转发到编译后的入口。
 * Node 在 ESM bin 上自动执行；process.exit 逻辑在 cli/index.ts 的 isDirectExecution 分支中。
 */
import "../dist/cli/index.js";
