#!/usr/bin/env node
// oso — 项目 CLI 工具
//
// 用法：
//   cd my-project && oso init
//   oso init my-project
//   create-openspec-superpowers-opencode my-project                   别名

import fs from 'node:fs';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import readline from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findProjectRoot, getChangeRegistryPath } from '../registry-utils.js';
import * as setupApi from '../setup/index.js';
import { runSetupCommand, type SetupApi, type SetupCommandResultValue } from '../setup/cli-adapter.js';
import { createConsoleReporter, progressFromReporter } from '../setup/console-reporter.js';
import * as registry from '../registry.js';
import * as verify from '../verify.js';
import { installShims, uninstallShims } from '../shims-installer.js';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // 工具安装根目录（dist/cli/ 上两级 = 包根）

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
// 仅在作为入口直接运行时才分发子命令：本模块被 import（如 init 的部署后验证）时必须无副作用。
const isEntry = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

// 解析 --lang 参数（必须在 isHelp 之前）
const langIndex = args.indexOf('--lang');
let lang = 'en';
if (langIndex >= 0 && args[langIndex + 1] && !args[langIndex + 1]?.startsWith('-')) {
    lang = args[langIndex + 1] as string;
    args.splice(langIndex, 2); // 从参数列表中移除，避免干扰子命令解析
}

const isVersion = args.some(a => a === '--version' || a === '-v');
if (isEntry && isVersion) {
    console.log((JSON.parse(fs.readFileSync(path.join(toolDir, 'package.json'), 'utf8')) as { version: string }).version);
    process.exit(0);
}

const isHelp = args.length === 0 || args.some(a => a === '--help' || a === '-h');

const subcommand = args[0];
const subarg = args[1]; // 子命令参数（目录名或变更名）

// ---- 多语言消息 ----
function t(zh: string, en: string): string {
    return lang === 'zh-CN' || lang === 'zh-TW' ? zh : en;
}

const helpText = lang === 'zh-CN' || lang === 'zh-TW' ? `
 用法:
    oso init [目录] [--lang zh-CN|zh-TW|en]  初始化项目
    oso reset             重置项目配置
    oso dry-run [--lang zh-CN|zh-TW|en]     预览变更
    oso ensure-worktree <name>    确保 worktree 已创建
    oso registry add <name> <worktree> [--base <branch>]  注册表添加变更
    oso registry remove <name>    注册表删除变更
    oso registry list             列出所有活跃变更
    oso registry reset            重置注册表为空
    oso verify                   验证系统完整性（5 项检查）
    oso registry verify           轻量验证（仅 oso-change-registry.json + worktree）
    oso install-shims             安装/修复垫片脚本
    oso uninstall-shims           卸除垫片脚本，恢复原始 openspec
    oso remove-worktree <name>    删除 worktree 和分支

  语言:
    --lang zh-CN    简体中文
    --lang zh-TW    繁体中文
    --lang en       英文（默认）

  文档:
    docs/QUICKSTART.md    快速开始指南（安装目录下）

  示例:
    mkdir my-project && cd my-project
    oso init --lang en

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
    oso init [dir] [--lang zh-CN|zh-TW|en]  Init project
    oso reset              Reset project config
    oso dry-run [--lang zh-CN|zh-TW|en]    Preview changes
    oso ensure-worktree <name>    Ensure worktree exists
    oso registry add <name> <worktree> [--base <branch>]  Add change to registry
    oso registry remove <name>    Remove change from registry
    oso registry list             List active changes
    oso registry reset            Reset registry to empty
    oso verify                   Verify system integrity (5 checks)
    oso registry verify           Lightweight verify (only oso-change-registry.json + worktree)
    oso install-shims             Install/repair shim scripts
    oso uninstall-shims           Uninstall shim scripts, restore original openspec
    oso remove-worktree <name>    Remove worktree and clean branch

  Language:
    --lang zh-CN    Simplified Chinese
    --lang zh-TW    Traditional Chinese
    --lang en       English (default)

  Docs:
    docs/QUICKSTART.md    Quick start guide (in installation directory)

  Examples:
    mkdir my-project && cd my-project
    oso init --lang en

  Description:
    Copy template → git init → install config → first commit

  Full workflow after opening project in OpenCode:
    /opsx-ff <name>     Create change and generate all artifacts
    /opsx-apply         Get context, start implementation
    /opsx-verify        Verify implementation vs specs
    /opsx-finish        Complete change (merge/cleanup)
    /opsx-archive       Archive change
`;

