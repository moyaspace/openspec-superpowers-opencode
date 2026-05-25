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
    runInit(targetDir, isWin, lang);
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
} else {
    console.error(t(`未知子命令: ${subcommand}`, `Unknown subcommand: ${subcommand}`));
    console.error(t('可用命令: init, reset, dry-run, ensure-worktree', 'Available commands: init, reset, dry-run, ensure-worktree'));
    process.exit(1);
}

// ====================================================================

function runInit(targetDir, isWin, lang) {
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

    // ---- 3. Git 初始化 + 提交 ----
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

    // ---- 5. 完成 ----
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
    return run(setupCmd, targetDir);
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
