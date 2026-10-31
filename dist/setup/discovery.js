import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
function parseMajorVersion(version) {
    if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(version))
        return null;
    return version.split('.')[0];
}
function listLockMajors(templateDir) {
    let entries;
    try {
        entries = fs.readdirSync(templateDir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    return entries
        .filter(entry => entry.isFile())
        .map(entry => /^skills\.lock\.v(\d+)\.json$/.exec(entry.name))
        .filter((match) => match !== null)
        .map(match => match[1])
        .sort((a, b) => Number(a) - Number(b));
}
function selectLockFile(templateDir, major) {
    if (!major)
        return null;
    const matching = path.join(templateDir, `skills.lock.v${major}.json`);
    return fs.existsSync(matching) ? matching : null;
}
function findSkillsBelow(rootDir) {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const candidate = path.join(rootDir, entry.name);
        if (entry.name === 'skills'
            && path.basename(path.dirname(candidate)) === 'superpowers'
            && path.basename(path.dirname(path.dirname(candidate))) === 'node_modules') {
            return candidate;
        }
        const nested = findSkillsBelow(candidate);
        if (nested)
            return nested;
    }
    return null;
}
function findSuperpowersSkills(packagesDir) {
    if (!fs.existsSync(packagesDir))
        return null;
    const packageEntries = fs.readdirSync(packagesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('superpowers@'))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of packageEntries) {
        const found = findSkillsBelow(path.join(packagesDir, entry.name));
        if (found)
            return found;
    }
    return null;
}
function readSuperpowersVersion(skillsPath) {
    const packageFile = path.join(path.dirname(skillsPath), 'package.json');
    if (!fs.existsSync(packageFile))
        return null;
    const parsed = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    return typeof parsed.version === 'string' ? parsed.version : null;
}
function locateSuperpowers(options = {}) {
    const skillsPath = options.superpowersPath || findSuperpowersSkills(options.packagesDir || path.join(os.homedir(), '.cache', 'opencode', 'packages'));
    if (!skillsPath)
        return null;
    const version = options.superpowersVersion || readSuperpowersVersion(skillsPath);
    return { skillsPath, version };
}
function verifySkillLock(skillsDir, lock) {
    const warnings = [];
    for (const [relativePath, entry] of Object.entries((lock && lock.skills) || {})) {
        const skillPath = path.join(skillsDir, ...relativePath.replace(/\\/g, '/').split('/'));
        if (!fs.existsSync(skillPath)) {
            warnings.push(`${relativePath}: file not found`);
            continue;
        }
        const actual = crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex').toLowerCase();
        const expected = String(entry.sha256 || '').toLowerCase();
        if (actual !== expected)
            warnings.push(`${relativePath}: hash mismatch`);
    }
    return { allMatch: warnings.length === 0, warnings };
}
export { findSuperpowersSkills, listLockMajors, locateSuperpowers, parseMajorVersion, selectLockFile, verifySkillLock, };
//# sourceMappingURL=discovery.js.map