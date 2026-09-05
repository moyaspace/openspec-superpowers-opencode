import { type SetupOperation } from './manifest.js';
type DeployOperation = SetupOperation;
interface DeployOptions {
    projectRoot: string;
}
declare function executeOperations(operations: DeployOperation[], options: DeployOptions): void;
export { executeOperations, };
//# sourceMappingURL=deploy.d.ts.map