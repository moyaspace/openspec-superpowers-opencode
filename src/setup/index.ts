import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createContext, type SetupContext } from './context.js';
import { executeOperations } from './deploy.js';
import { listLockMajors, locateSuperpowers, parseMajorVersion, selectLockFile } from './discovery.js';
import { mergeMarker, mergeOcodeJson } from './merge.js';
import { buildManifest, type Manifest } from './manifest.js';
import { createInitPlan, type InitDecisions, type InitPlan } from './planner.js';
import { createProcessRunner, type ProcessRunner, type RunResult } from './process-runner.js';
import { resolveDecision, type Decision } from './prompt.js';
import { resolveToolRoot, verifyNoPlaceholders, verifyProject } from './verify.js';
import { checkShim, ensureShim, type ShimDeps } from './shim-check.js';
import { resetProject } from './reset.js';
import { detectBash, type BashDetection } from '../verify.js';

interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    detail?: string;
    target?: string;
    n?: number;
    total?: number;
}

type ProgressCallback = (event: ProgressEvent) => void;

interface SkillLockEntry {
    sha256?: string | undefined;
}

interface SkillLockData {
    skills?: Record<string, SkillLockEntry> | undefined;
}

interface LockVerification {
    allMatch: boolean;
    warnings: string[];
}

interface SetupOptions {
    mode?: string | undefined;
    lang?: string | undefined;
    targetDir?: string | undefined;
    templateDir?: string | undefined;
    runner?: ProcessRunner | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    progress?: ProgressCallback | undefined;
    env?: NodeJS.ProcessEnv | undefined;
    superpowersPath?: string | undefined;
    superpowersVersion?: string | undefined;
    detectBash?: ((isWin: boolean) => BashDetection) | undefined;
    decisions?: InitDecisions | undefined;
    toolRoot?: string | undefined;
    shimDeps?: ShimDeps | undefined;
}

interface RequireCommandError extends Error {
    phase: string;
}

function requireCommand(result: RunResult, phase: string): RunResult {
    if (!result || result.code !== 0) {
        const error = new Error(
            `${phase} failed${result && result.stderr ? `: ${result.stderr.trim()}` : ''}`,
        ) as RequireCommandError;
        error.phase = phase;
        throw error;
    }
    return result;
}

function existingCommandCwd(targetDir: string): string {
    let candidate = path.resolve(targetDir);
    while (!fs.existsSync(candidate)) {
        const parent = path.dirname(candidate);
        if (parent === candidate) return process.cwd();
        candidate = parent;
    }
    return candidate;
}

function hasCompleteMarker(file: string, marker: string): boolean {
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(marker).length - 1 === 2;
}

interface SuperpowersResolution {
    skillsPath: string;
    version: string | null;
}

function resolveSuperpowers(options: SetupOptions): SuperpowersResolution {
    const located = locateSuperpowers({
        superpowersPath: options.superpowersPath,
        superpowersVersion: options.superpowersVersion,
    });
    if (!located) throw new Error('Superpowers skills directory was not found');
    return located;
}

function reportUnsupportedLock(
    templateDir: string,
    major: string | null,
    t: (zh: string, en: string) => string,
    p: ProgressCallback,
): void {
    const majors = listLockMajors(templateDir);
    if (major === null) {
        p({
            type: 'warn',
            item: t('无法确定 Superpowers 版本，跳过完整性校验', 'Unable to determine Superpowers version, skipping integrity check'),
        });
        p({ type: 'info', text: t('  请检查 Superpowers 安装是否完整', '  Please check the Superpowers installation') });
        return;
    }
    const numericMajor = Number(major);
    const lowest = majors.length > 0 ? Number(majors[0]) : null;
    const highest = majors.length > 0 ? Number(majors[majors.length - 1]) : null;
    if (highest !== null && numericMajor > highest) {
        p({
            type: 'warn',
            item: t(
                `当前 Superpowers v${major} 暂不受支持，跳过完整性校验`,
                `Superpowers v${major} is not supported yet, skipping integrity check`,
            ),
        });
        p({ type: 'info', text: t(`  请等待 oso 支持 v${major} 后再更新`, `  Please wait for oso to support v${major}`) });
        return;
    }
    if (lowest !== null && numericMajor < lowest) {
        p({
            type: 'warn',
            item: t(
                `Superpowers v${major} 已不受支持，跳过完整性校验`,
                `Superpowers v${major} is no longer supported, skipping integrity check`,
            ),
        });
        p({ type: 'info', text: t('  请升级 Superpowers', '  Please upgrade Superpowers') });
        return;
    }
    p({
        type: 'warn',
        item: t(
            `未找到 v${major} 的锁清单，跳过完整性校验`,
            `No lock manifest found for v${major}, skipping integrity check`,
        ),
    });
}

function writeManifest(projectRoot: string, manifest: Manifest): void {
    executeOperations([{
        type: 'write',
        target: path.join(projectRoot, '.opencode', 'install-manifest.json'),
        content: `${JSON.stringify(manifest, null, 2)}\n`,
    }], { projectRoot });
}

