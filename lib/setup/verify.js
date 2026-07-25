const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function parseTemplateOutput(stdout) {
    try {
        const parsed = JSON.parse(stdout);
        const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
        const count = entries.filter(template => template && template.source === 'project').length;
        return { ok: count >= 8, count };
    } catch {
        return { ok: false, count: 0 };
    }
}

function changeListed(stdout, changeName) {
    try {
        const parsed = JSON.parse(stdout);
        const changes = parsed.changes || parsed || [];
        return Array.isArray(changes) && changes.some(change => (
            typeof change === 'string' ? change === changeName : change && change.name === changeName
        ));
    } catch {
        return stdout.includes(changeName);
    }
}

function parseStatusOutput(stdout, minimum = 8) {
    try {
        const parsed = JSON.parse(stdout);
        const artifacts = parsed.artifacts || [];
        return { ok: Array.isArray(artifacts) && artifacts.length >= minimum, count: artifacts.length };
    } catch {
        const count = stdout.split('\n').filter(line => line.trimStart().startsWith('[')).length;
        return { ok: count >= minimum, count };
    }
}

function requireSuccess(result, phase) {
    if (!result || result.code !== 0) {
        const error = new Error(`${phase} failed${result && result.stderr ? `: ${result.stderr.trim()}` : ''}`);
        error.phase = phase;
        throw error;
    }
    return result;
}

async function verifyProject(options) {
    const { runner, targetDir } = options;
    const uniquePart = options.uniquePart
        ? options.uniquePart()
        : `${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const changeName = `oso-verify-${uniquePart}`;
    let created = false;

    const cleanup = options.cleanup || (name => {
        fs.rmSync(path.join(targetDir, 'openspec', 'changes', name), { recursive: true, force: true });
    });

    try {
        requireSuccess(runner.run('openspec', ['schema', 'validate', 'superpowers-bridge-opencode'], { cwd: targetDir }), 'schema-validation');

        const templates = requireSuccess(
            runner.run('openspec', ['templates', '--json', '--schema', 'superpowers-bridge-opencode'], { cwd: targetDir }),
            'template-list',
        );
        if (!parseTemplateOutput(templates.stdout).ok) throw new Error('template-list returned fewer than 8 project templates');

        requireSuccess(runner.run('openspec', ['new', 'change', changeName], { cwd: targetDir }), 'change-create');
        created = true;

        const list = requireSuccess(runner.run('openspec', ['list', '--json'], { cwd: targetDir }), 'change-list');
        if (!changeListed(list.stdout, changeName)) throw new Error('created verification change is not listed');

        const status = requireSuccess(
            runner.run('openspec', ['status', '--change', changeName, '--json'], { cwd: targetDir }),
            'change-status',
        );
        if (!parseStatusOutput(status.stdout).ok) throw new Error('verification change has an incomplete artifact chain');

        requireSuccess(
            runner.run('openspec', ['instructions', 'brainstorm', '--change', changeName], { cwd: targetDir }),
            'brainstorm-instructions',
        );
        return { passed: true, changeName };
    } catch (error) {
        return { passed: false, changeName, error };
    } finally {
        if (created) await cleanup(changeName);
    }
}

module.exports = {
    changeListed,
    parseStatusOutput,
    parseTemplateOutput,
    verifyProject,
};
