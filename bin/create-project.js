#!/usr/bin/env node
// create-openspec-superpowers-opencode — 别名：相当于 openspec-superpowers-opencode init <dir>

const args = process.argv.slice(2);

// --lang 解析：设为全局以便 t() 使用
let lang = 'en';
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lang' && i + 1 < args.length) {
        if (['zh-CN', 'zh-TW', 'en'].includes(args[i + 1])) {
            lang = args[i + 1];
        }
    }
}

function t(zh, en) {
    return lang === 'zh-CN' || lang === 'zh-TW' ? zh : en;
}

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(t(`
用法:
  create-openspec-superpowers-opencode <target-dir>

等同于:
  openspec-superpowers-opencode init <target-dir>

示例:
  create-openspec-superpowers-opencode my-project
  cd my-project
  # 初始化已完成，直接在 OpenCode 中使用 /opsx-ff
`, `
Usage:
  create-openspec-superpowers-opencode <target-dir>

Equivalent to:
  openspec-superpowers-opencode init <target-dir>

Example:
  create-openspec-superpowers-opencode my-project
  cd my-project
  # Initialization complete. Use /opsx-ff in OpenCode.
`));
    process.exit(0);
}

// 委托给 cli.js：将 'init' 插入到参数前
process.argv.splice(2, 0, 'init');
require('./cli.js');
