const fs = require('node:fs');
const path = require('node:path');

const { readManifest, resolveManifestTarget } = require('./manifest');
const { resolveDecision } = require('./prompt');

const PROTECTED_FILES = new Set([
    'AGENTS.md',
    '.opencode/opencode.json',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
]);

function protectedManifestPath(relativePath) {
    return PROTECTED_FILES.has(relativePath)
        || relativePath === 'openspec/changes'
        || relativePath.startsWith('openspec/changes/')
        || relativePath === 'openspec/specs'
        || relativePath.startsWith('openspec/specs/');
}

function createResetPlan(projectRoot, manifest) {
    return manifest.files.map(relativePath => {
        if (protectedManifestPath(relativePath)) {
            return { type: 'preserve', path: relativePath };
        }
        return {
            type: 'delete',
            path: relativePath,
            target: resolveManifestTarget(projectRoot, relativePath),
        };
    });
}

function removeEmptyParents(startDir, projectRoot) {
    const root = path.resolve(projectRoot);
    let current = path.resolve(startDir);
    while (current !== root) {
        const relative = path.relative(root, current);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return;
        const stat = fs.lstatSync(current);
        if (!stat.isDirectory() || stat.isSymbolicLink() || fs.readdirSync(current).length > 0) return;
        fs.rmdirSync(current);
        current = path.dirname(current);
    }
}

async function resetProject(options = {}) {
    const projectRoot = path.resolve(options.targetDir || process.cwd());
    const p = options.progress || (() => {});
    const lang = options.lang || 'en';
    const t = (zh, en) => (lang === 'zh-CN' || lang === 'zh-TW' ? zh : en);

    p({ type: 'section', label: t('重置安装', 'Reset Setup') });
    p({ type: 'step', n: 1, total: 3, label: t('读取安装清单', 'Reading install manifest') });
    const manifest = readManifest(projectRoot);
    if (manifest.project !== 'openspec-superpowers-opencode') {
        throw new Error('Install manifest does not belong to openspec-superpowers-opencode');
    }
    p({ type: 'pass', item: t('安装清单验证', 'Manifest verified') });

    p({ type: 'step', n: 2, total: 3, label: t('确认操作', 'Confirm operation') });
    const operations = createResetPlan(projectRoot, manifest);
    const decision = await resolveDecision({
        prompt: options.prompt,
        question: 'Remove installed files?',
        override: options.confirm,
    });
    if (decision !== 'yes') {
        p({ type: 'info', text: t('已取消重置', 'Reset cancelled') });
        return { success: true, cancelled: true, operations };
    }

    p({ type: 'step', n: 3, total: 3, label: t('删除已安装文件', 'Removing installed files') });
    for (const operation of operations) {
        if (operation.type !== 'delete' || !fs.existsSync(operation.target)) continue;
        const stat = fs.lstatSync(operation.target);
        if (stat.isDirectory() && !stat.isSymbolicLink()) continue;
        fs.unlinkSync(operation.target);
        removeEmptyParents(path.dirname(operation.target), projectRoot);
        p({ type: 'action', text: `  ${t('删除', 'delete')}: ${operation.path}` });
    }
    fs.rmSync(path.join(projectRoot, '.opencode', 'install-manifest.json'), { force: true });
    p({ type: 'done', label: t('重置完成', 'Reset Complete') });
    return { success: true, cancelled: false, operations };
}

module.exports = {
    createResetPlan,
    protectedManifestPath,
    resetProject,
};
