import { parseMajorVersion, selectLockFile, findSuperpowersSkills, verifySkillLock, listLockMajors } from '../dist/setup/discovery.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Superpowers discovery', () => {
    it('parses a semantic version major', () => {

        assert.equal(parseMajorVersion('6.1.1'), '6');
        assert.equal(parseMajorVersion('6-beta'), null);
    });

    it('selects the exact major lock', (t) => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-lock-'));
        t.after(() => fs.rmSync(templateDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v5.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v6.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v7.json'), '{}');

        assert.equal(selectLockFile(templateDir, '6'), path.join(templateDir, 'skills.lock.v6.json'));
        assert.equal(selectLockFile(templateDir, '7'), path.join(templateDir, 'skills.lock.v7.json'));
    });

    it('returns no lock when the major is unsupported', (t) => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-lock-'));
        t.after(() => fs.rmSync(templateDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v5.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v6.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v7.json'), '{}');

        assert.equal(selectLockFile(templateDir, '8'), null);
        assert.equal(selectLockFile(templateDir, '4'), null);
        assert.equal(selectLockFile(templateDir, null), null);
    });

    it('lists lock majors in numeric ascending order', (t) => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-majors-'));
        t.after(() => fs.rmSync(templateDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v10.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v2.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.v7.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'other.json'), '{}');
        fs.writeFileSync(path.join(templateDir, 'skills.lock.vbeta.json'), '{}');

        assert.deepEqual(listLockMajors(templateDir), ['2', '7', '10']);
    });

    it('returns no lock majors for a missing template dir', (t) => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-majors-'));
        t.after(() => fs.rmSync(templateDir, { recursive: true, force: true }));

        assert.deepEqual(listLockMajors(path.join(templateDir, 'absent')), []);
    });

    it('chooses the first valid skills directory in deterministic order', (t) => {
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
