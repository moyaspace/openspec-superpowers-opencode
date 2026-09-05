import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function createContext(options = {}) {
    const lang = options.lang || 'en';
    if (!['en', 'zh-CN', 'zh-TW'].includes(lang)) {
        throw new Error(`Unsupported language: ${lang}`);
    }
    const targetDir = path.resolve(options.targetDir || process.cwd());
    const templateDir = path.resolve(options.templateDir ||
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'template'));
    const targetExists = fs.existsSync(targetDir);
    const projectKind = targetExists && fs.readdirSync(targetDir).length > 0
        ? 'brownfield'
        : 'greenfield';
    return {
        mode: options.mode || 'init',
        lang,
        targetDir,
        templateDir,
        targetExists,
        projectKind,
    };
}
export { createContext };
//# sourceMappingURL=context.js.map