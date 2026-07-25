#!/usr/bin/env node
// openspec-superpowers-opencode — 项目 CLI 工具
//
// 用法：
//   cd my-project && openspec-superpowers-opencode init
//   openspec-superpowers-opencode init my-project
//   create-openspec-superpowers-opencode my-project                   别名

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const toolDir = path.resolve(__dirname, '..');          // 工具安装根目录
const { findProjectRoot, getChangeRegistryPath } = require(path.join(toolDir, 'lib', 'registry-utils'));
const setupApi = require(path.join(toolDir, 'lib', 'setup'));
const { runSetupCommand } = require(path.join(toolDir, 'lib', 'setup', 'cli-adapter'));

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';

// 解析 --lang 参数（必须在 isHelp 之前）
const langIndex = args.indexOf('--lang');
let lang = 'en';
if (langIndex >= 0 && args[langIndex + 1] && !args[langIndex + 1].startsWith('-')) {
    lang = args[langIndex + 1];
    args.splice(langIndex, 2); // 从参数列表中移除，避免干扰子命令解析
}

const isVersion = args.some(a => a === '--version' || a === '-v');
if (isVersion) {
    console.log(require(path.join(toolDir, 'package.json')).version);
    process.exit(0);
}

const isHelp = args.length === 0 || args.some(a => a === '--help' || a === '-h');

const subcommand = args[0];
const subarg = args[1]; // 子命令参数（目录名或变更名）

// ---- 多语言消息 ----
function t(zh, en) {
    return lang === 'zh-CN' || lang === 'zh-TW' ? zh : en;
}

const helpText = lang === 'zh-CN' || lang === 'zh-TW' ? `
 用法:
    openspec-superpowers-opencode init [目录] [--lang zh-CN|zh-TW|en]  初始化项目
    openspec-superpowers-opencode reset             重置项目配置
    openspec-superpowers-opencode dry-run [--lang zh-CN|zh-TW|en]     预览变更
    openspec-superpowers-opencode ensure-worktree <name>    确保 worktree 已创建
    openspec-superpowers-opencode registry add <name> <worktree>  注册表添加变更
    openspec-superpowers-opencode registry remove <name>    注册表删除变更
    openspec-superpowers-opencode registry list             列出所有活跃变更
    openspec-superpowers-opencode registry reset            重置注册表为空
    openspec-superpowers-opencode verify                   验证系统完整性（5 项检查）
    openspec-superpowers-opencode registry verify           轻量验证（仅 oso-change-registry.json + worktree）
    openspec-superpowers-opencode install-shims             安装/修复垫片脚本
    openspec-superpowers-opencode uninstall-shims           卸除垫片脚本，恢复原始 openspec
    openspec-superpowers-opencode remove-worktree <name>    删除 worktree 和分支

  语言:
    --lang zh-CN    简体中文
    --lang zh-TW    繁体中文
    --lang en       英文（默认）

 文档:
    docs/QUICKSTART.md    快速开始指南（安装目录下）

 示例:
    mkdir my-project && cd my-project
    openspec-superpowers-opencode init --lang en

 说明:
    复制模板 → git init → 安装配置 → 首次提交

 在 OpenCode 中打开项目后的完整工作流:
    /opsx-ff <功能名>    创建变更并生成全部 artifacts
    /opsx-apply          获取上下文，开始实现
    /opsx-verify         验证实现 vs 规格
    /opsx-finish         完成变更（合并/清理）
    /opsx-archive        归档变更
` : `
 Usage:
    openspec-superpowers-opencode init [dir] [--lang zh-CN|zh-TW|en]  Init project
    openspec-superpowers-opencode reset              Reset project config
    openspec-superpowers-opencode dry-run [--lang zh-CN|zh-TW|en]    Preview changes
    openspec-superpowers-opencode ensure-worktree <name>    Ensure worktree exists
    openspec-superpowers-opencode registry add <name> <worktree>  Add change to registry
    openspec-superpowers-opencode registry remove <name>    Remove change from registry
    openspec-superpowers-opencode registry list             List active changes
    openspec-superpowers-opencode registry reset            Reset registry to empty
    openspec-superpowers-opencode verify                   Verify system integrity (5 checks)
    openspec-superpowers-opencode registry verify           Lightweight verify (only oso-change-registry.json + worktree)
    openspec-superpowers-opencode install-shims             Install/repair shim scripts
    openspec-superpowers-opencode uninstall-shims           Uninstall shim scripts, restore original openspec
    openspec-superpowers-opencode remove-worktree <name>    Remove worktree and clean branch

  Language:
    --lang zh-CN    Simplified Chinese
    --lang zh-TW    Traditional Chinese
    --lang en       English (default)

 Docs:
    docs/QUICKSTART.md    Quick start guide (in installation directory)

 Examples:
    mkdir my-project && cd my-project
    openspec-superpowers-opencode init --lang en

 Description:
    Copy template → git init → install config → first commit

 Full workflow after opening project in OpenCode:
    /opsx-ff <name>     Create change and generate all artifacts
    /opsx-apply         Get context, start implementation
    /opsx-verify        Verify implementation vs specs
    /opsx-finish        Complete change (merge/cleanup)
    /opsx-archive       Archive change
`;