function createRegistry(projectRoot: string, progress?: ProgressCallback | undefined, overwrite = true): void {
    const p = progress || (() => {});
    const registryPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (fs.existsSync(registryPath) && !overwrite) {
        p({ type: 'info', text: 'oso-change-registry.json (already exists)' });
    } else if (fs.existsSync(registryPath) && overwrite) {
        executeOperations([{
            type: 'write',
            target: registryPath,
            content: '{\n  "changes": []\n}\n',
        }], { projectRoot });
        p({ type: 'milestone', text: 'Overwrote registry: openspec/oso-change-registry.json' });
    } else {
        executeOperations([{
            type: 'write',
            target: registryPath,
            content: '{\n  "changes": []\n}\n',
        }], { projectRoot });
        p({ type: 'milestone', text: 'Created registry: openspec/oso-change-registry.json' });
    }
}

type Translator = ((zh: string, en: string) => string) | undefined;

const PLACEHOLDER_TARGETS = [
    'AGENTS.md',
    'openspec/schemas/superpowers-bridge-opencode/schema.yaml',
    '.opencode/commands/opsx-apply.md',
    '.opencode/commands/opsx-finish.md',
] as const;

function listTemplateCommands(templateDir: string): string[] {
    const root = path.join(templateDir, '.opencode', 'commands');
    if (!fs.existsSync(root)) return [];
    const out: string[] = [];
    const walk = (relative: string): void => {
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const child = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(child);
            else if (entry.isFile() && entry.name.endsWith('.md')) out.push(child);
        }
    };
    walk('');
    return out.sort();
}

async function verifyDeploymentPostInit(toolRoot: string, context: SetupContext): Promise<string[]> {
    const missing: string[] = [];
    for (const relative of listTemplateCommands(context.templateDir)) {
        const target = path.join(context.targetDir, '.opencode', 'commands', ...relative.split('/'));
        if (!fs.existsSync(target)) missing.push(`.opencode/commands/${relative} (not deployed)`);
    }
    const cliEntry = path.join(toolRoot, 'dist', 'cli', 'index.js');
    if (!fs.existsSync(cliEntry)) {
        missing.push('dist/cli/index.js (missing)');
    } else {
        try {
            await import(pathToFileURL(cliEntry).href);
        } catch (error) {
            missing.push(`dist/cli/index.js (import failed: ${(error as Error).message})`);
        }
    }
    return missing;
}