const KNOWN_SUBCOMMANDS = ['init', 'reset', 'dry-run', 'ensure-worktree', 'registry', 'verify', 'install-shims', 'uninstall-shims', 'remove-worktree'];

interface SubcommandHelp {
    usage: string;
    description: string;
    examples: string[];
}

function buildSubcommandHelp(subcommand: string, lang: string): string {
    const isZh = lang === 'zh-CN' || lang === 'zh-TW';
    const pick = (zh: string, en: string): string => (isZh ? zh : en);

    const entries: Record<string, SubcommandHelp> = {
        init: {
            usage: 'oso init [dir] [--lang zh-CN|zh-TW|en]',
            description: pick(
                '初始化项目：复制模板 → git init → 安装配置 → 首次提交。',
                'Initialize a project: copy template → git init → install config → first commit.',
            ),
            examples: ['oso init', 'oso init my-project', 'oso init --lang zh-CN'],
        },
        reset: {
            usage: 'oso reset [--lang zh-CN|zh-TW|en]',
            description: pick(
                '重置项目配置：依据安装清单回滚已部署文件。',
                'Reset project config: roll back deployed files using the install manifest.',
            ),
            examples: ['oso reset', 'oso reset --lang zh-CN'],
        },
        'dry-run': {
            usage: 'oso dry-run [--lang zh-CN|zh-TW|en]',
            description: pick(
                '预览初始化将产生的变更，不写入任何文件。',
                'Preview the changes init would make without writing any files.',
            ),
            examples: ['oso dry-run'],
        },
        'ensure-worktree': {
            usage: 'oso ensure-worktree <name>',
            description: pick(
                '确保变更的隔离 worktree 已创建（幂等，不会破坏已有分支）。',
                'Ensure the change worktree exists (idempotent, never clobbers an existing branch).',
            ),
            examples: ['oso ensure-worktree add-user-auth'],
        },
        registry: {
            usage: 'oso registry <add|remove|list|verify|reset> [args...]',
            description: pick(
                '管理活跃变更注册表：add 添加、remove 删除、list 列出、reset 重置、verify 轻量校验。',
                'Manage the active-change registry: add, remove, list, reset, verify.',
            ),
            examples: [
                'oso registry add add-user-auth .worktrees/add-user-auth',
                'oso registry list',
                'oso registry remove add-user-auth',
            ],
        },
        verify: {
            usage: 'oso verify',
            description: pick(
                '验证系统完整性（5 项检查）。',
                'Verify system integrity (5 checks).',
            ),
            examples: ['oso verify'],
        },
        'install-shims': {
            usage: 'oso install-shims',
            description: pick(
                '安装/修复 openspec 垫片脚本。权限说明：Unix 下若 openspec 装在系统 npm prefix（如 /usr/local/bin），需要 sudo oso install-shims；用 nvm 或用户级 prefix 时无需 sudo。Windows 需以管理员身份运行 PowerShell，若已安装 gsudo 可用 gsudo oso install-shims 代替。',
                'Install/repair the openspec shim scripts. Permissions: on Unix, if openspec lives under a system npm prefix (e.g. /usr/local/bin), run sudo oso install-shims; with nvm or a user-level prefix sudo is not needed. On Windows, run PowerShell as Administrator, or use gsudo oso install-shims when gsudo is installed.',
            ),
            examples: ['oso install-shims', 'sudo oso install-shims', 'gsudo oso install-shims'],
        },
        'uninstall-shims': {
            usage: 'oso uninstall-shims',
            description: pick(
                '卸除垫片脚本，恢复原始 openspec。',
                'Uninstall the shim scripts and restore the original openspec.',
            ),
            examples: ['oso uninstall-shims'],
        },
        'remove-worktree': {
            usage: 'oso remove-worktree <name>',
            description: pick(
                '删除 worktree 和对应分支。',
                'Remove the worktree and its branch.',
            ),
            examples: ['oso remove-worktree add-user-auth'],
        },
    };

    const entry = entries[subcommand];
    if (!entry) return '';

    return [
        pick(`用法: ${entry.usage}`, `Usage: ${entry.usage}`),
        '',
        entry.description,
        '',
        pick('示例:', 'Examples:'),
        ...entry.examples.map(example => `  ${example}`),
    ].join('\n');
}

