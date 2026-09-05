import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
