const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

describe('Superpowers discovery', () => {
    it('parses a semantic version major', () => {
        const { parseMajorVersion } = require('../lib/setup/discovery');

        assert.equal(parseMajorVersion('6.1.1'), '6');
        assert.equal(parseMajorVersion('6-beta'), null);
    });

    it('selects the matching lock and otherwise falls back deterministically', (t) => {
        const { selectLockFile } = require('../lib/setup/discovery');
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-lock-'));
        t.after(() => fs.rmSync(templateDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v6.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v5.json'), '{}');

        assert.equal(selectLockFile(templateDir, '6'), path.join(templateDir, 'skills.lock.v6.json'));
        assert.equal(selectLockFile(templateDir, '7'), path.join(templateDir, 'skills.lock.v5.json'));
    });

    it('chooses the first valid skills directory in deterministic order', (t) => {
        const { findSuperpowersSkills } = require('../lib/setup/discovery');
        const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-cache-'));
        t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }));
        for (const packageName of ['superpowers@z', 'superpowers@a']) {
            fs.mkdirSync(path.join(cacheDir, packageName, 'node_modules', 'superpowers', 'skills'), { recursive: true });
        }

        assert.equal(
            findSuperpowersSkills(cacheDir),
            path.join(cacheDir, 'superpowers@a', 'node_modules', 'superpowers', 'skills'),
        );
    });

    it('reports lock hash mismatches as warnings without throwing', (t) => {
        const { verifySkillLock } = require('../lib/setup/discovery');
        const skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-skills-'));
        t.after(() => fs.rmSync(skillsDir, { recursive: true, force: true }));
        const skillPath = path.join(skillsDir, 'brainstorming', 'SKILL.md');
        fs.mkdirSync(path.dirname(skillPath), { recursive: true });
        fs.writeFileSync(skillPath, 'skill content');
        const correctHash = crypto.createHash('sha256').update('skill content').digest('hex');

        assert.deepEqual(verifySkillLock(skillsDir, {
            skills: { 'brainstorming/SKILL.md': { sha256: correctHash } },
        }), { allMatch: true, warnings: [] });
        const mismatch = verifySkillLock(skillsDir, {
            skills: { 'brainstorming/SKILL.md': { sha256: 'bad-hash' } },
        });
        assert.equal(mismatch.allMatch, false);
        assert.equal(mismatch.warnings.length, 1);
    });
});
