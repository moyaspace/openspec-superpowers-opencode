import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

interface ProgressEvent {
    type: string;
    label?: string;
    item?: string;
    text?: string;
    n?: number;
    total?: number;
    detail?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

import { type ProcessRunner, type RunResult } from './process-runner.js';

export function parseTemplateOutput(stdout: string): { ok: boolean; count: number } {
    try {
        const parsed: unknown = JSON.parse(stdout);
        const entries = (
            Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>)
        ) as Array<{ source?: string } | null | undefined>;
        const count = entries.filter(template => template && template.source === 'project').length;
        return { ok: count >= 8, count };
    } catch {
        return { ok: false, count: 0 };
    }
}

export function changeListed(stdout: string, changeName: string): boolean {
    try {
        const parsed = JSON.parse(stdout) as { changes?: unknown };
        const changes = (parsed.changes || parsed || []) as Array<
            string | { name?: string } | null | undefined
        >;
        return Array.isArray(changes) && changes.some(change => (
            typeof change === 'string' ? change === changeName : change && change.name === changeName
        ));
    } catch {
        return stdout.includes(changeName);
    }
}

export function parseStatusOutput(stdout: string, minimum = 8): { ok: boolean; count: number } {
    try {
        const parsed = JSON.parse(stdout) as { artifacts?: Array<unknown> };
        const artifacts = parsed.artifacts || [];
        return { ok: Array.isArray(artifacts) && artifacts.length >= minimum, count: artifacts.length };
    } catch {
        const count = stdout.split('\n').filter(line => line.trimStart().startsWith('[')).length;
        return { ok: count >= minimum, count };
    }
}

function requireSuccess(result: RunResult, phase: string): RunResult {
    if (!result || result.code !== 0) {
        const error = new Error(
            `${phase} failed${result && result.stderr ? `: ${result.stderr.trim()}` : ''}`,
        ) as Error & { phase: string };
        error.phase = phase;
        throw error;
    }
    return result;
}

export interface VerifyProjectOptions {
    runner: ProcessRunner;
    targetDir: string;
    uniquePart?: () => string;
    progress?: ProgressCallback | undefined;
    cleanup?: ((name: string) => void | Promise<void>) | undefined;
}

export interface VerifyProjectResult {
    passed: boolean;
    changeName: string;
    error?: unknown;
}

async function verifyProject(options: VerifyProjectOptions): Promise<VerifyProjectResult> {
    const { runner, targetDir } = options;
    const uniquePart = options.uniquePart
        ? options.uniquePart()
        : `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const changeName = `oso-verify-${uniquePart}`;
    let created = false;
    const progress = options.progress || (() => {});

    const cleanup = options.cleanup || (name => {
        fs.rmSync(path.join(targetDir, 'openspec', 'changes', name), { recursive: true, force: true });
    });

    try {
        const templates = requireSuccess(
            runner.run('openspec', ['templates', '--json', '--schema', 'superpowers-bridge-opencode'], { cwd: targetDir }),
            'template-list',
        );
        const templateResult = parseTemplateOutput(templates.stdout);
        if (!templateResult.ok) throw new Error('template-list returned fewer than 8 project templates');
        progress({ type: 'pass', item: 'Template parsing complete', detail: `(${templateResult.count} templates)` });

        requireSuccess(runner.run('openspec', ['new', 'change', changeName], { cwd: targetDir }), 'change-create');
        created = true;
        progress({ type: 'pass', item: 'Test change created' });

        const list = requireSuccess(runner.run('openspec', ['list', '--json'], { cwd: targetDir }), 'change-list');
        if (!changeListed(list.stdout, changeName)) throw new Error('created verification change is not listed');
        progress({ type: 'pass', item: 'Change list OK' });

        const status = requireSuccess(
            runner.run('openspec', ['status', '--change', changeName, '--json'], { cwd: targetDir }),
            'change-status',
        );
        const statusResult = parseStatusOutput(status.stdout);
        if (!statusResult.ok) throw new Error('verification change has an incomplete artifact chain');
        progress({ type: 'pass', item: 'Artifact chain complete', detail: `(${statusResult.count})` });

        requireSuccess(
            runner.run('openspec', ['instructions', 'brainstorm', '--change', changeName], { cwd: targetDir }),
            'brainstorm-instructions',
        );
        progress({ type: 'pass', item: 'Instruction generation OK' });
        progress({ type: 'pass', item: 'Workflow validation passed' });
        return { passed: true, changeName };
    } catch (error) {
        progress({ type: 'fail', item: (error as Error).message || 'Verification failed' });
        return { passed: false, changeName, error };
    } finally {
        if (created) {
            await cleanup(changeName);
            progress({ type: 'pass', item: 'Test change cleaned up' });
        }
    }
}

export { verifyProject };

/**
 * 校验落盘文件不含路径占位符。以目标文件为准，不看模板源——
 * 模板源含占位符是正常的，落盘后仍含才是缺陷。
 */
function verifyNoPlaceholders(targetDir: string, targets: readonly string[]): void {
    for (const relative of targets) {
        const targetPath = path.join(targetDir, ...relative.split('/'));
        if (!fs.existsSync(targetPath)) {
            throw new Error(`Placeholder check target missing: ${relative}`);
        }
        const content = fs.readFileSync(targetPath, 'utf8');
        if (content.includes('{{SUPERPOWERS_BASE_PATH}}')) {
            throw new Error(`Unreplaced path placeholder in ${relative}`);
        }
    }
}

export { verifyNoPlaceholders };
