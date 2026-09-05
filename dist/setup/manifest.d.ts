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
declare function normalizeManifestPath(value: unknown): string;
declare function assertSafeProjectTarget(projectRoot: string, target: string): string;
declare function resolveManifestTarget(projectRoot: string, manifestPath: string): string;
declare function buildManifest(options: BuildManifestOptions): Manifest;
declare function readManifest(projectRoot: string): Manifest;
export { assertSafeProjectTarget, buildManifest, normalizeManifestPath, readManifest, resolveManifestTarget, };
//# sourceMappingURL=manifest.d.ts.map