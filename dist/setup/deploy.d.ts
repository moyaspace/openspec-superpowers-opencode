interface DeployOperation {
    type: string;
    target?: string;
    path?: string;
    source?: string;
    content?: string;
    decision?: string | undefined;
}
interface DeployOptions {
    projectRoot: string;
}
declare function executeOperations(operations: DeployOperation[], options: DeployOptions): void;
export { executeOperations, };
//# sourceMappingURL=deploy.d.ts.map