if (isHelp) {
    console.log(helpText);
    process.exit(0);
}

if (subcommand === 'init' || subcommand === 'reset' || subcommand === 'dry-run') {
    const targetDir = subarg ? path.resolve(subarg) : process.cwd();
    runSetupCli(subcommand, targetDir, lang);
} else if (subcommand === 'ensure-worktree') {
    if (!subarg) {
        console.error(t('用法: openspec-superpowers-opencode ensure-worktree <name>', 'Usage: openspec-superpowers-opencode ensure-worktree <name>'));
        process.exit(1);
    }
    runEnsureWorktree(subarg, process.cwd());
} else if (subcommand === 'registry') {
    handleRegistry(args.slice(1));
} else if (subcommand === 'verify') {
    runVerifyTop();
} else if (subcommand === 'install-shims') {
    runInstallShims();
} else if (subcommand === 'uninstall-shims') {
    runUninstallShims();
} else if (subcommand === 'remove-worktree') {
    if (!subarg) {
        console.error(t(
            '用法: openspec-superpowers-opencode remove-worktree <name>',
            'Usage: openspec-superpowers-opencode remove-worktree <name>'
        ));
        process.exit(1);
    }
    runRemoveWorktree(subarg, process.cwd());
} else {
    console.error(t(`未知子命令: ${subcommand}`, `Unknown subcommand: ${subcommand}`));
    console.error(t('可用命令: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims, remove-worktree', 'Available commands: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims, remove-worktree'));
    process.exit(1);
}

// ====================================================================

/**
 * 交互式询问函数
 * @param {string} query — 提示文字
 * @returns {Promise<string>}
 */
