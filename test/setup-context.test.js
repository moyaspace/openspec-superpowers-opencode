import { createContext } from '../dist/setup/context.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('createContext', () => {
    it('rejects unsupported language values', () => {

        assert.throws(() => createContext({ lang: 'fr' }), /unsupported language/i);
    });

    it('treats a non-empty existing project without OpenSpec as brownfield', (t) => {
        const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-existing-'));
        t.after(() => fs.rmSync(targetDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), 'user instructions');

        const context = createContext({ targetDir });

        assert.equal(context.projectKind, 'brownfield');
    });
});
