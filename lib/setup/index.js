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

function createRegistry(projectRoot) {
    const registryPath = path.join(projectRoot, 'openspec', 'oso-change-registry.json');
    if (!fs.existsSync(registryPath)) {
        executeOperations([{
            type: 'write',
            target: registryPath,
            content: '{\n  "changes": []\n}\n',
        }], { projectRoot });
    }
}

function commitProject(targetDir, runner) {
    if (!fs.existsSync(path.join(targetDir, '.git'))) {
        requireCommand(runner.run('git', ['init', '--initial-branch=main'], { cwd: targetDir }), 'git-init');
        requireCommand(runner.run('git', ['config', 'core.autocrlf', 'false'], { cwd: targetDir }), 'git-config');
        requireCommand(runner.run('git', ['config', 'advice.safeCrlf', 'false'], { cwd: targetDir }), 'git-config');
    }
    requireCommand(
        runner.run('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'add', '-A'], { cwd: targetDir }),
        'git-add',
    );
    const diff = runner.run('git', ['diff', '--cached', '--quiet'], { cwd: targetDir });
    if (diff.code !== 0) {
        requireCommand(
            runner.run('git', [
                '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false',
                'commit', '-m', 'oso: launch OpenSpec + Superpowers workflow',
            ], { cwd: targetDir }),
            'git-commit',
        );
    }
}

async function collectBrownfieldDecisions(options) {
    if (options.context.projectKind !== 'brownfield') return { cancelled: false, decisions: {} };
    const env = options.env || process.env;
    const prompt = options.prompt;
    const decide = (envName, question, allowAsk = false) => resolveDecision({
        override: env[envName],
        prompt,
        question,
        allowAsk,
    });

    const proceed = await decide('BROWN_OVERRIDE_INIT', 'Brownfield project. Continue with full init?');
    if (proceed !== 'yes') return { cancelled: true, decisions: {} };
    const targetDir = options.context.targetDir;
    const hasEntries = directory => fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
    const hasCompleteMarker = (file, marker) => (
        fs.existsSync(file) && fs.readFileSync(file, 'utf8').split(marker).length - 1 === 2
    );
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
        openspec: await decide('BROWN_OVERRIDE_OPENSPEC', 'Overwrite OpenSpec config and schemas?'),
    };
    if (fs.existsSync(path.join(targetDir, '.opencode', 'opencode.json'))) {
        decisions.opencodeJson = await decide('BROWN_OVERRIDE_OCODEJSON', 'Merge .opencode/opencode.json?');
    }
    if (hasEntries(path.join(targetDir, '.opencode', 'commands'))) {
        decisions.commands = await decide('BROWN_OVERRIDE_COMMANDS', 'Overwrite commands?', true);
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
        decisions.skills = await decide('BROWN_OVERRIDE_SKILLS', 'Overwrite skills?', true);
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
    for (const [key, envName, file, marker, question] of [
        ['agents', 'BROWN_OVERRIDE_AGENTS', 'AGENTS.md', '<!-- openspec-superpowers-opencode_instructions -->', 'Replace managed AGENTS.md section?'],
        ['gitignore', 'BROWN_OVERRIDE_GITIGNORE', '.gitignore', '# <!-- openspec-superpowers-opencode_gitignore -->', 'Replace managed .gitignore section?'],
        ['gitattr', 'BROWN_OVERRIDE_GITATTR', '.gitattributes', '# <!-- openspec-superpowers-opencode_gitattributes -->', 'Replace managed .gitattributes section?'],
        ['editorconfig', 'BROWN_OVERRIDE_EDITORCONFIG', '.editorconfig', '# <!-- openspec-superpowers-opencode_editorconfig -->', 'Replace managed .editorconfig section?'],
    ]) {
        if (hasCompleteMarker(path.join(targetDir, file), marker)) {
            decisions[key] = await decide(envName, question);
        }
    }
    return {
        cancelled: false,
        decisions,
    };
}

async function dryRunProject(options = {}) {
    const runner = options.runner || createProcessRunner();
    const context = createContext({ ...options, mode: 'dry-run' });
    const prerequisiteCwd = existingCommandCwd(context.targetDir);
    requireCommand(runner.run('openspec', ['--version'], { cwd: prerequisiteCwd }), 'openspec-prerequisite');
    requireCommand(runner.run('opencode', ['--version'], { cwd: prerequisiteCwd }), 'opencode-prerequisite');
    const superpowers = resolveSuperpowers(options);
    const lockFile = selectLockFile(context.templateDir, parseMajorVersion(superpowers.version));
    if (!lockFile) throw new Error('No skills lock file was found in the template');
    const lockVerification = verifySkillLock(
        superpowers.skillsPath,
        JSON.parse(fs.readFileSync(lockFile, 'utf8')),
    );
    const brownfield = await collectBrownfieldDecisions({ ...options, context });
    if (brownfield.cancelled) return { mode: 'dry-run', cancelled: true, operations: [] };
    const plan = createInitPlan({
        ...context,
        lockFile,
        superpowersPath: superpowers.skillsPath,
        decisions: { ...brownfield.decisions, ...(options.decisions || {}) },
    });
    plan.lockVerification = lockVerification;
    return plan;
}

async function initProject(options = {}) {
    const runner = options.runner || createProcessRunner();
    const context = createContext({ ...options, mode: 'init' });
    if (context.targetExists && fs.existsSync(path.join(context.targetDir, '.git'))) {
        const status = requireCommand(runner.run('git', ['status', '--porcelain'], { cwd: context.targetDir }), 'git-status');
        if (status.stdout.trim()) throw new Error('Working directory has uncommitted changes');
    }

    const prerequisiteCwd = existingCommandCwd(context.targetDir);
    requireCommand(runner.run('openspec', ['--version'], { cwd: prerequisiteCwd }), 'openspec-prerequisite');
    const opencode = requireCommand(runner.run('opencode', ['--version'], { cwd: prerequisiteCwd }), 'opencode-prerequisite');
    const superpowers = resolveSuperpowers(options);
    const lockFile = selectLockFile(context.templateDir, parseMajorVersion(superpowers.version));
    if (!lockFile) throw new Error('No skills lock file was found in the template');
    const lockVerification = verifySkillLock(
        superpowers.skillsPath,
        JSON.parse(fs.readFileSync(lockFile, 'utf8')),
    );
    const brownfield = await collectBrownfieldDecisions({ ...options, context });
    if (brownfield.cancelled) return { success: true, cancelled: true };

    const plan = createInitPlan({
        ...context,
        lang: options.lang || 'en',
        lockFile,
        superpowersPath: superpowers.skillsPath,
        decisions: { ...brownfield.decisions, ...(options.decisions || {}) },
    });
    executeOperations(plan.operations, { projectRoot: context.targetDir });

    const manifest = buildManifest({
        projectRoot: context.targetDir,
        operations: plan.operations,
        language: options.lang || 'en',
        opencodeVersion: opencode.stdout.trim(),
        superpowersPath: superpowers.skillsPath,
        verification: 'pending',
    });
    writeManifest(context.targetDir, manifest);

    const verification = await verifyProject({ targetDir: context.targetDir, runner });
    manifest.verification = verification.passed ? 'passed' : 'failed';
    writeManifest(context.targetDir, manifest);
    if (!verification.passed) return { success: false, plan, manifest, verification, lockVerification };

    createRegistry(context.targetDir);
    commitProject(context.targetDir, runner);
    return { success: true, plan, manifest, verification, lockVerification };
}

const { resetProject } = require('./reset');

module.exports = {
    dryRunProject,
    initProject,
    resetProject,
};
