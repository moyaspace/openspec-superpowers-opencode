const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('createContext', () => {
    it('rejects unsupported language values', () => {
        const { createContext } = require('../lib/setup/context');

        assert.throws(() => createContext({ lang: 'fr' }), /unsupported language/i);
    });

    it('treats a non-empty existing project without OpenSpec as brownfield', (t) => {
        const { createContext } = require('../lib/setup/context');
        const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-existing-'));
        t.after(() => fs.rmSync(targetDir, { recursive: true, force: true }));
        fs.writeFileSync(path.join(targetDir, 'AGENTS.md'), 'user instructions');

        const context = createContext({ targetDir });

        assert.equal(context.projectKind, 'brownfield');
    });
});