function ask(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(query, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function runSetupCli(subcommand, targetDir, lang) {
    const result = await runSetupCommand(subcommand, {
        targetDir,
        lang,
        env: process.env,
        prompt: ask,
    }, setupApi);
    if (result.error) console.error(result.error.message || result.error);
    if (result.value && result.value.verification && result.value.verification.error) {
        console.error(result.value.verification.error.message);
    }
    if (subcommand === 'dry-run' && result.value && Array.isArray(result.value.operations)) {
        for (const operation of result.value.operations) {
            console.log(`  ${operation.type}: ${operation.target || operation.path}`);
        }
    } else if (result.code === 0 && result.value && result.value.cancelled) {
        console.log(t('  已取消', '  Cancelled'));
    } else if (result.code === 0 && subcommand === 'init') {
        console.log(t('  初始化完成', '  Initialization complete'));
    } else if (result.code === 0 && subcommand === 'reset') {
        console.log(t('  重置完成', '  Reset complete'));
    }
    process.exitCode = result.code;
}

function run(cmd, cwd) {
    try {
        execSync(cmd, { cwd, stdio: 'inherit', shell: true });
        return true;
    } catch (e) {
        console.error(t(`  ✗ 命令失败 (exit ${e.status}): ${cmd}`, `  ✗ Command failed (exit ${e.status}): ${cmd}`));
        return false;
    }
}

// ---- ensure-worktree — 确保变更的隔离 worktree 已创建 ----
function runEnsureWorktree(name, cwd) {
    const worktreeDir = path.join(cwd, '.worktrees', name);

    if (fs.existsSync(worktreeDir)) {
        console.log(t(`  ✓ worktree 已存在: .worktrees/${name}/`, `  ✓ Worktree already exists: .worktrees/${name}/`));
        process.exit(0);
    }

    const branch = `feature/${name}`;

    // 清理残留分支（正常流程下不应存在，但 PR 后可能残余）
    try {
        execSync(`git branch -D "${branch}"`, { cwd, stdio: 'ignore' });
    } catch (_) {
        // 分支不存在或删除失败都不阻塞
    }

    console.log(t(`  → 创建 worktree: .worktrees/${name}/ (${branch})`, `  → Creating worktree: .worktrees/${name}/ (${branch})`));

    const wkCmd = isWin
        ? `git worktree add ".worktrees\\${name}" -b "${branch}"`
        : `git worktree add ".worktrees/${name}" -b "${branch}"`;

    const ok = run(wkCmd, cwd);
    if (!ok) {
        console.error(t('  ✗ worktree 创建失败', '  ✗ Worktree creation failed'));
        process.exit(1);
    }

    console.log(t(`  ✓ worktree 创建完成: .worktrees/${name}/`, `  ✓ Worktree created: .worktrees/${name}/`));
    process.exit(0);
}

// ---- remove-worktree — 清除变更 worktree 和分支 ----
function runRemoveWorktree(name, cwd) {
    const worktreeDir = path.join(cwd, '.worktrees', name);
    const branch = `feature/${name}`;

    // 1. git worktree remove --force
    let wktOk = true;
    try {
        execSync(`git worktree remove --force "${worktreeDir}"`, { cwd, stdio: 'ignore' });
        console.log(t(`  ✓ worktree 已移除: .worktrees/${name}/`, `  ✓ Worktree removed: .worktrees/${name}/`));
    } catch (_) {
        wktOk = false;
        console.log(t(`  ✗ worktree 移除失败: .worktrees/${name}/`, `  ✗ Worktree remove failed: .worktrees/${name}/`));
    }

    // 2. git branch -D
    let branchOk = true;
    try {
        execSync(`git branch -D "${branch}"`, { cwd, stdio: 'ignore' });
        console.log(t(`  ✓ 分支已删除: ${branch}`, `  ✓ Branch deleted: ${branch}`));
    } catch (_) {
        branchOk = false;
        console.log(t(`  ✗ 分支删除失败: ${branch}`, `  ✗ Branch delete failed: ${branch}`));
    }

    process.exit((wktOk && branchOk) ? 0 : 1);
}

// ---- handleRegistry — registry 子命令处理 ----
async function handleRegistry(registryArgs) {
    const action = registryArgs[0];

    if (!action || (action !== 'verify' && action !== 'list' && action !== 'add' && action !== 'remove' && action !== 'reset')) {
        console.error(t(
            '用法: openspec-superpowers-opencode registry <add|remove|list|verify|reset> [参数...]',
            'Usage: openspec-superpowers-opencode registry <add|remove|list|verify|reset> [args...]'
        ));
        process.exit(1);
    }

    const projectRoot = findProjectRoot(process.cwd());

    if (action === 'verify') {
        // registry verify 为轻量版：只检查 oso-change-registry.json + worktree 目录
        const ok = runRegistryVerifyLight(projectRoot);
        process.exit(ok ? 0 : 1);
    }

    if (!projectRoot) {
        console.error(t(
            '错误: 不在 OpenSpec 项目中（不在 git 仓库或项目未初始化，请先执行 openspec-superpowers-opencode init）',
            'Error: Not in an OpenSpec project (not in a git repo or project not initialized, run openspec-superpowers-opencode init first)'
        ));
        process.exit(1);
    }

    const registryPath = getChangeRegistryPath(process.cwd());
        const registry = require(path.join(toolDir, 'lib', 'registry'));

    switch (action) {
        case 'add': {
            const name = registryArgs[1];
            const worktree = registryArgs[2];
            if (!name || !worktree) {
                console.error(t('用法: registry add <name> <worktree>', 'Usage: registry add <name> <worktree>'));
                process.exit(1);
            }
            try {
                registry.add(registryPath, name, worktree);
                console.log(t(`  ✓ 注册表已更新: ${name}`, `  ✓ Registry updated: ${name}`));
            } catch (e) {
                console.error(t(`  ✗ 写入注册表失败: ${e.message}`, `  ✗ Registry write failed: ${e.message}`));
                process.exit(1);
            }
            break;
        }
        case 'remove': {
            const name = registryArgs[1];
            if (!name) {
                console.error(t('用法: registry remove <name>', 'Usage: registry remove <name>'));
                process.exit(1);
            }
            try {
                registry.remove(registryPath, name);
                console.log(t(`  ✓ 已从注册表删除: ${name}`, `  ✓ Removed from registry: ${name}`));
            } catch (e) {
                console.error(t(`  ✗ 写入注册表失败: ${e.message}`, `  ✗ Registry write failed: ${e.message}`));
                process.exit(1);
            }
            break;
        }
        case 'list': {
            const output = registry.list(registryPath);
            console.log(output);
            break;
        }
        case 'reset': {
            try {
                const result = registry.reset(registryPath);
                const msg = result.backupPath
                    ? `  ✓ 注册表已重置 (备份: ${result.backupPath}, 原条目: ${result.changesCount})`
                    : `  ✓ 注册表已重置 (原条目: ${result.changesCount})`;
                console.log(t(msg, `  ✓ Registry reset (backup: ${result.backupPath}, previous entries: ${result.changesCount})`));
            } catch (e) {
                console.error(t(`  ✗ 重置注册表失败: ${e.message}`, `  ✗ Registry reset failed: ${e.message}`));
                process.exit(1);
            }
            break;
        }
    }
}

// ---- runRegistryVerifyLight — registry verify 轻量版（只检查 oso-change-registry.json + worktree 目录）----
function runRegistryVerifyLight(projectRoot) {
    let allGood = true;

    if (!projectRoot) {
        console.log('  ∼ oso-change-registry.json: not in a project, skipped');
        return true;
    }

    const registryPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (fs.existsSync(registryPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
            const count = data && Array.isArray(data.changes) ? data.changes.length : 0;
            console.log(`  ${count > 0 ? '✓' : '∼'} oso-change-registry.json: ${count} change(s)`);
        } catch {
            console.log('  ⚠ oso-change-registry.json: corrupted');
            allGood = false;
        }
    } else {
        console.log('  ⚠ oso-change-registry.json: not found');
        allGood = false;
    }

    try {
    const registry = require(path.join(toolDir, 'lib', 'registry'));
        const data = registry.read(registryPath);
        let worktreeOk = true;
        for (const c of data.changes) {
            if (!fs.existsSync(path.join(projectRoot, c.worktree))) {
                console.log(`  ⚠ worktree ${c.name}: not found (${c.worktree})`);
                worktreeOk = false;
                allGood = false;
            }
        }
        if (worktreeOk && data.changes.length > 0) {
            console.log('  ✓ worktrees: all present');
        } else if (data.changes.length === 0) {
            console.log('  ∼ worktrees: no active changes');
        }
    } catch {
        // registry module 加载或读取失败
    }

    return allGood;
}

// ---- runVerifyTop — 顶层 verify 命令：完整 5 项检查 ----
function runVerifyTop() {
    const verify = require(path.join(toolDir, 'lib', 'verify'));
    const projectRoot = findProjectRoot(process.cwd());
    const results = verify.runAllChecks(toolDir, isWin, projectRoot);
    const output = verify.formatResults(results);
    console.log(output);
    const ok = verify.allPass(results);
    process.exit(ok ? 0 : 1);
}

// ---- runInstallShims — 安装/修复 openspec CLI 垫片脚本 ----
function runInstallShims() {
    const installer = require(path.join(toolDir, 'lib', 'shims-installer'));
    const result = installer.installShims(toolDir, isWin);

    if (result.success) {
        console.log('  ✓ Shim scripts installed successfully');
    } else {
        console.log('  ⚠ Failed to install shim scripts');
    }

    for (const d of result.details) {
        console.log(`    ${d}`);
    }

    process.exit(result.success ? 0 : 1);
}

// ---- runUninstallShims — 卸除 openspec CLI 垫片脚本 ----
function runUninstallShims() {
    const installer = require(path.join(toolDir, 'lib', 'shims-installer'));
    const result = installer.uninstallShims(toolDir, isWin);

    if (result.success) {
        console.log('  ✓ Shim scripts uninstalled successfully');
    } else {
        console.log('  ⚠ Failed to uninstall shim scripts');
    }

    for (const d of result.details) {
        console.log(`    ${d}`);
    }

    process.exit(result.success ? 0 : 1);
}