const wantsSubHelp = args.some(a => a === '--help' || a === '-h');
if (isEntry && wantsSubHelp && subcommand !== undefined && KNOWN_SUBCOMMANDS.includes(subcommand)) {
    console.log(buildSubcommandHelp(subcommand, lang));
    process.exit(0);
}

if (isEntry && isHelp) {
    console.log(helpText);
    process.exit(0);
}

function runCli(): void {
    if (subcommand === 'init' || subcommand === 'reset' || subcommand === 'dry-run') {
        const targetDir = subarg ? path.resolve(subarg) : process.cwd();
        void runSetupCli(subcommand, targetDir, lang);
    } else if (subcommand === 'ensure-worktree') {
        if (!subarg) {
            console.error(t('用法: oso ensure-worktree <name>', 'Usage: oso ensure-worktree <name>'));
            process.exit(1);
        }
        runEnsureWorktree(subarg, process.cwd());
    } else if (subcommand === 'registry') {
        void handleRegistry(args.slice(1));
    } else if (subcommand === 'verify') {
        runVerifyTop();
    } else if (subcommand === 'install-shims') {
        runInstallShims();
    } else if (subcommand === 'uninstall-shims') {
        runUninstallShims();
    } else if (subcommand === 'remove-worktree') {
        if (!subarg) {
            console.error(t(
                '用法: oso remove-worktree <name>',
                'Usage: oso remove-worktree <name>'
            ));
            process.exit(1);
        }
        runRemoveWorktree(subarg, process.cwd());
    } else {
        console.error(t(`未知子命令: ${subcommand}`, `Unknown subcommand: ${subcommand}`));
        console.error(t(
            '可用命令: oso init, oso reset, oso dry-run, oso ensure-worktree, oso registry, oso verify, oso install-shims, oso uninstall-shims, oso remove-worktree',
            'Available commands: oso init, oso reset, oso dry-run, oso ensure-worktree, oso registry, oso verify, oso install-shims, oso uninstall-shims, oso remove-worktree'
        ));
        process.exit(1);
    }
}

if (isEntry) runCli();

export { runCli };

// ====================================================================

/**
 * 交互式询问函数
 * @param query — 提示文字
 * @returns Promise<string>
 */
