import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

interface SkillLockEntry {
    sha256?: string;
}

interface SkillLock {
    skills?: Record<string, SkillLockEntry>;
}

function parseMajorVersion(version: unknown): string | null {
    if (typeof version !== 'string' || !/^\d+(?:\.\d+){0,2}$/.test(version)) return null;
    return version.split('.')[0] as string;
}

function selectLockFile(templateDir: string, major: string | null): string | null {
    const matching = major ? path.join(templateDir, `skills.lock.v${major}.json`) : null;
    if (matching && fs.existsSync(matching)) return matching;

    const fallback = fs.readdirSync(templateDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^skills\.lock\.v[^/]+\.json$/.test(entry.name))
        .map(entry => entry.name)
        .sort()[0];
    return fallback ? path.join(templateDir, fallback) : null;
}

function findSkillsBelow(rootDir: string): string | null {
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

function findSuperpowersSkills(packagesDir: string): string | null {
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

function verifySkillLock(skillsDir: string, lock: SkillLock | null | undefined): { allMatch: boolean; warnings: string[] } {
    const warnings: string[] = [];
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

export {
    findSuperpowersSkills,
    parseMajorVersion,
    selectLockFile,
    verifySkillLock,
};