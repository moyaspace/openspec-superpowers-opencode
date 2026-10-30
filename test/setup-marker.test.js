import { mergeMarker } from '../dist/setup/merge.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MARKER = '<!-- managed -->';
const MANAGED = `${MARKER}\nnew content\n${MARKER}\n`;

describe('mergeMarker', () => {
    it('creates the managed content when the target does not exist', () => {

        assert.deepEqual(mergeMarker({ existing: null, managed: MANAGED, marker: MARKER }), {
            action: 'create',
            content: MANAGED,
        });
    });

    it('appends managed content after an unmanaged file', () => {

        const result = mergeMarker({ existing: 'user content\n', managed: MANAGED, marker: MARKER });

        assert.equal(result.action, 'append');
        assert.equal(result.content, `user content\n\n${MANAGED}`);
    });

    it('replaces one complete managed section when approved', () => {
        const existing = `before\n${MARKER}\nold\n${MARKER}\nafter\n`;

        const result = mergeMarker({ existing, managed: MANAGED, marker: MARKER, decision: 'yes' });

        assert.equal(result.action, 'replace');
        assert.equal(result.content, `before\n${MANAGED.trimEnd()}\nafter\n`);
    });

    it('rejects an incomplete managed section', () => {

        assert.throws(
            () => mergeMarker({ existing: `${MARKER}\npartial`, managed: MANAGED, marker: MARKER }),
            /incomplete managed marker/i,
        );
    });

    it('replaces only the marker block when the managed document has text around the markers', () => {
        const managed = `---\nfront\n---\n${MARKER}\nbody\n${MARKER}\ntail\n`;
        const existing = `---\nfront\n---\n${MARKER}\nold body\n${MARKER}\ntail\n`;

        const first = mergeMarker({ existing, managed, marker: MARKER, decision: 'yes' });

        assert.equal(first.action, 'replace');
        assert.ok(first.content.startsWith('---\nfront\n---\n'), 'target preamble must be preserved');
        assert.equal(first.content.includes('old body'), false, 'old managed body must be replaced');
        assert.equal(first.content.split('---\nfront\n---\n').length - 1, 1, 'managed preamble must not be duplicated');
        assert.ok(first.content.endsWith('tail\n'), 'target trailing content must be preserved');

        const second = mergeMarker({ existing: first.content, managed, marker: MARKER, decision: 'yes' });

        assert.equal(second.content, first.content, 'replacing twice must be idempotent');
    });

    it('rejects a managed document without a complete marker pair when replacing', () => {
        const existing = `before\n${MARKER}\nold\n${MARKER}\nafter\n`;

        assert.throws(
            () => mergeMarker({ existing, managed: `no markers here\n${MARKER}\n`, marker: MARKER, decision: 'yes' }),
            /incomplete managed marker section in managed content/i,
        );
    });
});
