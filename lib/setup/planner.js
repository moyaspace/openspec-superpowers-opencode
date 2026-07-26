const fs = require('node:fs');
const path = require('node:path');
const { mergeMarker, mergeOcodeJson } = require('./merge');

const MANAGED_ROOT_FILES = {
    '_AGENTS.md': 'AGENTS.md',
    '_gitignore': '.gitignore',
    '_gitattributes': '.gitattributes',
    '_editorconfig': '.editorconfig',
};

const MANAGED_MARKERS = {
    '_AGENTS.md': '<!-- openspec-superpowers-opencode_instructions -->',
    '_gitignore': '# <!-- openspec-superpowers-opencode_gitignore -->',
    '_gitattributes': '# <!-- openspec-superpowers-opencode_gitattributes -->',
    '_editorconfig': '# <!-- openspec-superpowers-opencode_editorconfig -->',
};

const MANAGED_DECISIONS = {
    '_AGENTS.md': 'agents',
    '_gitignore': 'gitignore',
    '_gitattributes': 'gitattr',
    '_editorconfig': 'editorconfig',
};

function selectedLanguageFile(relativePath, lang) {
    if (relativePath.includes('.zh-CN.')) return lang === 'zh-CN';
    if (relativePath.includes('.zh-TW.')) return lang === 'zh-TW';
    return true;
}

function listFiles(rootDir, relativeDir = '') {
    const currentDir = path.join(rootDir, relativeDir);
    const files = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(rootDir, relativePath));
        else if (entry.isFile()) files.push(relativePath);
    }
    return files;
}

function renderedTemplate(source, superpowersPath) {
    const content = fs.readFileSync(source, 'utf8');
    if (!superpowersPath) return content;
    const replacement = superpowersPath.endsWith(path.sep) ? superpowersPath : `${superpowersPath}${path.sep}`;
    return content.split('{{SUPERPOWERS_BASE_PATH}}').join(replacement);
}

function createInitPlan(context) {
    const operations = [];
    const brownfield = context.projectKind === 'brownfield';
    const decisions = context.decisions || {};

    if (!context.targetExists) {
        operations.push({ type: 'mkdir', path: context.targetDir });
    }

    if (context.lockFile) {
        operations.push({
            type: 'copy',
            source: context.lockFile,
            target: path.join(context.targetDir, 'skills.lock.json'),
            decision: brownfield ? 'overwrite' : undefined,
        });
    }

    if (!brownfield) {
        for (const directory of ['openspec/changes/archive', 'openspec/specs']) {
            operations.push({ type: 'mkdir', path: path.join(context.targetDir, ...directory.split('/')) });
        }
    }

    for (const relativePath of listFiles(context.templateDir)) {
        const portablePath = relativePath.replace(/\\/g, '/');
        if (/^skills\.lock\.v[^/]+\.json$/.test(portablePath)) continue;
        if (portablePath in MANAGED_ROOT_FILES) continue;
        if (!selectedLanguageFile(portablePath, context.lang || 'en')) continue;
        if (!portablePath.startsWith('openspec/') && !portablePath.startsWith('.opencode/')) continue;
        const source = path.join(context.templateDir, relativePath);
        const target = path.join(context.targetDir, relativePath);
        if (brownfield && (portablePath.startsWith('openspec/changes/') || portablePath.startsWith('openspec/specs/'))) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        if (brownfield && portablePath.startsWith('openspec/') && decisions.openspec !== 'yes') {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        if (brownfield && portablePath === '.opencode/opencode.json' && fs.existsSync(target)) {
            if (decisions.opencodeJson !== 'yes') {
                operations.push({ type: 'preserve', target, decision: 'skip' });
                continue;
            }
            const templateJson = JSON.parse(fs.readFileSync(source, 'utf8'));
            const userJson = JSON.parse(fs.readFileSync(target, 'utf8'));
            operations.push({
                type: 'write',
                target,
                content: `${JSON.stringify(mergeOcodeJson(userJson, templateJson), null, 2)}\n`,
                decision: 'overwrite',
            });
            continue;
        }
        if (
            brownfield
            && portablePath.startsWith('.opencode/commands/')
            && fs.existsSync(target)
            && (
                decisions.commands === 'ask'
                    ? decisions.commandFiles && decisions.commandFiles[portablePath] !== 'yes'
                    : decisions.commands !== 'yes'
            )
        ) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        if (
            brownfield
            && portablePath.startsWith('.opencode/skills/')
            && fs.existsSync(target)
            && (
                decisions.skills === 'ask'
                    ? decisions.skillFiles && decisions.skillFiles[portablePath] !== 'yes'
                    : decisions.skills !== 'yes'
            )
        ) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        operations.push({
            type: 'write',
            target,
            content: renderedTemplate(source, context.superpowersPath),
            decision: brownfield && fs.existsSync(target) ? 'overwrite' : undefined,
        });
    }

    for (const [sourceName, targetName] of Object.entries(MANAGED_ROOT_FILES)) {
        const source = path.join(context.templateDir, sourceName);
        if (!fs.existsSync(source)) continue;
        const target = path.join(context.targetDir, targetName);
        const content = renderedTemplate(source, context.superpowersPath);
        if (brownfield && fs.existsSync(target)) {
            const merged = mergeMarker({
                existing: fs.readFileSync(target, 'utf8'),
                managed: content,
                marker: MANAGED_MARKERS[sourceName],
                decision: decisions[MANAGED_DECISIONS[sourceName]],
            });
            operations.push({
                type: merged.action === 'skip' ? 'preserve' : 'write',
                target,
                content: merged.content,
                decision: merged.action === 'skip' ? 'skip' : merged.action,
            });
        } else {
            operations.push({ type: 'write', target, content });
        }
    }

    return {
        mode: context.mode,
        projectKind: context.projectKind,
        operations,
    };
}

module.exports = {
    createInitPlan,
};
