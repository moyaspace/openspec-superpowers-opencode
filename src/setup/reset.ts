import fs from 'node:fs';
import path from 'node:path';

import { readManifest, resolveManifestTarget, type Manifest } from './manifest.js';
import { resolveDecision } from './prompt.js';

export interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    n?: number;
    total?: number;
    detail?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

const PROTECTED_FILES = new Set([
    'AGENTS.md',
    '.opencode/opencode.json',
    '.gitignore',
    '.gitattributes',
    '.editorconfig',
]);

export function protectedManifestPath(relativePath: string): boolean {
    return PROTECTED_FILES.has(relativePath)
        || relativePath === 'openspec/changes'
        || relativePath.startsWith('openspec/changes/')
        || relativePath === 'openspec/specs'
        || relativePath.startsWith('openspec/specs/');
}

export type ResetOperation =
    | { type: 'preserve'; path: string }
    | { type: 'delete'; path: string; target: string };

export function createResetPlan(projectRoot: string, manifest: Manifest): ResetOperation[] {
    return manifest.files.map((relativePath: string) => {
        if (protectedManifestPath(relativePath)) {
            return { type: 'preserve', path: relativePath } as const;
        }
        return {
            type: 'delete',
            path: relativePath,
            target: resolveManifestTarget(projectRoot, relativePath),
        } as const;
    });
}

function removeEmptyParents(startDir: string, projectRoot: string): void {
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

export interface ResetProjectOptions {
    targetDir?: string | undefined;
    progress?: ProgressCallback | undefined;
    lang?: string | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    confirm?: string | undefined;
}

export interface ResetResult {
    success: boolean;
    cancelled: boolean;
    operations: ResetOperation[];
}

async function resetProject(options: ResetProjectOptions = {}): Promise<ResetResult> {
    const projectRoot = path.resolve(options.targetDir || process.cwd());
    const p = options.progress || (() => {});
    const lang = options.lang || 'en';
    const t = (zh: string, en: string) => (lang === 'zh-CN' || lang === 'zh-TW' ? zh : en);

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

export { resetProject };