function commitProject(
    targetDir: string,
    runner: ProcessRunner,
    progress?: ProgressCallback | undefined,
    tFn?: Translator,
): void {
    const p = progress || (() => {});
    const loc = tFn || ((zh: string, en: string) => en);
    const needsInit = !fs.existsSync(path.join(targetDir, '.git'));
    if (needsInit) {
        const initResult = requireCommand(runner.run('git', ['init', '--initial-branch=main'], { cwd: targetDir }), 'git-init');
        p({ type: 'raw', text: initResult.stdout.trim() });
        requireCommand(runner.run('git', ['config', 'core.autocrlf', 'false'], { cwd: targetDir }), 'git-config');
        requireCommand(runner.run('git', ['config', 'advice.safeCrlf', 'false'], { cwd: targetDir }), 'git-config');
    }
    requireCommand(
        runner.run('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '-A'], { cwd: targetDir }),
        'git-add',
    );
    // Files staged silently

    // Show "About to commit:" with changed files
    const staged = runner.run('git', ['diff', '--cached', '--name-status'], { cwd: targetDir });
    if (staged.code === 0 && staged.stdout.trim()) {
        p({ type: 'info', text: 'About to commit:' });
        for (const line of staged.stdout.trim().split('\n')) {
            if (line.trim()) p({ type: 'raw', text: `    ${line.trim()}` });
        }
    }

    const diff = runner.run('git', ['diff', '--cached', '--quiet'], { cwd: targetDir });
    if (diff.code !== 0) {
        const commitResult = requireCommand(
            runner.run('git', [
                '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
                'commit', '-m', 'oso: launch OpenSpec + Superpowers workflow',
            ], { cwd: targetDir }),
            'git-commit',
        );
        const commitLines = commitResult.stdout.trim().split('\n');
        for (const line of commitLines) {
            if (line.trim()) p({ type: 'raw', text: line });
        }
    } else {
        p({ type: 'info', text: loc('  无变更需要提交', '  No changes to commit') });
    }
}

interface BrownfieldOptions extends SetupOptions {
    context: SetupContext;
}

interface BrownfieldResult {
    cancelled: boolean;
    decisions: InitDecisions;
}

async function collectBrownfieldDecisions(options: BrownfieldOptions): Promise<BrownfieldResult> {
    if (options.context.projectKind !== 'brownfield') return { cancelled: false, decisions: {} };
    const env = options.env || process.env;
    const prompt = options.prompt;
    const p = options.progress || (() => {});
    const t = tFn(options.lang);

    const decide = (envName: string, question: string, allowAsk = false) => resolveDecision({
        override: env[envName],
        prompt,
        question,
        allowAsk,
    });
    const tDecide = async (envName: string, questionZh: string, questionEn: string, allowAsk = false): Promise<Decision> => {
        return await decide(envName, t(questionZh, questionEn), allowAsk);
    };

    const proceed = await tDecide('BROWN_OVERRIDE_INIT', '是否继续完整初始化棕地项目？', 'Brownfield project. Continue with full init?');
    if (proceed !== 'yes') return { cancelled: true, decisions: {} };
    p({ type: 'pass', item: t('用户确认', 'User confirmed') + ' openspec/' });
    const targetDir = options.context.targetDir;
    const hasEntries = (directory: string) => fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
    const listRelativeFiles = (root: string, relative = ''): string[] => {
        if (!fs.existsSync(root)) return [];
        const files: string[] = [];
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const child = path.join(relative, entry.name);
            if (entry.isDirectory()) files.push(...listRelativeFiles(root, child));
            else if (entry.isFile()) files.push(child);
        }
        return files.sort();
    };
    const openspecHasContent = fs.existsSync(path.join(targetDir, 'openspec', 'config.yaml'));
    const decisions: InitDecisions = {};
    if (env.BROWN_OVERRIDE_OPENSPEC || openspecHasContent) {
        decisions.openspec = await tDecide('BROWN_OVERRIDE_OPENSPEC', '覆盖 openspec/config.yaml？', 'Overwrite openspec/config.yaml?');
    } else {
        decisions.openspec = 'yes';
        p({ type: 'info', text: t('openspec/ 不存在，已部署', 'openspec/ not found, deployed') });
    }
    if (fs.existsSync(path.join(targetDir, '.opencode', 'opencode.json'))) {
        decisions.opencodeJson = await tDecide('BROWN_OVERRIDE_OCODEJSON', '合并 .opencode/opencode.json？', 'Merge .opencode/opencode.json?');
    }
    const commandOverride = env.BROWN_OVERRIDE_COMMANDS;
    if (hasEntries(path.join(targetDir, '.opencode', 'commands')) && commandOverride !== undefined) {
        decisions.commands = await tDecide('BROWN_OVERRIDE_COMMANDS', '覆盖 commands？', 'Overwrite commands?', true);
        if (decisions.commands === 'ask') {
            decisions.commandFiles = {};
            const sourceRoot = path.join(options.context.templateDir, '.opencode', 'commands');
            for (const relative of listRelativeFiles(sourceRoot)) {
                const portable = `.opencode/commands/${relative.replace(/\\/g, '/')}`;
                if (fs.existsSync(path.join(targetDir, ...portable.split('/')))) {
                    decisions.commandFiles[portable] = await resolveDecision({
                        prompt,
                        question: `Overwrite ${portable}?`,
                    });
                }
            }
        }
    }
    const skillOverride = env.BROWN_OVERRIDE_SKILLS;
    if (hasEntries(path.join(targetDir, '.opencode', 'skills')) && skillOverride !== undefined) {
        decisions.skills = await tDecide('BROWN_OVERRIDE_SKILLS', '覆盖 skills？', 'Overwrite skills?', true);
        if (decisions.skills === 'ask') {
            decisions.skillFiles = {};
            const sourceRoot = path.join(options.context.templateDir, '.opencode', 'skills');
            for (const relative of listRelativeFiles(sourceRoot)) {
                const portable = `.opencode/skills/${relative.replace(/\\/g, '/')}`;
                if (fs.existsSync(path.join(targetDir, ...portable.split('/')))) {
                    decisions.skillFiles[portable] = await resolveDecision({
                        prompt,
                        question: `Overwrite ${portable}?`,
                    });
                }
            }
        }
    }
    for (const [key, envName, file, marker, questionZh, questionEn] of [
        ['agents', 'BROWN_OVERRIDE_AGENTS', 'AGENTS.md', '<!-- openspec-superpowers-opencode_instructions -->', '替换 AGENTS.md 托管区块？', 'Replace managed AGENTS.md section?'],
        ['gitignore', 'BROWN_OVERRIDE_GITIGNORE', '.gitignore', '# <!-- openspec-superpowers-opencode_gitignore -->', '替换 .gitignore 托管区块？', 'Replace managed .gitignore section?'],
        ['gitattr', 'BROWN_OVERRIDE_GITATTR', '.gitattributes', '# <!-- openspec-superpowers-opencode_gitattributes -->', '替换 .gitattributes 托管区块？', 'Replace managed .gitattributes section?'],
        ['editorconfig', 'BROWN_OVERRIDE_EDITORCONFIG', '.editorconfig', '# <!-- openspec-superpowers-opencode_editorconfig -->', '替换 .editorconfig 托管区块？', 'Replace managed .editorconfig section?'],
    ] as const) {
        if (hasCompleteMarker(path.join(targetDir, file), marker)) {
            decisions[key] = await tDecide(envName, questionZh, questionEn);
        }
    }
    return {
        cancelled: false,
        decisions,
    };
}

function tFn(lang?: string | undefined): (zh: string, en: string) => string {
    return (zh, en) => (lang === 'zh-CN' || lang === 'zh-TW') ? zh : en;
}

export interface ProjectResult {
    success: boolean;
    cancelled?: boolean;
    plan?: InitPlan;
    manifest?: Manifest;
    verification?: { passed: boolean; changeName: string; error?: unknown };
    lockVerification?: LockVerification;
}

