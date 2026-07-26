const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createContext } = require('./context');
const { executeOperations } = require('./deploy');
const { findSuperpowersSkills, parseMajorVersion, selectLockFile, verifySkillLock } = require('./discovery');
const { buildManifest } = require('./manifest');
const { createInitPlan } = require('./planner');
const { createProcessRunner } = require('./process-runner');
const { resolveDecision } = require('./prompt');
const { verifyProject } = require('./verify');

function requireCommand(result, phase) {
    if (!result || result.code !== 0) {
        const error = new Error(`${phase} failed${result && result.stderr ? `: ${result.stderr.trim()}` : ''}`);
        error.phase = phase;
        throw error;
    }
    return result;
}

function existingCommandCwd(targetDir) {
    let candidate = path.resolve(targetDir);
    while (!fs.existsSync(candidate)) {
        const parent = path.dirname(candidate);
        if (parent === candidate) return process.cwd();
        candidate = parent;
    }
    return candidate;
}

function hasCompleteMarker(file, marker) {
    return fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(marker).length - 1 === 2;
}

function resolveSuperpowers(options) {
    const skillsPath = options.superpowersPath || findSuperpowersSkills(
        path.join(os.homedir(), '.cache', 'opencode', 'packages'),
    );
    if (!skillsPath) throw new Error('Superpowers skills directory was not found');

    let version = options.superpowersVersion || null;
    const packageFile = path.join(path.dirname(skillsPath), 'package.json');
    if (!version && fs.existsSync(packageFile)) {
        version = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
    }
    return { skillsPath, version };
}

function writeManifest(projectRoot, manifest) {
    executeOperations([{
        type: 'write',
        target: path.join(projectRoot, '.opencode', 'install-manifest.json'),
        content: `${JSON.stringify(manifest, null, 2)}\n`,
    }], { projectRoot });
}

