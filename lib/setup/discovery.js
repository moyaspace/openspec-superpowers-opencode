const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function parseMajorVersion(version) {
    if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(version)) return null;
    return version.split('.')[0];
}

function selectLockFile(templateDir, major) {
    const matching = major ? path.join(templateDir, `skills.lock.v${major}.json`) : null;
    if (matching && fs.existsSync(matching)) return matching;

    const fallback = fs.readdirSync(templateDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^skills\.lock\.v[^/]+\.json$/.test(entry.name))
        .map(entry => entry.name)
        .sort()[0];
    return fallback ? path.join(templateDir, fallback) : null;
}

function findSkillsBelow(rootDir) {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true }).sort((a, b) => (
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    ));
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(rootDir, entry.name);
        if (
            entry.name === 'skills'
            && path.basename(path.dirname(candidate)) === 'superpowers'
            && path.basename(path.dirname(path.dirname(candidate))) === 'node_modules'
        ) {
            return candidate;
        }
        const nested = findSkillsBelow(candidate);
        if (nested) return nested;
    }
    return null;
}

function findSuperpowersSkills(packagesDir) {
    if (!fs.existsSync(packagesDir)) return null;
    const packageEntries = fs.readdirSync(packagesDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name.startsWith('superpowers@'))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of packageEntries) {
        const found = findSkillsBelow(path.join(packagesDir, entry.name));
        if (found) return found;
    }
    return null;
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
        if (actual !== expected) warnings.push(`${relativePath}: hash mismatch`);
    }
    return { allMatch: warnings.length === 0, warnings };
}

module.exports = {
    findSuperpowersSkills,
    parseMajorVersion,
    selectLockFile,
    verifySkillLock,
};
