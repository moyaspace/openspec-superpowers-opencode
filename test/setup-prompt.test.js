const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('setup prompt decisions', () => {
    it('normalizes yes and no overrides case-insensitively', () => {
        const { normalizeOverride } = require('../lib/setup/prompt');

        assert.equal(normalizeOverride('YES'), 'yes');
        assert.equal(normalizeOverride('No'), 'no');
    });

    it('only accepts ask when the decision supports it', () => {
        const { normalizeOverride } = require('../lib/setup/prompt');

        assert.equal(normalizeOverride('ask'), null);
        assert.equal(normalizeOverride('ASK', { allowAsk: true }), 'ask');
    });

    it('falls back to the injected prompt for an invalid override', async () => {
        const { resolveDecision } = require('../lib/setup/prompt');
        const prompts = [];

        const decision = await resolveDecision({
            override: 'invalid',
            prompt: async question => {
                prompts.push(question);
                return 'y';
            },
            question: 'Continue?',
        });

        assert.equal(decision, 'yes');
        assert.deepEqual(prompts, ['Continue?']);
    });
});