async function dryRunProject(options: SetupOptions = {}): Promise<InitPlan | { mode: 'dry-run'; cancelled: boolean; operations: never[] }> {
    const runner = options.runner || createProcessRunner();
    const context = createContext({ ...options, mode: 'dry-run' });
    const p = options.progress || (() => {});
    const t = tFn(options.lang);
    const isBrown = context.projectKind === 'brownfield';

    p({ type: 'banner', text: `openspec-superpowers-opencode ${t('安装配置（干跑）', 'Setup (Dry-Run)')}` });
    p({ type: 'blank' });

    // ---- 0/8: 前提条件 ----
    p({ type: 'step', n: 0, total: 8, label: t('检查前提条件', 'Checking prerequisites') });
    const prerequisiteCwd = existingCommandCwd(context.targetDir);
    const openspec = requireCommand(runner.run('openspec', ['--version'], { cwd: prerequisiteCwd }), 'openspec-prerequisite');
    p({ type: 'pass', item: 'openspec CLI', detail: openspec.stdout.trim() });
    const opencode = requireCommand(runner.run('opencode', ['--version'], { cwd: prerequisiteCwd }), 'opencode-prerequisite');
    p({ type: 'pass', item: 'opencode CLI', detail: opencode.stdout.trim() });
    const gitVer = requireCommand(runner.run('git', ['--version'], { cwd: prerequisiteCwd }), 'git-prerequisite');
    p({ type: 'pass', item: 'git', detail: gitVer.stdout.trim() });

    p({ type: 'blank' });

    // ---- 垫片自检（BUG004）：dry-run 只报告，不修改全局 bin ----
    const shimStatus = checkShim(options.shimDeps ?? {});
    if (shimStatus.active) {
        p({ type: 'pass', item: t('openspec 垫片已生效', 'openspec shim active') });
    } else {
        p({
            type: 'warn',
            item: t(
                `openspec 垫片未生效（${shimStatus.reason}）；正式 init 会自动安装，dry-run 不修改全局 bin`,
                `openspec shim inactive (${shimStatus.reason}); real init will auto-install, dry-run does not touch global bin`,
            ),
        });
    }
    p({ type: 'blank' });

    // ---- 1/8: 检测 Superpowers ----
    p({ type: 'step', n: 1, total: 8, label: t('检测 Superpowers 安装路径', 'Detecting Superpowers installation path') });
    const superpowers = resolveSuperpowers(options);
    p({ type: 'pass', item: t('Superpowers 路径', 'Superpowers path'), detail: superpowers.skillsPath.replace(/\\/g, '/') });

    // ---- Skill lock 部署 + 逐技能校验 ----
    const lockMajor = parseMajorVersion(superpowers.version);
    const lockFile = selectLockFile(context.templateDir, lockMajor);
    let lockVerification: LockVerification = { allMatch: true, warnings: [] };

    if (!lockFile) {
        reportUnsupportedLock(context.templateDir, lockMajor, t, p);
    } else {
        if (lockMajor) {
            p({ type: 'info', text: `- ${t('检测到 Superpowers v' + lockMajor + '，使用对应锁文件', 'Detected Superpowers v' + lockMajor + ', using matching lock')}` });
        }

        p({ type: 'pass', item: `${t('已部署', 'Deployed')} skills.lock.json` });

        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as SkillLockData;
        const skillsDir = superpowers.skillsPath;
        let allMatch = true;
        const lockVerificationWarnings: string[] = [];
        for (const [relativePath, entry] of Object.entries((lockData && lockData.skills) || {})) {
            const skillPath = path.join(skillsDir, ...relativePath.replace(/\\/g, '/').split('/'));
            if (!fs.existsSync(skillPath)) {
                p({ type: 'warn', item: relativePath, detail: t('文件不存在', 'file not found') });
                lockVerificationWarnings.push(`${relativePath}: file not found`);
                allMatch = false;
                continue;
            }
            const actual = crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex').toLowerCase();
            const expected = String(entry.sha256 || '').toLowerCase();
            if (actual !== expected) {
                p({ type: 'warn', item: relativePath, detail: t('hash 不匹配，可能已更新', 'hash mismatch, may have been updated') });
                lockVerificationWarnings.push(`${relativePath}: hash mismatch`);
                allMatch = false;
            } else {
                p({ type: 'pass', item: relativePath });
            }
        }
        lockVerification = { allMatch, warnings: lockVerificationWarnings };
        if (allMatch) {
            p({ type: 'milestone', text: t('Skill 完整性校验通过', 'Skill integrity check passed') });
        } else {
            p({ type: 'warn', item: t('Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）', 'Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)') });
        }
    }

    p({ type: 'blank' });

    // ---- 2/8: openspec/ 部署状态 ----
    p({ type: 'step', n: 2, total: 8, label: t('检测 openspec/ 部署状态', 'Checking openspec/ deployment state') });
    if (isBrown) {
        p({ type: 'info', text: `- openspec/ ${t('已存在（棕地项目）', 'already exists (brownfield)')}` });
    } else {
        p({ type: 'info', text: `- openspec/ ${t('不存在（绿地模式，自动部署）', 'not found (greenfield, auto-deploy)')}` });
    }

    p({ type: 'blank' });

    const brownfield = await collectBrownfieldDecisions({ ...options, context });
    if (brownfield.cancelled) {
        p({ type: 'dry-run-cancel' });
        return { mode: 'dry-run', cancelled: true, operations: [] };
    }

    // ---- 生成计划 ----
    const plan = createInitPlan({
        ...context,
        lang: options.lang || 'en',
        lockFile,
        superpowersPath: superpowers.skillsPath,
        decisions: { ...brownfield.decisions, ...(options.decisions || {}) },
    }) as InitPlan & { lockVerification?: LockVerification };
    plan.lockVerification = lockVerification;

    // ---- 3/8: 部署 openspec/ ----
    p({ type: 'step', n: 3, total: 8, label: t('部署 openspec/ 配置', 'Deploying openspec/ config') });
    for (const op of plan.operations) {
        if (op.type === 'preserve' && op.decision === 'skip') continue;
        const rel = op.target ? path.relative(context.targetDir, op.target).replace(/\\/g, '/') : null;
        if (!rel) continue;
        if (!rel.startsWith('openspec/')) continue;
        if (rel === 'skills.lock.json') continue;
        const icon = op.type === 'preserve' ? t('跳过', 'skip') : op.type;
        p({ type: 'action', text: `${icon}: ${rel}` });
    }

    p({ type: 'blank' });

    // ---- 4/8: 部署 .opencode/ ----
    p({ type: 'step', n: 4, total: 8, label: t('部署 .opencode/ 配置', 'Deploying .opencode/ config') });
    for (const op of plan.operations) {
        if (op.type === 'preserve' && op.decision === 'skip') continue;
        const rel = op.target ? path.relative(context.targetDir, op.target).replace(/\\/g, '/') : null;
        if (!rel) continue;
        if (!rel.startsWith('.opencode/')) continue;
        const icon = op.type === 'preserve' ? t('跳过', 'skip') : op.type;
        p({ type: 'action', text: `${icon}: ${rel}` });
    }

    p({ type: 'blank' });

    // ---- 5/8: Git 配置 + AGENTS.md ----
    p({ type: 'step', n: 5, total: 8, label: t('部署 Git 配置 + AGENTS.md', 'Deploying git config + AGENTS.md') });
    const rootFiles = ['AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig'];
    for (const rf of rootFiles) {
        p({ type: 'action', text: `write: ${rf}` });
    }
    p({ type: 'milestone', text: t('文件复制完成', 'Deploy complete') });

    p({ type: 'blank' });

    // ---- 6/8: 占位符替换 ----
    p({ type: 'step', n: 6, total: 8, label: t('替换路径占位符', 'Replacing path placeholders') });
    for (const relative of PLACEHOLDER_TARGETS) {
        const op = plan.operations.find(candidate => candidate.target
            && path.relative(context.targetDir, candidate.target).replace(/\\/g, '/') === relative);
        const planWrites = op !== undefined && (op.type === 'write' || op.type === 'copy');
        const diskTarget = path.join(context.targetDir, ...relative.split('/'));
        let content: string | null = null;
        if (planWrites) {
            content = op.content ?? (op.source ? fs.readFileSync(op.source, 'utf8') : '');
        } else if (fs.existsSync(diskTarget)) {
            content = fs.readFileSync(diskTarget, 'utf8');
        }
        if (content === null) {
            p({ type: 'info', text: `${relative} ${op ? '(not written)' : '(not in plan)'}` });
            continue;
        }
        if (content.includes('{{SUPERPOWERS_BASE_PATH}}')) {
            p({ type: 'fail', item: `${relative} (unreplaced placeholder)` });
        } else {
            p({ type: 'action', text: `placeholder-free: ${relative}` });
        }
    }
    p({ type: 'milestone', text: t('占位符替换完成', 'Placeholder replacement complete') });

    p({ type: 'blank' });

    // ---- 7/8: Schema 验证 ----
    p({ type: 'step', n: 7, total: 8, label: t('验证 schema', 'Validating schema') });
    p({ type: 'action', text: '[DRY-RUN] openspec schema validate superpowers-bridge-opencode' });

    p({ type: 'blank' });

    // ---- 8/8: 验证工作流 + 写入安装清单 ----
    p({ type: 'step', n: 8, total: 8, label: t('验证工作流 + 写入安装清单', 'Validating workflow + writing manifest') });
    p({ type: 'action', text: '[DRY-RUN] Skipping validation (--dry-run mode)' });

    p({ type: 'blank' });
    p({ type: 'banner', text: t('干跑完成', 'Dry-Run Complete') });
    p({ type: 'blank' });
    p({ type: 'action', text: `${t('跳过的操作:', 'Skipped operations:')}` });
    p({ type: 'action', text: `- ${t('写入安装清单 .opencode/install-manifest.json', 'Write install manifest .opencode/install-manifest.json')}` });
    p({ type: 'action', text: `- ${t('所有文件复制操作', 'All copy operations')}` });
    p({ type: 'action', text: '- openspec schema validate' });
    p({ type: 'action', text: `- ${t('OpenSpec 工作流验证', 'OpenSpec workflow validation')}` });
    p({ type: 'blank' });
    p({ type: 'info', text: t('重置： openspec-superpowers-opencode reset', 'Reset: openspec-superpowers-opencode reset') });
    p({ type: 'info', text: t('预览： openspec-superpowers-opencode dry-run', 'Preview: openspec-superpowers-opencode dry-run') });

    return plan;
}

