import fs from 'node:fs';
import path from 'node:path';
import { assertSafeProjectTarget } from './manifest.js';

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

let temporarySequence = 0;

function atomicReplace(target: string, writer: (temporary: string) => void): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = path.join(
        path.dirname(target),
        `.${path.basename(target)}.oso-tmp-${process.pid}-${temporarySequence++}`,
    );
    try {
        writer(temporary);
        fs.renameSync(temporary, target);
    } finally {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
}

function executeOperations(operations: DeployOperation[], options: DeployOptions): void {
    const projectRoot = path.resolve(options.projectRoot);
    const validatedOperations = operations.map(operation => ({
        operation,
        target: assertSafeProjectTarget(projectRoot, (operation.target || operation.path)!),
    }));
    for (const { operation, target } of validatedOperations) {
        if (operation.type === 'mkdir') {
            fs.mkdirSync(target, { recursive: true });
        } else if (operation.type === 'copy') {
            atomicReplace(target, temporary => fs.copyFileSync(operation.source!, temporary));
        } else if (operation.type === 'write') {
            atomicReplace(target, temporary => fs.writeFileSync(temporary, operation.content!, 'utf8'));
        } else if (operation.type !== 'skip' && operation.type !== 'preserve') {
            throw new Error(`Unsupported setup operation: ${operation.type}`);
        }
    }
}

export {
    executeOperations,
};