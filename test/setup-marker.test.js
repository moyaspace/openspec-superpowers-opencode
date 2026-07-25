const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MARKER = '<!-- managed -->';
const MANAGED = `${MARKER}\nnew content\n${MARKER}\n`;

describe('mergeMarker', () => {
    it('creates the managed content when the target does not exist', () => {
        const { mergeMarker } = require('../lib/setup/merge');

        assert.deepEqual(mergeMarker({ existing: null, managed: MANAGED, marker: MARKER }), {
            action: 'create',
            content: MANAGED,
        });
    });

    it('appends managed content after an unmanaged file', () => {
        const { mergeMarker } = require('../lib/setup/merge');

        const result = mergeMarker({ existing: 'user content\n', managed: MANAGED, marker: MARKER });

        assert.equal(result.action, 'append');
        assert.equal(result.content, `user content\n\n${MANAGED}`);
    });

    it('replaces one complete managed section when approved', () => {
        const { mergeMarker } = require('../lib/setup/merge');
        const existing = `before\n${MARKER}\nold\n${MARKER}\nafter\n`;

        const result = mergeMarker({ existing, managed: MANAGED, marker: MARKER, decision: 'yes' });

        assert.equal(result.action, 'replace');
        assert.equal(result.content, `before\n${MANAGED.trimEnd()}\nafter\n`);
    });

    it('rejects an incomplete managed section', () => {
        const { mergeMarker } = require('../lib/setup/merge');

        assert.throws(
            () => mergeMarker({ existing: `${MARKER}\npartial`, managed: MANAGED, marker: MARKER }),
            /incomplete managed marker/i,
        );
    });
});