async function initProject(options: SetupOptions = {}): Promise<ProjectResult> {
    const runner = options.runner || createProcessRunner();
    const context = createContext({ ...options, mode: 'init' });
    const p = options.progress || (() => {});
    const t = tFn(options.lang);

    // ---- 0. Git dirty check ----
    if (context.targetExists && fs.existsSync(path.join(context.targetDir, '.git'))) {
        const status = requireCommand(runner.run('git', ['status', '--porcelain'], { cwd: context.targetDir }), 'git-status');
        if (status.stdout.trim()) throw new Error('Working directory has uncommitted changes');
    }

    // ---- 目录创建 ----
    if (!context.targetExists && options.targetDir) {
        p({ type: 'dir-created', target: context.targetDir });
    }

    // ---- Setup 横幅 ----
    p({ type: 'section', label: t('安装配置', 'Setup') });
    p({ type: 'info', text: t('→ 设置中...', '→ Setting up...') });
    p({ type: 'banner', text: `openspec-superpowers-opencode ${t('安装配置', 'Setup')}` });
    p({ type: 'blank' });

    // ---- 0/8: 前提条件 ----
    p({ type: 'step', n: 0, total: 8, label: t('检查前提条件', 'Checking prerequisites') });
    const prerequisiteCwd = existingCommandCwd(context.targetDir);
    const openspec = requireCommand(runner.run('openspec', ['--version'], { cwd: prerequisiteCwd }), 'openspec-prerequisite');
    p({ type: 'pass', item: 'openspec CLI', detail: openspec.stdout.trim() });
    const opencode = requireCommand(runner.run('opencode', ['--version'], { cwd: prerequisiteCwd }), 'opencode-prerequisite');
    p({ type: 'pass', item: 'opencode CLI', detail: opencode.stdout.trim() });
    const gitVer = requireCommand(runner.run('git', ['--version'], { cwd: prerequisiteCwd }), 'git-prerequisite');
    p({ type: 'pass', item: 'git', detail: gitVer.stdout.trim() });
    const superpowers = resolveSuperpowers(options);
    p({ type: 'pass', item: 'Superpowers installed' });

    p({ type: 'blank' });

    // ---- 垫片自检（BUG004）：0/8 之后确认 openspec 已是垫片且 openspec-orig 存在 ----
    // 垫片是全局状态，不属于本次 init 写入目标目录的内容，因此失败即中止而不是回滚。
    const shimToolDir = options.toolRoot ?? resolveToolRoot();
    const shimResult = ensureShim(shimToolDir, options.shimDeps ?? {});
    if (!shimResult.ok) {
        throw new Error(
            `${t('openspec 垫片未生效且自动安装失败', 'openspec shim is inactive and auto-install failed')}: `
            + `${shimResult.details.join('; ')}\n`
            + t('请运行 `oso install-shims`（Windows 需管理员权限）', 'Run `oso install-shims` (administrator required on Windows)'),
        );
    }
    if (shimResult.repaired) {
        p({ type: 'pass', item: t('已自动安装垫片', 'openspec shim installed automatically') });
    } else {
        p({ type: 'pass', item: t('openspec 垫片已生效', 'openspec shim active') });
    }
    p({ type: 'blank' });

    // ---- 1/8: 检测 Superpowers 路径 ----
    p({ type: 'step', n: 1, total: 8, label: t('检测 Superpowers 安装路径', 'Detecting Superpowers installation path') });
    p({ type: 'milestone', text: `${t('Superpowers 路径', 'Superpowers path')}: ${superpowers.skillsPath.replace(/\\/g, '/')}` });

    // ---- Skill lock 部署 + 逐技能校验 ----
    const lockMajor = parseMajorVersion(superpowers.version);
    const lockFile = selectLockFile(context.templateDir, lockMajor);
    let lockVerification: LockVerification = { allMatch: true, warnings: [] };

    if (!lockFile) {
        reportUnsupportedLock(context.templateDir, lockMajor, t, p);
    } else {
        if (lockMajor) {
            p({ type: 'info', text: `- ${t('检测到 Superpowers v' + lockMajor + '，使用对应锁文件', 'Detected Superpowers v' + lockMajor + ', using matching lock')}` });
        }

        const lockTarget = path.join(context.targetDir, 'skills.lock.json');
        fs.mkdirSync(path.dirname(lockTarget), { recursive: true });
        fs.copyFileSync(lockFile, lockTarget);
        p({ type: 'pass', item: `${t('已部署', 'Deployed')} skills.lock.json` });

        const lockVerificationWarnings: string[] = [];
        const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as SkillLockData;
        const skillsDir = superpowers.skillsPath;
        let allMatch = true;
        for (const [relativePath, entry] of Object.entries((lockData && lockData.skills) || {})) {
            const skillPath = path.join(skillsDir, ...relativePath.replace(/\\/g, '/').split('/'));
            if (!fs.existsSync(skillPath)) {
                const msg = `${relativePath}: file not found`;
                p({ type: 'warn', item: relativePath, detail: t('文件不存在', 'file not found') });
                lockVerificationWarnings.push(msg);
                allMatch = false;
                continue;
            }
            const actual = crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex').toLowerCase();
            const expected = String(entry.sha256 || '').toLowerCase();
            if (actual !== expected) {
                const msg = `${relativePath}: hash mismatch`;
                p({ type: 'warn', item: relativePath, detail: t('hash 不匹配，可能已更新', 'hash mismatch, may have been updated') });
                lockVerificationWarnings.push(msg);
                allMatch = false;
            } else {
                p({ type: 'pass', item: relativePath });
            }
        }
        lockVerification = { allMatch, warnings: lockVerificationWarnings };
        if (allMatch) {
            p({ type: 'milestone', text: t('Skill 完整性校验通过', 'Skill integrity check passed') });
        } else {
            p({ type: 'warn', item: t('Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）', 'Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)') });
        }
    }

    p({ type: 'blank' });

    // ---- 2/8: openspec/ 部署状态 ----
    p({ type: 'step', n: 2, total: 8, label: t('检测 openspec/ 部署状态', 'Checking openspec/ deployment state') });
    const isBrown = context.projectKind === 'brownfield';
    if (isBrown) {
        p({ type: 'info', text: t('- 目标目录已有内容（棕地项目）', '- Target directory has content (brownfield)') });
    } else {
        p({ type: 'info', text: t('- 目标目录为空（绿地模式，自动部署）', '- Target directory empty (greenfield, auto-deploy)') });
        p({ type: 'blank' });
    }

    // ---- 部署计划：棕地与绿地统一走 createInitPlan + executeOperations ----
    // 棕地不再走「内联询问 + 四个直接写盘函数」：那条路径导致受管根文件被整文件覆盖、
    // 占位符未渲染、openspec/ 不存在仍询问、首次使用不部署 commands
    // （BUG001 / BUG002 / BUG003 / BUG006）。
    let plan: InitPlan;

    if (isBrown) {
        const brownfield = await collectBrownfieldDecisions({ ...options, context });
        if (brownfield.cancelled) {
            p({ type: 'info', text: t('  Init 取消。', '  Init cancelled.') });
            return { success: true, cancelled: true };
        }
        p({ type: 'blank' });

        plan = createInitPlan({
            ...context,
            lang: options.lang || 'en',
            lockFile,
            superpowersPath: superpowers.skillsPath,
            decisions: { ...brownfield.decisions, ...(options.decisions || {}) },
        });
    } else {
        plan = createInitPlan({
            ...context,
            lang: options.lang || 'en',
            lockFile,
            superpowersPath: superpowers.skillsPath,
            decisions: { ...(options.decisions || {}) },
        });
    }

    executeOperations(plan.operations, { projectRoot: context.targetDir });

    const ROOT_FILE_SET = new Set(['AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig']);
    const reportOperations = (
        step: number,
        labelZh: string,
        labelEn: string,
        predicate: (rel: string) => boolean,
    ): void => {
        p({ type: 'step', n: step, total: 8, label: t(labelZh, labelEn) });
        for (const op of plan.operations) {
            if (!op.target) continue;
            const rel = path.relative(context.targetDir, op.target).replace(/\\/g, '/');
            if (!predicate(rel)) continue;
            if (op.type === 'preserve' && op.decision === 'skip') {
                p({ type: 'info', text: `- ${rel} (skip)` });
                continue;
            }
            if (op.type === 'write' && op.changed) {
                p({ type: 'action', text: `${t('已更新：', 'Updated: ')}${rel}` });
                continue;
            }
            if (op.type === 'write' && op.decision === 'overwrite' && op.changed === false) continue;
            p({ type: 'pass', item: rel });
        }
        p({ type: 'blank' });
    };

    reportOperations(3, '部署 openspec/ 配置', 'Deploying openspec/ config',
        rel => rel.startsWith('openspec/') && rel !== 'skills.lock.json');
    reportOperations(4, '部署 .opencode/ 配置', 'Deploying .opencode/ config',
        rel => rel.startsWith('.opencode/') && rel !== 'skills.lock.json');
    reportOperations(5, '部署 Git 配置 + AGENTS.md', 'Deploying git config + AGENTS.md',
        rel => ROOT_FILE_SET.has(rel));
    p({ type: 'milestone', text: t('文件复制完成', 'Deploy complete') });

    p({ type: 'blank' });

    // ---- 6/8: 占位符替换（校验落盘文件，不看模板源） ----
    p({ type: 'step', n: 6, total: 8, label: t('替换路径占位符', 'Replacing path placeholders') });
    const placeholderTargets = PLACEHOLDER_TARGETS.filter(relative => {
        const target = path.join(context.targetDir, ...relative.split('/'));
        if (fs.existsSync(target)) return true;
        return plan.operations.some(operation => (
            operation.type === 'write'
            && operation.target !== undefined
            && path.relative(context.targetDir, operation.target).replace(/\\/g, '/') === relative
        ));
    });
    verifyNoPlaceholders(context.targetDir, placeholderTargets);
    for (const relative of placeholderTargets) p({ type: 'pass', item: relative });
    p({ type: 'milestone', text: t('占位符替换完成', 'Placeholder replacement complete') });

    p({ type: 'blank' });

    // ---- 7/8: Schema 验证 ----
    p({ type: 'step', n: 7, total: 8, label: t('验证 schema', 'Validating schema') });
    const schemaRun = runner.run('openspec', ['schema', 'validate', 'superpowers-bridge-opencode'], { cwd: context.targetDir });
    requireCommand(schemaRun, 'schema-validation');
    p({ type: 'pass', item: t("Schema '{schema}' 有效", "Schema 'superpowers-bridge-opencode' is valid") });
    p({ type: 'milestone', text: t('Schema 验证通过', 'Schema validation passed') });

    p({ type: 'blank' });

    // ---- 注册表创建 ----
    const registryPath = path.join(context.targetDir, 'openspec', 'oso-change-registry.json');
    let overwriteRegistry = true;
    if (fs.existsSync(registryPath)) {
        const regResult = await resolveDecision({
            override: (options.env || process.env).BROWN_OVERRIDE_REGISTRY,
            prompt: options.prompt,
            question: t('oso-change-registry.json 已存在，是否覆写？(y/N):', 'oso-change-registry.json exists. Overwrite? (y/N):'),
        });
        overwriteRegistry = regResult === 'yes';
    }
    const registryPriorBytes = fs.existsSync(registryPath) ? fs.readFileSync(registryPath) : null;
    createRegistry(context.targetDir, p, overwriteRegistry);

    p({ type: 'blank' });

    // ---- 8/8: 验证工作流 + 写入安装清单 ----
    p({ type: 'step', n: 8, total: 8, label: t('验证工作流 + 写入安装清单', 'Validating workflow + writing manifest') });

    if (lockMajor !== null && Number(lockMajor) >= 6) {
        const bash = (options.detectBash ?? detectBash)(process.platform === 'win32');
        if (bash.available) {
            p({ type: 'pass', item: 'bash', detail: bash.path ?? '' });
        } else {
            p({
                type: 'warn',
                item: t(
                    '未找到 bash：Superpowers SDD 的脚本需要 bash（Windows 请安装 Git for Windows 或 WSL），其他功能不受影响',
                    'bash not found: Superpowers SDD scripts need bash (install Git for Windows or WSL on Windows); other features are unaffected',
                ),
            });
        }
    }

    const manifest = buildManifest({
        projectRoot: context.targetDir,
        operations: plan.operations,
        language: options.lang || 'en',
        opencodeVersion: opencode.stdout.trim(),
        superpowersPath: superpowers.skillsPath,
        verification: 'pending',
    });
    writeManifest(context.targetDir, manifest);

    const verification = await verifyProject({ targetDir: context.targetDir, runner, progress: p });
    manifest.verification = verification.passed ? 'passed' : 'failed';
    writeManifest(context.targetDir, manifest);
    if (!verification.passed) {
        if (registryPriorBytes === null) {
            fs.rmSync(registryPath, { force: true });
        } else {
            fs.writeFileSync(registryPath, registryPriorBytes);
        }
        p({ type: 'fail', item: t('验证失败', 'Verification failed') });
        return { success: false, plan, manifest, verification, lockVerification };
    }

    // ---- 安装清单摘要 ----
    p({ type: 'blank' });
    p({ type: 'milestone', text: `${t('安装清单已写入', 'Install manifest written')}: .opencode/install-manifest.json` });
    p({ type: 'info', text: `  ${manifest.files.length} ${t('个文件已记录', 'files recorded')}` });
    const overwriteCount = Object.keys(manifest.overwriteDecisions || {}).length;
    if (overwriteCount > 0) {
        p({ type: 'info', text: `  ${overwriteCount} ${t('项覆盖决策已记录', 'overwrite decisions recorded')}` });
    }

    // ---- Git 初始化和提交 ----
    p({ type: 'blank' });
    p({ type: 'section', label: t('Git 初始化和提交', 'Git Init & Commit') });
    commitProject(context.targetDir, runner, p, t);

    // ---- 部署后验证（GAP002）：命令齐全 + CLI 入口可加载；失败只报错，不回滚 ----
    p({ type: 'section', label: t('部署后验证', 'Post-deploy verification') });
    const postVerifyMissing = await verifyDeploymentPostInit(options.toolRoot ?? resolveToolRoot(), context);
    if (postVerifyMissing.length > 0) {
        for (const item of postVerifyMissing) p({ type: 'fail', item });
        p({
            type: 'fail',
            item: t(
                `部署后验证失败：${postVerifyMissing.length} 项缺失`,
                `Post-deploy verification failed: ${postVerifyMissing.length} missing item(s)`,
            ),
        });
        return { success: false, plan, manifest, verification, lockVerification };
    }
    p({ type: 'pass', item: t('模板命令均已部署', 'All template commands deployed') });
    p({ type: 'pass', item: 'dist/cli/index.js' });
    p({ type: 'milestone', text: t('部署后验证通过', 'Post-deploy verification passed') });

    p({ type: 'blank' });

    p({ type: 'banner-init' });
    p({ type: 'blank' });
    p({ type: 'info', text: t('下一步：', 'Next steps:') });
    p({ type: 'info', text: t('  0. 快速开始指南在安装目录 docs/QUICKSTART.md', '  0. Quick start guide at docs/QUICKSTART.md in installation directory') });
    p({ type: 'info', text: t('  1. /opsx-ff <功能名>, /opsx-new, /opsx-propose 创建第一个变更', '  1. /opsx-ff <feature-name>, /opsx-new, /opsx-propose to create your first change') });
    p({ type: 'info', text: t('  2. /opsx-onboard 进行引导式入门', '  2. /opsx-onboard for guided onboarding') });
    p({ type: 'blank' });

    return { success: true, plan, manifest, verification, lockVerification };
}

export {
    dryRunProject,
    initProject,
    resetProject,
    verifyDeploymentPostInit,
};
