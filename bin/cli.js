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

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';

// 解析 --lang 参数（必须在 isHelp 之前）
const langIndex = args.indexOf('--lang');
let lang = 'en';
if (langIndex >= 0 && args[langIndex + 1] && !args[langIndex + 1].startsWith('-')) {
    lang = args[langIndex + 1];
    args.splice(langIndex, 2); // 从参数列表中移除，避免干扰子命令解析
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

if (subcommand === 'init') {
    const targetDir = subarg ? path.resolve(subarg) : process.cwd();
    runInit(targetDir, isWin, lang).catch(e => { console.error(e); process.exit(1); });
} else if (subcommand === 'reset') {
    const targetDir = subarg ? path.resolve(subarg) : process.cwd();
    runSetupScript(targetDir, isWin, true, false, lang);
} else if (subcommand === 'dry-run') {
    const targetDir = subarg ? path.resolve(subarg) : process.cwd();
    runSetupScript(targetDir, isWin, false, true, lang);
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
} else {
    console.error(t(`未知子命令: ${subcommand}`, `Unknown subcommand: ${subcommand}`));
    console.error(t('可用命令: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims', 'Available commands: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims'));
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

async function runInit(targetDir, isWin, lang) {
    console.log(`\ninit: ${targetDir}`);

    // ---- 0. 检查 git 仓库状态（在所有操作之前）----
    // 必须先检查再行动，避免在 dirty 仓库中留下部署垃圾
    const gitDir = path.join(targetDir, '.git');
    if (fs.existsSync(gitDir)) {
        const status = execSync('git status --porcelain', { cwd: targetDir, stdio: 'pipe' }).toString().trim();
        if (status.length > 0) {
            console.error(t(
                '\n  ✗ 工作目录有未提交的变更。请先提交或 stash 后再执行 init。',
                '\n  ✗ Working directory has uncommitted changes. Please commit or stash them before running init.'
            ));
            process.exit(1);
        }
    }

    // ---- 1. 创建目录 ----
    if (args[1] && !fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(t('  ✓ 创建目录', '  ✓ Created directory'));
    }

    // ---- 2. 从包内运行 setup 脚本（部署所有文件） ----
    console.log(t('\n--- 安装配置 ---', '\n--- Setup ---'));
    if (!runSetupScript(targetDir, isWin, false, false, lang)) {
        console.error(t('\n  ✗ 安装脚本失败', '\n  ✗ Setup script failed'));
        process.exit(1);
    }

    // ---- 4. 创建注册表 ----
    const registryDir = path.join(targetDir, 'openspec');
    const registryPath = path.join(registryDir, 'oso-change-registry.json');
    if (!fs.existsSync(registryPath)) {
        fs.mkdirSync(registryDir, { recursive: true });
        fs.writeFileSync(registryPath, JSON.stringify({ changes: [] }, null, 2) + '\n');
        console.log(t('  ✓ 创建注册表: openspec/oso-change-registry.json', '  ✓ Created registry: openspec/oso-change-registry.json'));
    } else {
        // 存在时询问用户是否覆盖（见 DESIGN.md 文件分类表）
        const answer = await ask(t('  openspec/oso-change-registry.json 已存在。覆盖？(y/N) ', '  openspec/oso-change-registry.json exists. Overwrite? (y/N) '));
        if (answer === 'y' || answer === 'yes') {
            fs.writeFileSync(registryPath, JSON.stringify({ changes: [] }, null, 2) + '\n');
            console.log(t('  ✓ 注册表已重置: openspec/oso-change-registry.json', '  ✓ Registry reset: openspec/oso-change-registry.json'));
        } else {
            console.log(t('  ∼ 注册表已存在，跳过', '  ∼ Registry exists, skipping'));
        }
    }

    // ---- 5. Git 初始化 + 提交 ----
    console.log(t('\n--- Git 初始化和提交 ---', '\n--- Git Init & Commit ---'));
    if (!fs.existsSync(path.join(targetDir, '.git'))) {
        run('git init --initial-branch=main', targetDir);
        run('git config core.autocrlf false', targetDir);
        run('git config advice.safeCrlf false', targetDir);
    }
    run('git -c core.autocrlf=false -c core.safecrlf=false add -A', targetDir);
    try {
        execSync('git diff --cached --quiet', { cwd: targetDir, stdio: 'pipe' });
        console.log(t('  (无变更需要提交)', '  (Nothing to commit)'));
    } catch {
        // 展示即将提交的变更清单
        const staged = execSync('git diff --cached --name-status', { cwd: targetDir }).toString();
        console.log(t('\n  即将提交：', '\n  About to commit:'));
        console.log(staged.split('\n').filter(l => l).map(l => '    ' + l).join('\n'));
        run('git -c core.autocrlf=false -c core.safecrlf=false commit -m "oso: launch OpenSpec + Superpowers workflow"', targetDir);
    }

    // ---- 6. 完成 ----
    console.log('');
    console.log('='.repeat(50));
    console.log(t('  🎉 初始化完成', '  🎉 Init complete'));
    console.log('='.repeat(50));
}

// ---- 调用 setup 脚本（通用：init / uninstall / dry-run） ----
function runSetupScript(targetDir, isWin, uninstall, dryRun, lang) {
    if (!fs.existsSync(targetDir)) {
        console.error(t('  ✗ 目录不存在: ', '  ✗ Directory not found: ') + targetDir);
        return false;
    }

    const sourceDir = path.dirname(path.dirname(__filename));
    const setupPath = path.join(sourceDir, 'scripts', `setup.${isWin ? 'ps1' : 'sh'}`);
    if (!fs.existsSync(setupPath)) {
        console.error(t('  ✗ 未找到 setup 脚本: ', '  ✗ Setup script not found: ') + setupPath);
        return false;
    }

    const flags = [];
    flags.push(`-ProjectRoot "${targetDir}"`);
    flags.push(`-Lang "${lang || 'en'}"`);
    if (uninstall) flags.push('-Uninstall');
    if (dryRun) flags.push('-DryRun');

    const l = lang || 'en';
    const setupCmd = isWin
        ? `pwsh -NoProfile -ExecutionPolicy Bypass -File "${setupPath}" ${flags.join(' ')}`
        : `bash "${setupPath}" --project-root="${targetDir}" --lang="${l}"${uninstall ? ' --uninstall' : ''}${dryRun ? ' --dry-run' : ''}`;

    const title = t(
        uninstall ? '卸载' : dryRun ? '预览' : '安装',
        uninstall ? 'Uninstalling' : dryRun ? 'Dry-run' : 'Setting up'
    );
    console.log(`  → ${title}...`);

    try {
        execSync(setupCmd, { cwd: targetDir, stdio: 'inherit', shell: true });
        return true;
    } catch (e) {
        if (e.status === 2) {
            // 全局门控 N → exit 2（用户取消，静默退出整个 init）
            process.exit(0);
        }
        console.error(t(`  ✗ 命令失败 (exit ${e.status}): ${setupCmd}`, `  ✗ Command failed (exit ${e.status}): ${setupCmd}`));
        return false;
    }
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

