const fs = require('node:fs');
const path = require('node:path');
const { assertSafeProjectTarget } = require('./manifest');

let temporarySequence = 0;

function atomicReplace(target, writer) {
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

function executeOperations(operations, options) {
    const projectRoot = path.resolve(options.projectRoot);
    const validatedOperations = operations.map(operation => ({
        operation,
        target: assertSafeProjectTarget(projectRoot, operation.target || operation.path),
    }));
    for (const { operation, target } of validatedOperations) {
        if (operation.type === 'mkdir') {
            fs.mkdirSync(target, { recursive: true });
        } else if (operation.type === 'copy') {
            atomicReplace(target, temporary => fs.copyFileSync(operation.source, temporary));
        } else if (operation.type === 'write') {
            atomicReplace(target, temporary => fs.writeFileSync(temporary, operation.content, 'utf8'));
        } else if (operation.type !== 'skip' && operation.type !== 'preserve') {
            throw new Error(`Unsupported setup operation: ${operation.type}`);
        }
    }
}

module.exports = {
    executeOperations,
};