function ask(query: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(query, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

async function runSetupCli(subcommand: string, targetDir: string, lang: string): Promise<void> {
    const reporter = createConsoleReporter({ mode: subcommand === 'dry-run' ? 'dry-run' : 'init' });
    const progress = progressFromReporter(reporter);
    const api: SetupApi = {
        dryRunProject: (options: unknown) => setupApi.dryRunProject(options as Parameters<typeof setupApi.dryRunProject>[0]) as Promise<SetupCommandResultValue>,
        initProject: (options: unknown) => setupApi.initProject(options as Parameters<typeof setupApi.initProject>[0]) as Promise<SetupCommandResultValue>,
        resetProject: (options: unknown) => setupApi.resetProject(options as Parameters<typeof setupApi.resetProject>[0]) as Promise<SetupCommandResultValue>,
    };
    const result = await runSetupCommand(subcommand, {
        targetDir,
        lang,
        env: process.env,
        prompt: ask,
        progress,
    }, api);
    if (result.error) console.error((result.error as Error).message || result.error);
    if (result.value && typeof result.value === 'object' && 'verification' in result.value) {
        const verification = (result.value as { verification?: { error?: { message?: string } | unknown } }).verification;
        if (verification && verification.error) {
            console.error((verification.error as { message?: string }).message);
        }
    }
    process.exitCode = result.code;
}

function run(cmd: string, cwd: string): boolean {
    try {
        // execSync 默认经 shell 执行（等价于原 shell: true）
        execSync(cmd, { cwd, stdio: 'inherit' });
        return true;
    } catch (e) {
        console.error(t(`  ✗ 命令失败 (exit ${(e as { status?: number }).status}): ${cmd}`, `  ✗ Command failed (exit ${(e as { status?: number }).status}): ${cmd}`));
        return false;
    }
}

// ---- ensure-worktree — 确保变更的隔离 worktree 已创建 ----

interface WorktreeEntry {
    path: string;
    branch: string | null;
}

/** 执行只读 git 查询；失败返回 null（调用方按「不可用」处理） */
function readGitOutput(cwd: string, args: string[]): string | null {
    try {
        return execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return null;
    }
}

function samePath(a: string, b: string): boolean {
    const normalize = (p: string): string => {
        const resolved = path.resolve(p);
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    return normalize(a) === normalize(b);
}

/**
 * 解析符号链接后的绝对路径（macOS 的 /var → /private/var、Windows 短路径等）。
 * 路径不存在时回退 `path.resolve`，避免比较过程中抛错。
 */
function realPath(p: string): string {
    const resolved = path.resolve(p);
    try {
        return fs.realpathSync.native(resolved);
    } catch {
        try {
            return fs.realpathSync(resolved);
        } catch {
            return resolved;
        }
    }
}

/** 解析 `git worktree list --porcelain` 为条目列表；git 不可用或失败时返回空数组 */
function readWorktreeEntries(cwd: string): WorktreeEntry[] {
    const output = readGitOutput(cwd, ['worktree', 'list', '--porcelain']);
    if (!output) return [];

    const entries: WorktreeEntry[] = [];
    let currentPath: string | null = null;
    let currentBranch: string | null = null;
    const flush = (): void => {
        if (currentPath !== null) entries.push({ path: currentPath, branch: currentBranch });
        currentPath = null;
        currentBranch = null;
    };

    for (const line of output.split(/\r?\n/)) {
        if (line.startsWith('worktree ')) {
            flush();
            currentPath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
            currentBranch = line.slice('branch '.length).trim();
        }
    }
    flush();
    return entries;
}

/**
 * 仓库根目录。在 linked worktree 内 `--show-toplevel` 返回的是该 worktree 根，
 * 因此用 `--git-common-dir`（指向主仓库 .git）反推真正的仓库根。
 * 不在 git 仓库时回退 cwd，保持原有报错行为。
 */
function resolveRepoRoot(cwd: string): string {
    const toplevel = readGitOutput(cwd, ['rev-parse', '--show-toplevel']);
    if (!toplevel) return cwd;

    const commonDir = readGitOutput(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
        ?? readGitOutput(cwd, ['rev-parse', '--git-common-dir']);
    if (!commonDir) return path.resolve(toplevel);

    const commonAbs = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    return path.dirname(realPath(commonAbs));
}

interface WorktreeFacts {
    dirExists: boolean;
    dirIsFile: boolean;
    dirIsEmpty: boolean;
    showToplevel: string | null;
    headBranch: string | null;
    branchExists: boolean;
    currentRoot: string | null;
}

type WorktreeAbortReason =
    | 'wrong-branch'
    | 'branch-checked-out-elsewhere'
    | 'occupied-by-file'
    | 'occupied-by-non-empty-dir'
    | 'stale-registration';

interface WorktreeDecision {
    action: 'reuse' | 'create' | 'abort' | 'prune';
    reason?: 'inside' | 'registered' | 'attach' | 'new';
    abort?: WorktreeAbortReason;
    detail?: string;
    removeEmptyDir?: boolean;
}

/**
 * 纯判定函数（不执行 git/fs）：按 design.md D2 的 8 种状态给出动作。
 * 输入中的路径与 showToplevel 均已由调用方 realpath 规范化。
 */
function decideWorktreeAction(
    entries: WorktreeEntry[],
    targetDir: string,
    branch: string,
    facts: WorktreeFacts,
): WorktreeDecision {
    const branchRef = `refs/heads/${branch}`;
    const isSelfWorktree = facts.showToplevel !== null && samePath(facts.showToplevel, targetDir);
    const targetEntry = entries.find((entry) => samePath(entry.path, targetDir));
    const branchOwner = entries.find((entry) => entry.branch === branchRef && !samePath(entry.path, targetDir));

    // A：已位于目标 worktree 内且分支正确 —— 零副作用复用
    if (facts.currentRoot !== null
        && samePath(facts.currentRoot, targetDir)
        && facts.headBranch === branch) {
        return { action: 'reuse', reason: 'inside' };
    }

    // E：登记还在但目录不存在或已不是 worktree 根 —— 先 prune 再判定
    if (targetEntry !== undefined && (!facts.dirExists || !isSelfWorktree)) {
        return { action: 'prune' };
    }

    // B / C：登记在、目录在、且确为目标 worktree 根
    if (targetEntry !== undefined) {
        if (facts.headBranch === branch) return { action: 'reuse', reason: 'registered' };
        return { action: 'abort', abort: 'wrong-branch', detail: facts.headBranch ?? '' };
    }

    // F：分支已被其他 worktree 检出 —— 先于任何破坏性动作中止
    if (branchOwner !== undefined) {
        return { action: 'abort', abort: 'branch-checked-out-elsewhere', detail: branchOwner.path };
    }

    // D：路径存在但不是登记的 worktree
    if (facts.dirExists) {
        if (facts.dirIsFile) return { action: 'abort', abort: 'occupied-by-file', detail: targetDir };
        if (!facts.dirIsEmpty) return { action: 'abort', abort: 'occupied-by-non-empty-dir', detail: targetDir };
        return {
            action: 'create',
            reason: facts.branchExists ? 'attach' : 'new',
            removeEmptyDir: true,
        };
    }

    // G / H：分支存在则挂回（保 SHA），否则新建
    return { action: 'create', reason: facts.branchExists ? 'attach' : 'new' };
}

function collectWorktreeFacts(targetDir: string, repoRoot: string, branchRef: string, cwd: string): WorktreeFacts {
    let dirExists = false;
    let dirIsFile = false;
    let dirIsEmpty = false;
    try {
        const stat = fs.statSync(targetDir);
        dirExists = true;
        if (stat.isDirectory()) {
            dirIsEmpty = fs.readdirSync(targetDir).length === 0;
        } else {
            dirIsFile = true;
        }
    } catch {
        dirExists = false;
    }

    const inspectable = dirExists && !dirIsFile;
    const showToplevel = inspectable ? readGitOutput(targetDir, ['rev-parse', '--show-toplevel']) : null;
    const headBranch = inspectable ? readGitOutput(targetDir, ['rev-parse', '--abbrev-ref', 'HEAD']) : null;
    const currentRoot = readGitOutput(cwd, ['rev-parse', '--show-toplevel']);
    const branchExists = readGitOutput(repoRoot, ['show-ref', '--verify', '--quiet', branchRef]) !== null;

    return {
        dirExists,
        dirIsFile,
        dirIsEmpty,
        showToplevel: showToplevel !== null ? realPath(showToplevel) : null,
        headBranch,
        branchExists,
        currentRoot: currentRoot !== null ? realPath(currentRoot) : null,
    };
}

function pruneWorktrees(repoRoot: string): void {
    try {
        execFileSync('git', ['worktree', 'prune'], { cwd: repoRoot, stdio: 'ignore' });
    } catch {
        // 清理失败不阻断；调用方会按刷新后的登记簿重新判定
    }
}

function abortEnsureWorktree(reason: WorktreeAbortReason, detail: string, branch: string): never {
    switch (reason) {
        case 'wrong-branch':
            console.error(t(
                `  ✗ worktree 处于错误分支: ${detail || '(unknown)'}（期望 ${branch}），已中止`,
                `  ✗ Worktree is on the wrong branch: ${detail || '(unknown)'} (expected ${branch}); aborted`
            ));
            break;
        case 'branch-checked-out-elsewhere':
            console.error(t(
                `  ✗ 分支 ${branch} 已被其他 worktree 检出: ${detail}，已中止`,
                `  ✗ Branch ${branch} is checked out in another worktree: ${detail}; aborted`
            ));
            break;
        case 'occupied-by-file':
            console.error(t(
                `  ✗ 目标路径已被文件占用: ${detail}，已中止（未做任何修改）`,
                `  ✗ Target path is occupied by a file: ${detail}; aborted without changes`
            ));
            break;
        case 'occupied-by-non-empty-dir':
            console.error(t(
                `  ✗ 目标路径是非空目录: ${detail}，已中止（未做任何修改）`,
                `  ✗ Target path is a non-empty directory: ${detail}; aborted without changes`
            ));
            break;
        case 'stale-registration':
            console.error(t(
                `  ✗ worktree 登记已失效且无法自动修复: ${detail}，已中止`,
                `  ✗ Worktree registration is stale and could not be repaired: ${detail}; aborted`
            ));
            break;
    }
    process.exit(1);
}

function verifyWorktreeReady(targetDir: string, branch: string, repoRoot: string, name: string): void {
    const failures: string[] = [];

    const toplevel = readGitOutput(targetDir, ['rev-parse', '--show-toplevel']);
    if (toplevel === null || !samePath(realPath(toplevel), realPath(targetDir))) {
        failures.push(t(
            `  ✗ 后置校验失败: worktree 根目录不匹配（--show-toplevel）: .worktrees/${name}/`,
            `  ✗ Post-validation failed: worktree root mismatch (--show-toplevel): .worktrees/${name}/`
        ));
    }

    const headBranch = readGitOutput(targetDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (headBranch !== branch) {
        failures.push(t(
            `  ✗ 后置校验失败: 当前分支为 ${headBranch ?? '(unknown)'}，期望 ${branch}`,
            `  ✗ Post-validation failed: current branch is ${headBranch ?? '(unknown)'}, expected ${branch}`
        ));
    }

    const commonDir = readGitOutput(targetDir, ['rev-parse', '--git-common-dir']);
    const commonResolved = commonDir === null ? null : realPath(path.resolve(targetDir, commonDir));
    if (commonResolved === null || !samePath(commonResolved, realPath(path.join(repoRoot, '.git')))) {
        failures.push(t(
            `  ✗ 后置校验失败: git-common-dir 不匹配仓库 .git: .worktrees/${name}/`,
            `  ✗ Post-validation failed: git-common-dir does not match repository .git: .worktrees/${name}/`
        ));
    }

    if (failures.length > 0) {
        for (const failure of failures) console.error(failure);
        process.exit(1);
    }
}

function runEnsureWorktree(name: string, cwd: string): void {
    const repoRoot = resolveRepoRoot(cwd);
    const targetDir = path.join(repoRoot, '.worktrees', name);
    const targetReal = realPath(targetDir);
    const branch = `feature/${name}`;
    const branchRef = `refs/heads/${branch}`;

    const readEntries = (): WorktreeEntry[] =>
        readWorktreeEntries(repoRoot).map((entry) => ({ ...entry, path: realPath(entry.path) }));

    let entries = readEntries();
    let pruned = false;
    let decision!: WorktreeDecision;

    for (;;) {
        const facts = collectWorktreeFacts(targetDir, repoRoot, branchRef, cwd);
        decision = decideWorktreeAction(entries, targetReal, branch, facts);
        if (decision.action !== 'prune') break;
        if (pruned) abortEnsureWorktree('stale-registration', targetDir, branch);
        pruneWorktrees(repoRoot);
        entries = readEntries();
        pruned = true;
    }

    if (decision.action === 'abort') {
        abortEnsureWorktree(decision.abort ?? 'stale-registration', decision.detail ?? targetDir, branch);
    }

    if (decision.action === 'reuse') {
        console.log(decision.reason === 'inside'
            ? t(`  ✓ 已在该 worktree 内: .worktrees/${name}/`, `  ✓ Already inside this worktree: .worktrees/${name}/`)
            : t(`  ✓ worktree 已存在: .worktrees/${name}/`, `  ✓ Worktree already exists: .worktrees/${name}/`));
        verifyWorktreeReady(targetDir, branch, repoRoot, name);
        process.exit(0);
    }

    if (decision.removeEmptyDir) {
        try {
            const stat = fs.statSync(targetDir);
            if (!stat.isDirectory() || fs.readdirSync(targetDir).length > 0) {
                abortEnsureWorktree('occupied-by-non-empty-dir', targetDir, branch);
            }
            fs.rmdirSync(targetDir);
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(t(`  ✗ 无法清理空目录: ${targetDir}`, `  ✗ Failed to remove empty directory: ${targetDir}`));
                process.exit(1);
            }
        }
    }

    console.log(t(`  → 创建 worktree: .worktrees/${name}/ (${branch})`, `  → Creating worktree: .worktrees/${name}/ (${branch})`));

    const dirArg = isWin ? `".worktrees\\${name}"` : `".worktrees/${name}"`;
    const branchArg = decision.reason === 'attach' ? `"${branch}"` : `-b "${branch}"`;
    const ok = run(`git worktree add ${dirArg} ${branchArg}`, repoRoot);
    if (!ok) {
        console.error(t('  ✗ worktree 创建失败', '  ✗ Worktree creation failed'));
        process.exit(1);
    }

    verifyWorktreeReady(targetDir, branch, repoRoot, name);
    console.log(t(`  ✓ worktree 创建完成: .worktrees/${name}/`, `  ✓ Worktree created: .worktrees/${name}/`));
    process.exit(0);
}

// ---- remove-worktree — 清除变更 worktree 和分支 ----
function runRemoveWorktree(name: string, cwd: string): void {
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
async function handleRegistry(registryArgs: string[]): Promise<void> {
    const action = registryArgs[0];

    if (!action || (action !== 'verify' && action !== 'list' && action !== 'add' && action !== 'remove' && action !== 'reset')) {
        console.error(t(
            '用法: oso registry <add|remove|list|verify|reset> [参数...]',
            'Usage: oso registry <add|remove|list|verify|reset> [args...]'
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
            '错误: 不在 OpenSpec 项目中（不在 git 仓库或项目未初始化，请先执行 oso init）',
            'Error: Not in an OpenSpec project (not in a git repo or project not initialized, run oso init first)'
        ));
        process.exit(1);
    }

    const registryPath = getChangeRegistryPath(process.cwd());

    switch (action) {
        case 'add': {
            const name = registryArgs[1];
            const worktree = registryArgs[2];
            if (!name || !worktree) {
                console.error(t('用法: registry add <name> <worktree> [--base <branch>]', 'Usage: registry add <name> <worktree> [--base <branch>]'));
                process.exit(1);
            }
            const baseFlagIdx = registryArgs.indexOf('--base');
            const baseValue = baseFlagIdx >= 0 ? registryArgs[baseFlagIdx + 1] : undefined;
            const baseBranch = baseValue && !baseValue.startsWith('-') ? baseValue : undefined;
            try {
                registry.add(registryPath as string, name, worktree, baseBranch);
                console.log(t(`  ✓ 注册表已更新: ${name}`, `  ✓ Registry updated: ${name}`));
            } catch (e) {
                console.error(t(`  ✗ 写入注册表失败: ${(e as Error).message}`, `  ✗ Registry write failed: ${(e as Error).message}`));
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
                registry.remove(registryPath as string, name);
                console.log(t(`  ✓ 已从注册表删除: ${name}`, `  ✓ Removed from registry: ${name}`));
            } catch (e) {
                console.error(t(`  ✗ 写入注册表失败: ${(e as Error).message}`, `  ✗ Registry write failed: ${(e as Error).message}`));
                process.exit(1);
            }
            break;
        }
        case 'list': {
            const output = registry.list(registryPath as string);
            console.log(output);
            break;
        }
        case 'reset': {
            try {
                const result = registry.reset(registryPath as string);
                const msg = result.backupPath
                    ? `  ✓ 注册表已重置 (备份: ${result.backupPath}, 原条目: ${result.changesCount})`
                    : `  ✓ 注册表已重置 (原条目: ${result.changesCount})`;
                console.log(t(msg, `  ✓ Registry reset (backup: ${result.backupPath}, previous entries: ${result.changesCount})`));
            } catch (e) {
                console.error(t(`  ✗ 重置注册表失败: ${(e as Error).message}`, `  ✗ Registry reset failed: ${(e as Error).message}`));
                process.exit(1);
            }
            break;
        }
    }
}

// ---- runRegistryVerifyLight — registry verify 轻量版（只检查 oso-change-registry.json + worktree 目录）----
function runRegistryVerifyLight(projectRoot: string | null): boolean {
    let allGood = true;

    if (!projectRoot) {
        console.log('  ∼ oso-change-registry.json: not in a project, skipped');
        return true;
    }

    const registryPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (fs.existsSync(registryPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as { changes?: unknown[] };
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
function runVerifyTop(): void {
    const projectRoot = findProjectRoot(process.cwd());
    const results = verify.runAllChecks(toolDir, isWin, projectRoot);
    const output = verify.formatResults(results);
    console.log(output);
    const ok = verify.allPass(results);
    process.exit(ok ? 0 : 1);
}

// ---- runInstallShims — 安装/修复 openspec CLI 垫片脚本 ----
function runInstallShims(): void {
    const result = installShims(toolDir, isWin);

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
function runUninstallShims(): void {
    const result = uninstallShims(toolDir, isWin);

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
