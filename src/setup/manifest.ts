import path from 'node:path';
import fs from 'node:fs';

interface SetupOperation {
    type: string;
    target?: string;
    path?: string;
    source?: string;
    content?: string;
    decision?: string | undefined;
}

interface Manifest {
    project: string;
    installedAt: string;
    language: string;
    opencodeVersion: string;
    superpowersPath: string;
    verification: string;
    files: string[];
    overwriteDecisions: Record<string, string>;
}

interface BuildManifestOptions {
    operations: SetupOperation[];
    projectRoot: string;
    language: string;
    now?: () => Date;
    opencodeVersion?: string;
    superpowersPath?: string;
    verification?: string;
    overwriteDecisions?: Record<string, string>;
}

function unsafeManifestPath(value: unknown): never {
    throw new Error(`Unsafe manifest path: ${String(value)}`);
}

function normalizeManifestPath(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) unsafeManifestPath(value);
    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\')) {
        unsafeManifestPath(value);
    }

    const normalized = value.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(segment => segment !== '' && segment !== '.');
    if (segments.length === 0 || segments.some(segment => segment === '..')) {
        unsafeManifestPath(value);
    }
    return segments.join('/');
}

function lstatIfExists(target: string): fs.Stats | null {
    try {
        return fs.lstatSync(target);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
    }
}

function assertSafeProjectTarget(projectRoot: string, target: string): string {
    const root = path.resolve(projectRoot);
    const resolved = path.resolve(target);
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Operation target is outside project root: ${target}`);
    }

    const components = relative === '' ? [] : relative.split(path.sep);
    let current = root;
    for (const component of [null, ...components]) {
        if (component !== null) current = path.join(current, component);
        const stat = lstatIfExists(current);
        if (stat && stat.isSymbolicLink()) {
            throw new Error(`Operation target crosses a symbolic link: ${current}`);
        }
        if (!stat) break;
    }
    return resolved;
}

function resolveManifestTarget(projectRoot: string, manifestPath: string): string {
    const normalized = normalizeManifestPath(manifestPath);
    const root = path.resolve(projectRoot);
    const target = path.resolve(root, ...normalized.split('/'));
    try {
        return assertSafeProjectTarget(root, target);
    } catch (error) {
        if (error instanceof Error && error.message.includes('outside project root')) unsafeManifestPath(manifestPath);
        throw error;
    }
}

function buildManifest(options: BuildManifestOptions): Manifest {
    const files = options.operations
        .filter(operation => operation.type === 'copy' || operation.type === 'write')
        .map(operation => normalizeManifestPath(path.relative(options.projectRoot, operation.target!)))
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort();
    const overwriteDecisions: Record<string, string> = { ...(options.overwriteDecisions || {}) };
    for (const operation of options.operations) {
        if (!operation.decision || !operation.target) continue;
        const relativePath = normalizeManifestPath(path.relative(options.projectRoot, operation.target));
        overwriteDecisions[relativePath] = operation.decision;
    }
    return {
        project: 'openspec-superpowers-opencode',
        installedAt: (options.now || (() => new Date()))().toISOString(),
        language: options.language,
        opencodeVersion: options.opencodeVersion || 'unknown',
        superpowersPath: options.superpowersPath || '',
        verification: options.verification || 'pending',
        files,
        overwriteDecisions,
    };
}

function readManifest(projectRoot: string): Manifest {
    const manifestPath = resolveManifestTarget(projectRoot, '.opencode/install-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
    manifest.files = (manifest.files || []).map(normalizeManifestPath);
    return manifest;
}

export {
    assertSafeProjectTarget,
    buildManifest,
    normalizeManifestPath,
    readManifest,
    resolveManifestTarget,
};