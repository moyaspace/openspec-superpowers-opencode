import fs from 'node:fs';
import path from 'node:path';
import { mergeMarker, mergeOcodeJson } from './merge.js';

type ManagedFileName = '_AGENTS.md' | '_gitignore' | '_gitattributes' | '_editorconfig';

const MANAGED_ROOT_FILES: Record<ManagedFileName, string> = {
    '_AGENTS.md': 'AGENTS.md',
    '_gitignore': '.gitignore',
    '_gitattributes': '.gitattributes',
    '_editorconfig': '.editorconfig',
};

const MANAGED_MARKERS: Record<ManagedFileName, string> = {
    '_AGENTS.md': '<!-- openspec-superpowers-opencode_instructions -->',
    '_gitignore': '# <!-- openspec-superpowers-opencode_gitignore -->',
    '_gitattributes': '# <!-- openspec-superpowers-opencode_gitattributes -->',
    '_editorconfig': '# <!-- openspec-superpowers-opencode_editorconfig -->',
};

const MANAGED_DECISIONS: Record<ManagedFileName, string> = {
    '_AGENTS.md': 'agents',
    '_gitignore': 'gitignore',
    '_gitattributes': 'gitattr',
    '_editorconfig': 'editorconfig',
};

export interface PlanOperation {
    type: string;
    target?: string;
    path?: string;
    source?: string;
    content?: string;
    decision?: string | undefined;
    changed?: boolean;
}

export interface InitDecisions {
    openspec?: string | undefined;
    opencodeJson?: string | undefined;
    commands?: string | undefined;
    skills?: string | undefined;
    commandFiles?: Record<string, string> | undefined;
    skillFiles?: Record<string, string> | undefined;
    agents?: string | undefined;
    gitignore?: string | undefined;
    gitattr?: string | undefined;
    editorconfig?: string | undefined;
    [key: string]: string | Record<string, string> | undefined;
}

interface InitContext {
    mode: string;
    lang?: string;
    targetDir: string;
    templateDir: string;
    targetExists: boolean;
    projectKind: 'greenfield' | 'brownfield';
    lockFile?: string | null;
    superpowersPath?: string;
    decisions?: InitDecisions;
}

export interface InitPlan {
    mode: string;
    projectKind: 'greenfield' | 'brownfield';
    operations: PlanOperation[];
}

function selectedLanguageFile(relativePath: string, lang: string): boolean {
    if (relativePath.includes('.zh-CN.')) return lang === 'zh-CN';
    if (relativePath.includes('.zh-TW.')) return lang === 'zh-TW';
    return true;
}

function listFiles(rootDir: string, relativeDir = ''): string[] {
    const currentDir = path.join(rootDir, relativeDir);
    const files: string[] = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(rootDir, relativePath));
        else if (entry.isFile()) files.push(relativePath);
    }
    return files;
}

function renderedTemplate(source: string, superpowersPath: string | undefined): string {
    const content = fs.readFileSync(source, 'utf8');
    if (!superpowersPath) return content;
    const replacement = superpowersPath.endsWith(path.sep) ? superpowersPath : `${superpowersPath}${path.sep}`;
    return content.split('{{SUPERPOWERS_BASE_PATH}}').join(replacement);
}

const isOpenSpecData = (p: string): boolean => p.startsWith('openspec/changes/') || p.startsWith('openspec/specs/');
const isOpenSpecSchema = (p: string): boolean => p.startsWith('openspec/schemas/');
const isCommand = (p: string): boolean => p.startsWith('.opencode/commands/');
const isSkill = (p: string): boolean => p.startsWith('.opencode/skills/');
const isProductAsset = (p: string): boolean => isOpenSpecSchema(p) || isCommand(p) || isSkill(p);

function createInitPlan(context: InitContext): InitPlan {
    const operations: PlanOperation[] = [];
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
        if (brownfield && isOpenSpecData(portablePath)) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        if (
            brownfield
            && portablePath.startsWith('openspec/')
            && !isOpenSpecSchema(portablePath)
            && fs.existsSync(target)
            && decisions.openspec !== 'yes'
        ) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        if (brownfield && portablePath === '.opencode/opencode.json' && fs.existsSync(target)) {
            if (decisions.opencodeJson !== 'yes') {
                operations.push({ type: 'preserve', target, decision: 'skip' });
                continue;
            }
            const templateJson = JSON.parse(fs.readFileSync(source, 'utf8')) as Record<string, unknown>;
            const userJson = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
            operations.push({
                type: 'write',
                target,
                content: `${JSON.stringify(mergeOcodeJson(userJson, templateJson), null, 2)}\n`,
                decision: 'overwrite',
            });
            continue;
        }
        const keepCommand = decisions.commands === 'no'
            || (decisions.commands === 'ask'
                && decisions.commandFiles
                && decisions.commandFiles[portablePath] !== 'yes');
        if (brownfield && isCommand(portablePath) && fs.existsSync(target) && keepCommand) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        const keepSkill = decisions.skills === 'no'
            || (decisions.skills === 'ask'
                && decisions.skillFiles
                && decisions.skillFiles[portablePath] !== 'yes');
        if (brownfield && isSkill(portablePath) && fs.existsSync(target) && keepSkill) {
            operations.push({ type: 'preserve', target, decision: 'skip' });
            continue;
        }
        const existing = brownfield && fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        const content = renderedTemplate(source, context.superpowersPath);
        operations.push({
            type: 'write',
            target,
            content,
            decision: existing === null ? undefined : 'overwrite',
            changed: existing !== null && existing !== content,
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
                marker: MANAGED_MARKERS[sourceName as ManagedFileName]!,
                decision: decisions[MANAGED_DECISIONS[sourceName as ManagedFileName]!] as string | undefined,
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

export {
    createInitPlan,
};