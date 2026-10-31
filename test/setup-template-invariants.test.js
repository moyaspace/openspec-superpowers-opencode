import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_DIR = path.join(__dirname, '..', 'template');
const COMMANDS_DIR = path.join(TEMPLATE_DIR, '.opencode', 'commands');

// The lifecycle commands that must be base-branch agnostic.
const BASE_AWARE_COMMANDS = [
    'opsx-propose.md',
    'opsx-finish.md',
    'opsx-ff.md',
    'opsx-new.md',
    'opsx-continue.md',
    'opsx-apply.md',
];

const BASE_READ_COMMAND = 'git rev-parse --abbrev-ref HEAD';
// Matches `main` as a standalone word, but not `maintain`, `domain`, `main-branch`, etc.
const BARE_MAIN = /(?<![\w-])main(?![\w-])/;
// Operational git instruction that targets `main` (checked on backtick-stripped text).
const GIT_MAIN_OPERATION = /git\s+(?:checkout|switch|merge|rebase)\b[^\n]*(?<![\w-])main(?![\w-])/;

function readCommand(file) {
    const fullPath = path.join(COMMANDS_DIR, file);
    assert.ok(fs.existsSync(fullPath), `missing template command file: ${fullPath}`);
    return fs.readFileSync(fullPath, 'utf8');
}

// Drop inline-code spans so backticked mentions such as `main` do not count as bare tokens.
function stripInlineCode(text) {
    return text.replace(/`[^`]*`/g, '');
}

// Extract the slice between two markers, failing with the offending file name.
function sectionOf(file, content, startMarker, endMarker) {
    const start = content.indexOf(startMarker);
    assert.notEqual(
        start,
        -1,
        `${file}: expected section marker "${startMarker}" not found`,
    );
    const end = content.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(
        end,
        -1,
        `${file}: expected section end marker "${endMarker}" not found after "${startMarker}"`,
    );
    return content.slice(start, end);
}

// Collect executable lines from fenced code blocks, dropping comments and blanks.
function fencedCommands(body) {
    const commands = [];
    let inFence = false;
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (line.startsWith('```')) {
            inFence = !inFence;
            continue;
        }
        if (!inFence) {
            continue;
        }
        const command = line.replace(/\s+#.*$/, '').trim();
        if (command) {
            commands.push(command);
        }
    }
    return commands;
}

function assertBaseReadStep(file, content, startMarker, endMarker) {
    const body = sectionOf(file, content, startMarker, endMarker);
    assert.ok(
        body.includes(BASE_READ_COMMAND),
        `${file}: ${startMarker} must run \`${BASE_READ_COMMAND}\``,
    );
    assert.ok(
        body.includes('只读'),
        `${file}: ${startMarker} must be marked read-only (只读)`,
    );
    assert.ok(
        !body.includes('--base'),
        `${file}: ${startMarker} base-read step must not pass --base`,
    );
    const commands = fencedCommands(body);
    assert.deepEqual(
        commands,
        [BASE_READ_COMMAND],
        `${file}: ${startMarker} fenced commands must be exactly ["${BASE_READ_COMMAND}"], got ${JSON.stringify(commands)}`,
    );
}

function assertRegistryAddCarriesBase(file, content) {
    const line = content
        .split('\n')
        .find((candidate) => candidate.includes('registry add'));
    assert.ok(line, `${file}: missing "registry add" line`);
    assert.ok(
        line.includes('--base "<BASE_BRANCH>"'),
        `${file}: registry add must pass --base "<BASE_BRANCH>" (got: ${line.trim()})`,
    );
}

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

