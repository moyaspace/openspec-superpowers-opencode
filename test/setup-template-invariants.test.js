const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('managed template invariants', () => {
    for (const [file, marker] of [
        ['_AGENTS.md', '<!-- openspec-superpowers-opencode_instructions -->'],
        ['_gitignore', '# <!-- openspec-superpowers-opencode_gitignore -->'],
        ['_gitattributes', '# <!-- openspec-superpowers-opencode_gitattributes -->'],
        ['_editorconfig', '# <!-- openspec-superpowers-opencode_editorconfig -->'],
    ]) {
        it(`${file} contains exactly one managed marker pair`, () => {
            const content = fs.readFileSync(path.join(__dirname, '..', 'template', file), 'utf8');
            assert.equal(content.split(marker).length - 1, 2);
        });
    }
});