function createRegistry(projectRoot, progress, overwrite = true) {
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

function commitProject(targetDir, runner, progress, tFn) {
    const p = progress || (() => {});
    const loc = tFn || ((zh, en) => en);
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

async function collectBrownfieldDecisions(options) {
    if (options.context.projectKind !== 'brownfield') return { cancelled: false, decisions: {} };
    const env = options.env || process.env;
    const prompt = options.prompt;
    const p = options.progress || (() => {});
    const t = tFn(options.lang);

    const decide = (envName, question, allowAsk = false) => resolveDecision({
        override: env[envName],
        prompt,
        question,
        allowAsk,
    });
    const tDecide = async (envName, questionZh, questionEn, allowAsk = false) => {
        return await decide(envName, t(questionZh, questionEn), allowAsk);
    };

    const proceed = await tDecide('BROWN_OVERRIDE_INIT', '是否继续完整初始化棕地项目？', 'Brownfield project. Continue with full init?');
    if (proceed !== 'yes') return { cancelled: true, decisions: {} };
    p({ type: 'pass', item: t('用户确认', 'User confirmed') + ' openspec/' });
    const targetDir = options.context.targetDir;
    const hasEntries = directory => fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
    const listRelativeFiles = (root, relative = '') => {
        if (!fs.existsSync(root)) return [];
        const files = [];
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const child = path.join(relative, entry.name);
            if (entry.isDirectory()) files.push(...listRelativeFiles(root, child));
            else if (entry.isFile()) files.push(child);
        }
        return files.sort();
    };
    const decisions = {
        openspec: await tDecide('BROWN_OVERRIDE_OPENSPEC', '覆盖 openspec/ 配置和 schema？', 'Overwrite OpenSpec config and schemas?'),
    };
    if (fs.existsSync(path.join(targetDir, '.opencode', 'opencode.json'))) {
        decisions.opencodeJson = await tDecide('BROWN_OVERRIDE_OCODEJSON', '合并 .opencode/opencode.json？', 'Merge .opencode/opencode.json?');
    }
    if (hasEntries(path.join(targetDir, '.opencode', 'commands'))) {
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
    if (hasEntries(path.join(targetDir, '.opencode', 'skills'))) {
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
    ]) {
        if (hasCompleteMarker(path.join(targetDir, file), marker)) {
            decisions[key] = await tDecide(envName, questionZh, questionEn);
        }
    }
    return {
        cancelled: false,
        decisions,
    };
}

function tFn(lang) {
    return (zh, en) => (lang === 'zh-CN' || lang === 'zh-TW') ? zh : en;
}

async function dryRunProject(options = {}) {
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

    // ---- 1/8: 检测 Superpowers ----
    p({ type: 'step', n: 1, total: 8, label: t('检测 Superpowers 安装路径', 'Detecting Superpowers installation path') });
    const superpowers = resolveSuperpowers(options);
    p({ type: 'pass', item: t('Superpowers 路径', 'Superpowers path'), detail: superpowers.skillsPath.replace(/\\/g, '/') });

    // ---- Skill lock 部署 + 逐技能校验 ----
    const lockFile = selectLockFile(context.templateDir, parseMajorVersion(superpowers.version));
    if (!lockFile) throw new Error('No skills lock file was found in the template');

    const lockMajor = parseMajorVersion(superpowers.version);
    if (lockMajor) {
        p({ type: 'info', text: `- ${t('检测到 Superpowers v' + lockMajor + '，使用对应锁文件', 'Detected Superpowers v' + lockMajor + ', using matching lock')}` });
    }

    p({ type: 'pass', item: `${t('已部署', 'Deployed')} skills.lock.json` });

    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const skillsDir = superpowers.skillsPath;
    let allMatch = true;
    const lockVerificationWarnings = [];
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
    const lockVerification = { allMatch, warnings: lockVerificationWarnings };
    if (allMatch) {
        p({ type: 'milestone', text: t('Skill 完整性校验通过', 'Skill integrity check passed') });
    } else {
        p({ type: 'warn', item: t('Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）', 'Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)') });
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
    });
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
    const placeholderCandidates = [
        ['_AGENTS.md', 'AGENTS.md'],
        ['openspec/schemas/superpowers-bridge-opencode/schema.yaml', null],
        ['.opencode/commands/opsx-apply.md', null],
        ['.opencode/commands/opsx-finish.md', null],
    ];
    for (const [src, dst] of placeholderCandidates) {
        const sourcePath = path.join(context.templateDir, ...src.split('/'));
        const targetRel = dst || src;
        if (fs.existsSync(sourcePath) && fs.readFileSync(sourcePath, 'utf8').includes('{{SUPERPOWERS_BASE_PATH}}')) {
            p({ type: 'action', text: `replace placeholders in: ${targetRel}` });
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

async function initProject(options = {}) {
    const runner = options.runner || createProcessRunner();
    const context = createContext({ ...options, mode: 'init' });
    const p = options.progress || (() => {});
    const t = tFn(options.lang);
    const env = options.env || process.env;
    const decide = (envName, question, allowAsk = false) => resolveDecision({
        override: env[envName],
        prompt: options.prompt,
        question,
        allowAsk,
    });
    const tDecide = (envName, questionZh, questionEn, allowAsk = false) => {
        return decide(envName, t(questionZh, questionEn), allowAsk);
    };
    const listRelativeFiles = (root, relative = '') => {
        if (!fs.existsSync(root)) return [];
        const files = [];
        for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
            const child = path.join(relative, entry.name);
            if (entry.isDirectory()) files.push(...listRelativeFiles(root, child));
            else if (entry.isFile()) files.push(child);
        }
        return files.sort();
    };

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

    // ---- 1/8: 检测 Superpowers 路径 ----
    p({ type: 'step', n: 1, total: 8, label: t('检测 Superpowers 安装路径', 'Detecting Superpowers installation path') });
    p({ type: 'milestone', text: `${t('Superpowers 路径', 'Superpowers path')}: ${superpowers.skillsPath.replace(/\\/g, '/')}` });

    // ---- Skill lock 部署 + 逐技能校验 ----
    const lockFile = selectLockFile(context.templateDir, parseMajorVersion(superpowers.version));
    if (!lockFile) throw new Error('No skills lock file was found in the template');

    const lockMajor = parseMajorVersion(superpowers.version);
    if (lockMajor) {
        p({ type: 'info', text: `- ${t('检测到 Superpowers v' + lockMajor + '，使用对应锁文件', 'Detected Superpowers v' + lockMajor + ', using matching lock')}` });
    }

    const lockTarget = path.join(context.targetDir, 'skills.lock.json');
    fs.mkdirSync(path.dirname(lockTarget), { recursive: true });
    fs.copyFileSync(lockFile, lockTarget);
    p({ type: 'pass', item: `${t('已部署', 'Deployed')} skills.lock.json` });

    const lockVerificationWarnings = [];
    const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
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
    const lockVerification = { allMatch, warnings: lockVerificationWarnings };
    if (allMatch) {
        p({ type: 'milestone', text: t('Skill 完整性校验通过', 'Skill integrity check passed') });
    } else {
        p({ type: 'warn', item: t('Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）', 'Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)') });
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

    const decisions = {};
    let plan;

    function deployOpenspec(kind) {
        if (kind !== 'yes') return;
        const src = context.templateDir;
        const dst = context.targetDir;
        // config.yaml
        const configSrc = path.join(src, 'openspec', 'config.yaml');
        const configDst = path.join(dst, 'openspec', 'config.yaml');
        if (fs.existsSync(configSrc)) {
            fs.mkdirSync(path.dirname(configDst), { recursive: true });
            fs.copyFileSync(configSrc, configDst);
            p({ type: 'pass', item: 'openspec/config.yaml' });
        }
        // schemas/
        const schemasSrc = path.join(src, 'openspec', 'schemas');
        const schemasDst = path.join(dst, 'openspec', 'schemas');
        if (fs.existsSync(schemasSrc)) {
            fs.mkdirSync(schemasDst, { recursive: true });
            const langFilter = (name) => {
                if (name.includes('.zh-CN.')) return (options.lang || 'en') === 'zh-CN';
                if (name.includes('.zh-TW.')) return (options.lang || 'en') === 'zh-TW';
                return true;
            };
            copyRecursive(schemasSrc, schemasDst, langFilter);
            const fileCount = countFilesDeep(schemasDst);
            p({ type: 'pass', item: `openspec/schemas/ (${fileCount} files)` });
        }
    }

    function copyRecursive(src, dst, filterFn) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            fs.mkdirSync(dst, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                if (filterFn && !filterFn(entry.name)) continue;
                copyRecursive(path.join(src, entry.name), path.join(dst, entry.name), filterFn);
            }
        } else {
            fs.copyFileSync(src, dst);
        }
    }

    function countFilesDeep(dir) {
        let count = 0;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) count += countFilesDeep(path.join(dir, entry.name));
            else count++;
        }
        return count;
    }

    function deployOcodeJson() {
        if (decisions.opencodeJson === 'yes') {
            const src = path.join(context.templateDir, '.opencode', 'opencode.json');
            const dst = path.join(context.targetDir, '.opencode', 'opencode.json');
            if (fs.existsSync(src)) {
                const { mergeOcodeJson } = require('./merge');
                const merged = mergeOcodeJson(
                    JSON.parse(fs.readFileSync(dst, 'utf8')),
                    JSON.parse(fs.readFileSync(src, 'utf8')),
                );
                fs.writeFileSync(dst, `${JSON.stringify(merged, null, 2)}\n`);
                p({ type: 'pass', item: '.opencode/opencode.json (merged)' });
            }
        } else if (decisions.opencodeJson === 'no') {
            p({ type: 'info', text: '- .opencode/opencode.json (skipped)' });
        }
    }

    function deployOpencodeDir(relDir) {
        const srcDir = path.join(context.templateDir, '.opencode', relDir);
        const dstDir = path.join(context.targetDir, '.opencode', relDir);
        if (!fs.existsSync(srcDir)) return;
        fs.mkdirSync(dstDir, { recursive: true });
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
            const srcFile = path.join(srcDir, entry.name);
            const dstFile = path.join(dstDir, entry.name);
            const relName = `.opencode/${relDir}/${entry.name}`;
            if (entry.isDirectory()) continue;
            if (fs.existsSync(dstFile)) {
                const decKey = relDir === 'commands' ? decisions.commands : decisions.skills;
                const fileDecs = relDir === 'commands' ? decisions.commandFiles : decisions.skillFiles;
                if (decKey === 'ask') {
                    if (fileDecs && fileDecs[relName] === 'yes') {
                        fs.copyFileSync(srcFile, dstFile);
                        p({ type: 'pass', item: relName });
                    } else {
                        p({ type: 'info', text: `- ${relName} (skip)` });
                    }
                } else if (decKey === 'yes') {
                    fs.copyFileSync(srcFile, dstFile);
                    p({ type: 'pass', item: relName });
                } else {
                    p({ type: 'info', text: `- ${relName} (skip)` });
                }
            } else {
                fs.copyFileSync(srcFile, dstFile);
                p({ type: 'pass', item: relName });
            }
        }
    }

    function deployRootFile(key, file, marker) {
        const targetPath = path.join(context.targetDir, file);
        const SOURCE_MAP = { 'AGENTS.md': '_AGENTS.md', '.gitignore': '_gitignore', '.gitattributes': '_gitattributes', '.editorconfig': '_editorconfig' };
        const sourceName = SOURCE_MAP[file];
        if (!sourceName) return;
        const sourcePath = path.join(context.templateDir, sourceName);
        if (!fs.existsSync(sourcePath)) return;
        const managedContent = fs.readFileSync(sourcePath, 'utf8');
        if (isBrown && hasCompleteMarker(targetPath, marker)) {
            const d = (decisions || {})[key];
            if (d === 'yes') {
                const { mergeMarker } = require('./merge');
                const merged = mergeMarker({
                    existing: fs.readFileSync(targetPath, 'utf8'),
                    managed: managedContent,
                    marker,
                    decision: 'overwrite',
                });
                fs.writeFileSync(targetPath, merged.content);
                p({ type: 'pass', item: `${file} (managed section replaced)` });
            } else {
                p({ type: 'info', text: `- ${file} (user skipped)` });
            }
        } else if (!isBrown) {
            fs.copyFileSync(sourcePath, targetPath);
            p({ type: 'pass', item: file });
        } else {
            fs.writeFileSync(targetPath, managedContent);
            p({ type: 'pass', item: `${file} (bridge content appended)` });
        }
    }

    const codeDir = context.targetDir;

    if (isBrown) {
        const proceed = await tDecide('BROWN_OVERRIDE_INIT', '  棕地项目。是否继续完整初始化？(y/N):', '  Brownfield. Continue with full init? (y/N):');
        if (proceed !== 'yes') {
            p({ type: 'info', text: t('  Init 取消。', '  Init cancelled.') });
            return { success: true, cancelled: true };
        }
        p({ type: 'pass', item: t('用户确认', 'User confirmed') });
        p({ type: 'blank' });

        // ---- 3/8: 部署 openspec/ ----
        p({ type: 'step', n: 3, total: 8, label: t('部署 openspec/ 配置', 'Deploying openspec/ config') });
        decisions.openspec = await tDecide('BROWN_OVERRIDE_OPENSPEC', '  覆盖 openspec/ 配置和 schema？(y/N):', '  Overwrite OpenSpec config and schemas/? (y/N):');
        deployOpenspec(decisions.openspec);
        p({ type: 'info', text: t('- openspec/changes/ + openspec/specs/（棕地模式，跳过）', '- openspec/changes/ + openspec/specs/ (brownfield, skip)') });
        p({ type: 'blank' });

        // ---- 4/8: 部署 .opencode/ ----
        p({ type: 'step', n: 4, total: 8, label: t('部署 .opencode/ 配置', 'Deploying .opencode/ config') });
        if (fs.existsSync(path.join(codeDir, '.opencode', 'opencode.json'))) {
            decisions.opencodeJson = await tDecide('BROWN_OVERRIDE_OCODEJSON', '  合并预定义权限到 .opencode/opencode.json（条目和顺序以预定义权限为准，用户自定义条目保留在末尾）？(y/N):', '  Merge predefined permissions into .opencode/opencode.json (entries + order follow predefined, user entries kept at end)? (y/N):');
            deployOcodeJson();
        } else {
            const src = path.join(context.templateDir, '.opencode', 'opencode.json');
            if (fs.existsSync(src)) {
                const dst = path.join(codeDir, '.opencode', 'opencode.json');
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.copyFileSync(src, dst);
                p({ type: 'pass', item: '.opencode/opencode.json' });
            }
        }
        const hasFiles = dir => fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
        if (hasFiles(path.join(codeDir, '.opencode', 'commands'))) {
            decisions.commands = await tDecide('BROWN_OVERRIDE_COMMANDS', '  .opencode/commands/ 已存在。全部覆盖/跳过/逐个询问？(yes/No/ask):', '  .opencode/commands/ exists. Overwrite all/skip each/ask each? (yes/No/ask):', true);
            if (decisions.commands === 'ask') {
                decisions.commandFiles = {};
                const sourceRoot = path.join(context.templateDir, '.opencode', 'commands');
                for (const relative of listRelativeFiles(sourceRoot)) {
                    const portable = `.opencode/commands/${relative.replace(/\\/g, '/')}`;
                    if (fs.existsSync(path.join(codeDir, ...portable.split('/')))) {
                        decisions.commandFiles[portable] = await resolveDecision({
                            prompt: options.prompt,
                            question: `  Overwrite ${portable}? (y/N):`,
                        });
                    }
                }
            }
            deployOpencodeDir('commands');
        } else {
            for (const op of (plan ? plan.operations : [])) {
                if (op.target && path.relative(context.targetDir, op.target).replace(/\\/g, '/').startsWith('.opencode/commands/')) {
                    p({ type: 'pass', item: path.relative(context.targetDir, op.target).replace(/\\/g, '/') });
                }
            }
        }
        if (hasFiles(path.join(codeDir, '.opencode', 'skills'))) {
            decisions.skills = await tDecide('BROWN_OVERRIDE_SKILLS', '  .opencode/skills/ 已存在。全部覆盖/跳过/逐个询问？(yes/No/ask):', '  .opencode/skills/ exists. Overwrite all/skip each/ask each? (yes/No/ask):', true);
            if (decisions.skills === 'ask') {
                decisions.skillFiles = {};
                const sourceRoot = path.join(context.templateDir, '.opencode', 'skills');
                for (const relative of listRelativeFiles(sourceRoot)) {
                    const portable = `.opencode/skills/${relative.replace(/\\/g, '/')}`;
                    if (fs.existsSync(path.join(codeDir, ...portable.split('/')))) {
                        decisions.skillFiles[portable] = await resolveDecision({
                            prompt: options.prompt,
                            question: `Overwrite ${portable}?`,
                        });
                    }
                }
            }
            deployOpencodeDir('skills');
        } else {
            for (const op of (plan ? plan.operations : [])) {
                if (op.target && path.relative(context.targetDir, op.target).replace(/\\/g, '/').startsWith('.opencode/skills/')) {
                    p({ type: 'pass', item: path.relative(context.targetDir, op.target).replace(/\\/g, '/') });
                }
            }
        }
        p({ type: 'blank' });

        // ---- 5/8: Git 配置 + AGENTS.md ----
        p({ type: 'step', n: 5, total: 8, label: t('部署 Git 配置 + AGENTS.md', 'Deploying git config + AGENTS.md') });
        const rootKeys = [
            ['agents', 'AGENTS.md', '<!-- openspec-superpowers-opencode_instructions -->'],
            ['gitignore', '.gitignore', '# <!-- openspec-superpowers-opencode_gitignore -->'],
            ['gitattr', '.gitattributes', '# <!-- openspec-superpowers-opencode_gitattributes -->'],
            ['editorconfig', '.editorconfig', '# <!-- openspec-superpowers-opencode_editorconfig -->'],
        ];
        for (const [key, file, marker] of rootKeys) {
            if (hasCompleteMarker(path.join(context.targetDir, file), marker)) {
                decisions[key] = await tDecide('BROWN_OVERRIDE_' + key.toUpperCase(), `  替换 ${file} 托管区块？(y/N):`, `  Replace managed ${file} section? (y/N):`);
            }
            deployRootFile(key, file, marker);
        }
        plan = createInitPlan({
            ...context,
            lang: options.lang || 'en',
            lockFile,
            superpowersPath: superpowers.skillsPath,
            decisions: { ...decisions, ...(options.decisions || {}) },
        });
        p({ type: 'milestone', text: t('文件复制完成', 'Deploy complete') });
    } else {
        // Greenfield: create full plan and execute
        plan = createInitPlan({
            ...context,
            lang: options.lang || 'en',
            lockFile,
            superpowersPath: superpowers.skillsPath,
            decisions: { ...decisions, ...(options.decisions || {}) },
        });
        executeOperations(plan.operations, { projectRoot: context.targetDir });

        p({ type: 'step', n: 3, total: 8, label: t('部署 openspec/ 配置', 'Deploying openspec/ config') });
        {
            const cfgPath = path.join(context.targetDir, 'openspec', 'config.yaml');
            if (fs.existsSync(cfgPath)) p({ type: 'pass', item: 'openspec/config.yaml' });
            const schemasDir = path.join(context.targetDir, 'openspec', 'schemas');
            if (fs.existsSync(schemasDir)) {
                const n = countFilesDeep(schemasDir);
                p({ type: 'pass', item: `openspec/schemas/ (${n} files)` });
            }
        }
        p({ type: 'blank' });

        p({ type: 'step', n: 4, total: 8, label: t('部署 .opencode/ 配置', 'Deploying .opencode/ config') });
        for (const op of plan.operations) {
            if (!op.target) continue;
            const rel = path.relative(context.targetDir, op.target).replace(/\\/g, '/');
            if (rel.startsWith('.opencode/') && rel !== 'skills.lock.json') {
                if (op.type === 'preserve' && op.decision === 'skip') continue;
                p({ type: 'pass', item: rel });
            }
        }
        p({ type: 'blank' });

        p({ type: 'step', n: 5, total: 8, label: t('部署 Git 配置 + AGENTS.md', 'Deploying git config + AGENTS.md') });
        const gfRootFiles = ['AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig'];
        for (const rf of gfRootFiles) {
            const has = plan.operations.some(op => {
                if (!op.target) return false;
                return path.relative(context.targetDir, op.target).replace(/\\/g, '/') === rf && !(op.type === 'preserve' && op.decision === 'skip');
            });
            if (has) p({ type: 'pass', item: rf });
        }
        p({ type: 'milestone', text: t('文件复制完成', 'Deploy complete') });
    }

    p({ type: 'blank' });

    // ---- 6/8: 占位符替换 ----
    p({ type: 'step', n: 6, total: 8, label: t('替换路径占位符', 'Replacing path placeholders') });
    const placeholderCandidates = [
        ['_AGENTS.md', 'AGENTS.md'],
        ['openspec/schemas/superpowers-bridge-opencode/schema.yaml', null],
        ['.opencode/commands/opsx-apply.md', null],
        ['.opencode/commands/opsx-finish.md', null],
    ];
    for (const [src, dst] of placeholderCandidates) {
        const sourcePath = path.join(context.templateDir, ...src.split('/'));
        const targetRel = dst || src;
        if (!fs.existsSync(sourcePath)) continue;
        const content = fs.readFileSync(sourcePath, 'utf8');
        const targetPath = path.join(context.targetDir, ...targetRel.split('/'));
        if (!fs.existsSync(targetPath)) continue;
        if (content.includes('{{SUPERPOWERS_BASE_PATH}}')) {
            p({ type: 'pass', item: targetRel });
        } else {
            p({ type: 'info', text: t(`${targetRel}（无占位符）`, `${targetRel} (no placeholder)`) });
        }
    }
    p({ type: 'milestone', text: t('占位符替换完成', 'Placeholder replacement complete') });

    p({ type: 'blank' });

    // ---- 7/8: Schema 验证 ----
    p({ type: 'step', n: 7, total: 8, label: t('验证 schema', 'Validating schema') });
    const schemaRun = runner.run('openspec', ['schema', 'validate', 'superpowers-bridge-opencode'], { cwd: context.targetDir });
    requireCommand(schemaRun, 'schema-validation');
    p({ type: 'pass', item: t("Schema '{schema}' 有效", "Schema 'superpowers-bridge-opencode' is valid") });
    p({ type: 'milestone', text: t('Schema 验证通过', 'Schema validation passed') });

    p({ type: 'blank' });

    // ---- 8/8: 验证工作流 + 写入安装清单 ----
    p({ type: 'step', n: 8, total: 8, label: t('验证工作流 + 写入安装清单', 'Validating workflow + writing manifest') });

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

    // ---- 注册表创建 ----
    p({ type: 'blank' });
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
    createRegistry(context.targetDir, p, overwriteRegistry);

    // ---- Git 初始化和提交 ----
    p({ type: 'blank' });
    p({ type: 'section', label: t('Git 初始化和提交', 'Git Init & Commit') });
    commitProject(context.targetDir, runner, p, t);

    p({ type: 'banner-init' });
    p({ type: 'blank' });
    p({ type: 'info', text: t('下一步：', 'Next steps:') });
    p({ type: 'info', text: t('  0. 快速开始指南在安装目录 docs/QUICKSTART.md', '  0. Quick start guide at docs/QUICKSTART.md in installation directory') });
    p({ type: 'info', text: t('  1. /opsx-ff <功能名>, /opsx-new, /opsx-propose 创建第一个变更', '  1. /opsx-ff <feature-name>, /opsx-new, /opsx-propose to create your first change') });
    p({ type: 'info', text: t('  2. /opsx-onboard 进行引导式入门', '  2. /opsx-onboard for guided onboarding') });
    p({ type: 'blank' });

    return { success: true, plan, manifest, verification, lockVerification };
}

const { resetProject } = require('./reset');

module.exports = {
    dryRunProject,
    initProject,
    resetProject,
};