describe('opsx template commands are base-branch agnostic', () => {
    it('no command contains a bare `main` token', () => {
        // Sanity: the matcher must not flag longer identifiers.
        assert.equal(BARE_MAIN.test('maintain'), false, 'BARE_MAIN must not match "maintain"');
        assert.equal(BARE_MAIN.test('domain'), false, 'BARE_MAIN must not match "domain"');

        for (const file of BASE_AWARE_COMMANDS) {
            const stripped = stripInlineCode(readCommand(file));
            const matches = stripped.match(BARE_MAIN) || [];
            assert.equal(
                matches.length,
                0,
                `${file}: contains bare "main" token outside backticks; base handling must stay branch-agnostic`,
            );
        }
    });

    it('no command issues an operational git instruction targeting `main`', () => {
        for (const file of BASE_AWARE_COMMANDS) {
            const stripped = stripInlineCode(readCommand(file));
            const match = stripped.match(GIT_MAIN_OPERATION);
            assert.equal(
                match,
                null,
                `${file}: operational git instruction targets "main" (found: ${match && match[0].trim()})`,
            );
        }
    });

    it('opsx-propose.md reads the base read-only at 2d and registers it via --base', () => {
        const content = readCommand('opsx-propose.md');
        assertBaseReadStep('opsx-propose.md', content, '**2d. 读取 base', '### Step 3');
        assertRegistryAddCarriesBase('opsx-propose.md', content);
    });

    it('opsx-ff.md reads the base read-only at 2d and registers it via --base', () => {
        const content = readCommand('opsx-ff.md');
        assertBaseReadStep('opsx-ff.md', content, '**2d. 读取 base', '### Step 3');
        assertRegistryAddCarriesBase('opsx-ff.md', content);
    });

    it('opsx-new.md reads the base read-only at 3d and registers it via --base', () => {
        const content = readCommand('opsx-new.md');
        assertBaseReadStep('opsx-new.md', content, '**3d. 读取 base', '### Step 4');
        assertRegistryAddCarriesBase('opsx-new.md', content);
    });

    it('opsx-finish.md Step 6a reads the base from `openspec list --json` (baseBranch)', () => {
        const content = readCommand('opsx-finish.md');
        const step6a = sectionOf('opsx-finish.md', content, '**Step 6a:', '**Step 6b:');
        assert.ok(
            step6a.includes('openspec list --json'),
            'opsx-finish.md: Step 6a must read the base via `openspec list --json`',
        );
        assert.ok(
            step6a.includes('baseBranch'),
            'opsx-finish.md: Step 6a must consume the `baseBranch` field',
        );
        assert.equal(
            content.includes('通常是 main 或 master'),
            false,
            'opsx-finish.md: must not assume the base is "通常是 main 或 master"',
        );
        assert.equal(
            content.includes('oso-change-registry.json'),
            false,
            'opsx-finish.md: must not instruct reading oso-change-registry.json',
        );
    });

    it('opsx-finish.md keeps the portable Superpowers skill path and no machine-local paths', () => {
        const content = readCommand('opsx-finish.md');
        assert.ok(
            content.includes('{{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md'),
            'opsx-finish.md: must retain {{SUPERPOWERS_BASE_PATH}}finishing-a-development-branch/SKILL.md',
        );
        assert.equal(
            content.includes('C:\\Users'),
            false,
            'opsx-finish.md: must not contain a Windows machine-local path (C:\\Users)',
        );
        assert.equal(
            content.includes('/Users/'),
            false,
            'opsx-finish.md: must not contain a macOS machine-local path (/Users/)',
        );
    });

    it('opsx-new.md stays scaffold-only (no full-artifact generation)', () => {
        const content = readCommand('opsx-new.md');
        for (const forbidden of ['TodoWrite', '个 artifacts', 'Artifact Creation Guidelines']) {
            assert.equal(
                content.includes(forbidden),
                false,
                `opsx-new.md: scaffold-only command must not contain "${forbidden}"`,
            );
        }
    });

    it('template/.opencode/commands ships exactly 15 command files', () => {
        const files = fs.readdirSync(COMMANDS_DIR).filter((name) => name.endsWith('.md'));
        assert.equal(
            files.length,
            15,
            `expected 15 command markdown files in template/.opencode/commands, found ${files.length}: ${files.join(', ')}`,
        );
    });
});

describe('opsx-apply.md delegates the v6+ branch to upstream SDD', () => {
    it('dispatches implementers with the OMO task() syntax', () => {
        const content = readCommand('opsx-apply.md');
        assert.ok(
            content.includes('task(category="deep"'),
            'opsx-apply.md: delegation must dispatch via task(category="deep"',
        );
    });

    it('forbids copying the [CC] Subagent syntax', () => {
        const content = readCommand('opsx-apply.md');
        assert.ok(
            content.includes('Subagent (general-purpose)'),
            'opsx-apply.md: must name the forbidden Subagent (general-purpose) syntax',
        );
        assert.ok(
            content.includes('MUST NOT 照抄'),
            'opsx-apply.md: must forbid copying that syntax (MUST NOT 照抄)',
        );
    });

    it('runs the SDD scripts through `bash "<SUPERPOWERS_BASE_PATH>..."`', () => {
        const content = readCommand('opsx-apply.md');
        assert.ok(
            content.includes('bash "{{SUPERPOWERS_BASE_PATH}}'),
            'opsx-apply.md: script invocations must use bash "{{SUPERPOWERS_BASE_PATH}}...',
        );
        for (const script of ['task-brief', 'review-package', 'sdd-workspace']) {
            assert.ok(
                content.includes(`/scripts/${script}"`),
                `opsx-apply.md: must reference scripts/${script} as a quoted bash argument`,
            );
        }
    });

    it('keeps the three Step 4.5 contract sections before Step 5', () => {
        const content = readCommand('opsx-apply.md');
        const step45 = content.indexOf('### Step 4.5: v6+ 委托契约');
        const step5 = content.indexOf('### Step 5: 逐任务实现');
        assert.notEqual(step45, -1, 'opsx-apply.md: missing "### Step 4.5: v6+ 委托契约"');
        assert.notEqual(step5, -1, 'opsx-apply.md: missing "### Step 5: 逐任务实现"');
        assert.ok(
            step45 < step5,
            'opsx-apply.md: Step 4.5 must precede Step 5 so the mapping is read before dispatch',
        );
        for (const section of ['bash 调用写法', 'SDD → OMO 语法映射', 'tasks.md 勾选契约']) {
            assert.ok(
                content.includes(section),
                `opsx-apply.md: Step 4.5 must keep the "${section}" section`,
            );
        }
    });

    it('keeps the v5 branch (Read items and both review steps)', () => {
        const content = readCommand('opsx-apply.md');
        for (const marker of [
            '{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/spec-reviewer-prompt.md',
            '{{SUPERPOWERS_BASE_PATH}}subagent-driven-development/code-quality-reviewer-prompt.md',
            '**Superpowers v5 流程：**',
            '**Superpowers v5（两步审查）：**',
            '**Spec 审查**',
            '**代码质量审查**',
        ]) {
            assert.ok(content.includes(marker), `opsx-apply.md: v5 branch marker missing: ${marker}`);
        }
    });
});