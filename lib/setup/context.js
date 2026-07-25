const fs = require('node:fs');
const path = require('node:path');

function createContext(options = {}) {
    const lang = options.lang || 'en';
    if (!['en', 'zh-CN', 'zh-TW'].includes(lang)) {
        throw new Error(`Unsupported language: ${lang}`);
    }
    const targetDir = path.resolve(options.targetDir || process.cwd());
    const templateDir = path.resolve(options.templateDir || path.join(__dirname, '..', '..', 'template'));

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

module.exports = {
    createContext,
};
