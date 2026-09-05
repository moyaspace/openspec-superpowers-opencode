import { runSetupCommand } from '../dist/setup/cli-adapter.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('setup CLI adapter', () => {
    it('routes setup commands to the matching API and maps success', async () => {
        const calls = [];
        const api = {
            initProject: async options => calls.push(['init', options]),
            resetProject: async options => calls.push(['reset', options]),
            dryRunProject: async options => calls.push(['dry-run', options]),
        };

        const result = await runSetupCommand('dry-run', { targetDir: 'project', lang: 'zh-CN' }, api);

        assert.equal(result.code, 0);
        assert.deepEqual(calls, [['dry-run', { targetDir: 'project', lang: 'zh-CN' }]]);
    });

    it('maps a structured setup failure to exit code 1', async () => {
        const api = { initProject: async () => ({ success: false }) };

        const result = await runSetupCommand('init', {}, api);

        assert.equal(result.code, 1);
    });
});
