import { normalizeOverride, resolveDecision } from '../dist/setup/prompt.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('setup prompt decisions', () => {
    it('normalizes yes and no overrides case-insensitively', () => {

        assert.equal(normalizeOverride('YES'), 'yes');
        assert.equal(normalizeOverride('No'), 'no');
    });

    it('only accepts ask when the decision supports it', () => {

        assert.equal(normalizeOverride('ask'), null);
        assert.equal(normalizeOverride('ASK', { allowAsk: true }), 'ask');
    });

    it('falls back to the injected prompt for an invalid override', async () => {
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
        assert.deepEqual(prompts, ['Continue? (y/N)']);
    });

    it('appends the accepted answers to the question', async () => {
        const prompts = [];

        await resolveDecision({
            prompt: async question => {
                prompts.push(question);
                return 'n';
            },
            question: 'Overwrite config.yaml?',
        });
        await resolveDecision({
            prompt: async question => {
                prompts.push(question);
                return 'n';
            },
            question: 'Overwrite commands?',
            allowAsk: true,
        });

        assert.deepEqual(prompts, ['Overwrite config.yaml? (y/N)', 'Overwrite commands? (y/n/a)']);
    });
});
