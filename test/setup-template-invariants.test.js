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
        if (!command || command.startsWith('#')) {
            continue;
        }
        commands.push(command);
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

    it('template/.opencode/commands ships exactly 13 command files', () => {
        const files = fs.readdirSync(COMMANDS_DIR).filter((name) => name.endsWith('.md'));
        assert.equal(
            files.length,
            13,
            `expected 13 command markdown files in template/.opencode/commands, found ${files.length}: ${files.join(', ')}`,
        );
    });

    it('no command uses the Claude Code tool name AskUserQuestion', () => {
        const files = fs.readdirSync(COMMANDS_DIR).filter((name) => name.endsWith('.md'));
        const offenders = files.filter((name) => readCommand(name).includes('AskUserQuestion'));
        assert.deepEqual(
            offenders,
            [],
            'these template commands use the Claude Code tool name AskUserQuestion; '
                + 'OpenCode/OMO exposes the same capability as the question tool: '
                + offenders.join(', '),
        );
    });
});

describe('opsx-apply.md detects an existing worktree before creating one', () => {
    it('Step 2 starts with `git worktree list`, not `ensure-worktree`', () => {
        const content = readCommand('opsx-apply.md');
        const step2 = sectionOf('opsx-apply.md', content, '### Step 2:', '### Step 3:');
        assert.ok(
            step2.includes('git worktree list'),
            'opsx-apply.md: Step 2 must check `git worktree list` first',
        );
        const commands = fencedCommands(step2);
        assert.equal(
            commands[0],
            'git worktree list',
            `opsx-apply.md: Step 2 first fenced command must be "git worktree list", got ${JSON.stringify(commands)}`,
        );
        assert.equal(
            commands.includes('openspec-superpowers-opencode ensure-worktree <name>'),
            false,
            'opsx-apply.md: Step 2 must not list ensure-worktree as a standalone fenced first step',
        );
    });

    it('Step 2 forbids ensure-worktree when the target is already listed', () => {
        const content = readCommand('opsx-apply.md');
        const step2 = sectionOf('opsx-apply.md', content, '### Step 2:', '### Step 3:');
        assert.ok(
            /MUST NOT[^\n]*ensure-worktree/.test(step2)
                || /ensure-worktree[^\n]*MUST NOT/.test(step2),
            'opsx-apply.md: Step 2 must forbid calling ensure-worktree for an already-listed worktree',
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

    it('keeps the Step 4.5 contract sections and the v6+ delegation bodies', () => {
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

        const step5Body = sectionOf('opsx-apply.md', content, '### Step 5', '### Step 6');
        assert.ok(
            step5Body.includes('严格按')
                && (step5Body.includes('SKILL.md') || step5Body.includes('references/batching.md')),
            'opsx-apply.md: Step 5 v6+ branch must delegate to SKILL.md (严格按 … SKILL.md) '
                + 'instead of re-implementing the task loop',
        );

        const step6Body = sectionOf('opsx-apply.md', content, '### Step 6', '### Step 7');
        assert.ok(
            step6Body.includes('不另起一套审查流程') || step6Body.includes('SKILL.md §3'),
            'opsx-apply.md: Step 6 v6+ branch must delegate the review to SKILL.md §3 '
                + '(不另起一套审查流程)',
        );
    });

    it('defines the CC / OMO abbreviations where they are first used', () => {
        const content = readCommand('opsx-apply.md');
        assert.ok(
            !content.includes('[CC]'),
            'opsx-apply.md must not use the undefined [CC] abbreviation; '
                + 'write Claude Code（下称 CC） instead',
        );
        assert.ok(
            content.includes('Claude Code（下称 CC）') && content.includes('Oh My OpenCode（下称 OMO）'),
            'opsx-apply.md must define Claude Code（下称 CC） and Oh My OpenCode（下称 OMO） '
                + 'before the mapping table uses them',
        );
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

describe('opsx-ff.md converges from any state', () => {
    it('Step 4 gates creation behind `test -d`', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        assert.ok(
            step4.includes('test -d openspec/changes/<name>'),
            'opsx-ff.md: Step 4 must check `test -d openspec/changes/<name>`',
        );
        const commands = fencedCommands(step4);
        assert.equal(
            commands[0],
            'test -d openspec/changes/<name>',
            `opsx-ff.md: Step 4 first fenced command must be the existence check, got ${JSON.stringify(commands)}`,
        );
    });

    it('Step 4 does not run `openspec new change` unconditionally', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        const commands = fencedCommands(step4);
        assert.ok(
            commands.includes('openspec new change "<name>"'),
            'opsx-ff.md: Step 4 must still create the change when missing',
        );
        assert.notEqual(
            commands[0],
            'openspec new change "<name>"',
            'opsx-ff.md: creation must be behind the existence check',
        );
        assert.ok(step4.includes('不存在'), 'opsx-ff.md: Step 4 must branch on the missing case');
    });

    it('Step 4 forbids `openspec list` and archive checks', () => {
        const content = readCommand('opsx-ff.md');
        const step4 = sectionOf('opsx-ff.md', content, '### Step 4', '#### Step 4a');
        assert.equal(
            fencedCommands(step4).some((command) => command.includes('openspec list')),
            false,
            'opsx-ff.md: Step 4 must not run `openspec list` as an existence check',
        );
        assert.equal(
            step4.includes('test -d openspec/changes/archive'),
            false,
            'opsx-ff.md: Step 4 must not test archived changes',
        );
    });

    it('Step 6 guards the commit with `git diff --cached --quiet`', () => {
        const content = readCommand('opsx-ff.md');
        const step6 = sectionOf('opsx-ff.md', content, '### Step 6', '### Output');
        assert.ok(
            step6.includes('git diff --cached --quiet'),
            'opsx-ff.md: Step 6 must skip the commit when nothing is staged',
        );
        assert.equal(
            step6.includes('git add -A && git commit'),
            false,
            'opsx-ff.md: Step 6 must not chain `git add -A && git commit`',
        );
    });

    it('Step 5 tops up only unfinished artifacts and defines the skipped count', () => {
        const content = readCommand('opsx-ff.md');
        const step5 = sectionOf('opsx-ff.md', content, '### Step 5', '### Step 6');
        assert.ok(
            step5.includes('每轮处理后重新读取'),
            'opsx-ff.md: Step 5 must re-read status after each artifact',
        );
        assert.ok(
            step5.includes('只处理 `status` 为 `"ready"` 的 artifacts'),
            'opsx-ff.md: Step 5 must drive the loop from every artifact that is `ready`',
        );
        assert.equal(
            step5.includes('`design`'),
            false,
            'opsx-ff.md: Step 5 must not exclude `design` by name — only post-apply artifacts may be excluded',
        );
        assert.ok(
            step5.includes('`requires` 链包含 `applyRequires`'),
            'opsx-ff.md: Step 5 must exclude post-apply artifacts by their `requires` chain',
        );
        assert.ok(
            step5.includes('（`verify`、`retrospective`）'),
            'opsx-ff.md: Step 5 must exclude exactly `verify` and `retrospective`, not an open-ended list',
        );
        assert.ok(
            step5.includes('`dependencies` 递归展开'),
            'opsx-ff.md: Step 5 must name the data source for the `requires` chain',
        );
        assert.ok(
            step5.includes('不含 artifact 自身'),
            'opsx-ff.md: Step 5 must exclude the artifact itself from its own `requires` chain',
        );
        assert.ok(
            step5.includes('没有可处理的 artifact 时'),
            'opsx-ff.md: Step 5 must stop only when no artifact remains processable',
        );
        assert.ok(
            step5.includes('循环直到没有可处理的 artifact'),
            'opsx-ff.md: step 5e must terminate when nothing is processable, not when applyRequires is done',
        );
        assert.ok(
            step5.includes('不得生成'),
            'opsx-ff.md: Step 5 must forbid generating post-apply artifacts',
        );
        assert.ok(
            step5.includes('不得重建'),
            'opsx-ff.md: Step 5 must forbid rebuilding already-done artifacts',
        );
        const output = sectionOf('opsx-ff.md', content, '### Output', '### Artifact Creation Guidelines');
        assert.ok(
            output.includes('本次跳过'),
            'opsx-ff.md: Output must report the skipped count',
        );
        assert.ok(
            output.includes('为 `done` 的数量'),
            'opsx-ff.md: Output must define where the skipped count comes from',
        );
        const step6 = sectionOf('opsx-ff.md', content, '### Step 6', '### Output');
        assert.ok(
            step6.includes('若 `git commit` 失败'),
            'opsx-ff.md: Step 6 must stop and report when the commit itself fails',
        );
    });
});

describe('creating commands stop on an occupied name', () => {
    it('propose Step 4 and new Step 5 both check `test -d` first', () => {
        const propose = readCommand('opsx-propose.md');
        const proposeStep4 = sectionOf('opsx-propose.md', propose, '### Step 4', '#### Step 4a');
        assert.ok(
            proposeStep4.includes('test -d openspec/changes/<name>'),
            'opsx-propose.md: Step 4 must check `test -d openspec/changes/<name>`',
        );
        assert.ok(proposeStep4.includes('/opsx-continue'), 'opsx-propose.md: must offer /opsx-continue');
        assert.ok(proposeStep4.includes('/opsx-ff'), 'opsx-propose.md: must offer /opsx-ff');
        assert.equal(
            fencedCommands(proposeStep4).some((command) => command.includes('openspec list')),
            false,
            'opsx-propose.md: Step 4 must not run `openspec list` as an existence check',
        );

        const newCmd = readCommand('opsx-new.md');
        const newStep5 = sectionOf('opsx-new.md', newCmd, '### Step 5', '#### Step 5a');
        assert.ok(
            newStep5.includes('test -d openspec/changes/<name>'),
            'opsx-new.md: Step 5 must check `test -d openspec/changes/<name>`',
        );
        assert.ok(newStep5.includes('/opsx-continue'), 'opsx-new.md: must offer /opsx-continue');
        assert.ok(newStep5.includes('/opsx-ff'), 'opsx-new.md: must offer /opsx-ff');
        assert.ok(
            newStep5.includes('失败（exit 1）→ 停下报告'),
            'opsx-new.md: Step 5 must stop and report when creation fails',
        );
        assert.ok(
            newStep5.includes('不得覆盖已有 change'),
            'opsx-new.md: Step 5 must forbid overwriting the existing change',
        );
        assert.ok(
            proposeStep4.includes('不得重试'),
            'opsx-propose.md: Step 4 creation failure must forbid retry and manual mkdir',
        );
        assert.ok(
            newStep5.includes('不得重试'),
            'opsx-new.md: Step 5 creation failure must forbid retry and manual mkdir',
        );
        assert.ok(
            proposeStep4.includes('未创建、未覆盖任何 change'),
            'opsx-propose.md: Step 4 abort must describe the side effects accurately',
        );
        assert.ok(
            newStep5.includes('未创建、未覆盖任何 change'),
            'opsx-new.md: Step 5 abort must describe the side effects accurately',
        );
        assert.ok(
            proposeStep4.includes('cd <project-root>'),
            'opsx-propose.md: Step 4 abort must return to the project root',
        );
        assert.ok(
            newStep5.includes('cd <project-root>'),
            'opsx-new.md: Step 5 abort must return to the project root',
        );
        assert.equal(
            newStep5.includes('openspec list'),
            false,
            'opsx-new.md: Step 5 must not use `openspec list` as an existence check',
        );
    });
});

describe('opsx template commands validate worktree placement before copying', () => {
    for (const [file, startMarker, endMarker] of [
        ['opsx-propose.md', '### Step 3', '### Step 4'],
        ['opsx-ff.md', '### Step 3', '### Step 4'],
        ['opsx-new.md', '### Step 4', '### Step 5'],
    ]) {
        it(`${file} ${startMarker} carries the cd guard, read-only checks, and copy retry bound`, () => {
            const content = readCommand(file);
            const body = sectionOf(file, content, startMarker, endMarker);
            for (const needle of [
                'git rev-parse --show-toplevel',
                'git rev-parse --abbrev-ref HEAD',
                'pwd -P',
                'feature/<name>',
                'cd .worktrees/<name> ||',
                '最多重试 1 次',
            ]) {
                assert.ok(
                    body.includes(needle),
                    `${file}: ${startMarker} must contain \`${needle}\``,
                );
            }
            assert.ok(
                body.includes('exit 1'),
                `${file}: ${startMarker} must stop with \`exit 1\``,
            );
        });
    }
});

const SCHEMA_RELATIVE = path.join(
    'openspec',
    'schemas',
    'superpowers-bridge-opencode',
    'schema.yaml',
);
const TEMPLATE_SCHEMA_PATH = path.join(TEMPLATE_DIR, SCHEMA_RELATIVE);
// The repository's self-hosted copy is gitignored (`.gitignore:44`), so a clean
// checkout / CI may not have it. Assert when present, skip when absent.
const REPO_SCHEMA_PATH = path.join(__dirname, '..', SCHEMA_RELATIVE);

const VERIFY_SECTION_START = '  - id: verify';
const VERIFY_SECTION_END = '  - id: retrospective';

function readVerifySection(file) {
    assert.ok(fs.existsSync(file), `missing schema file: ${file}`);
    const content = fs.readFileSync(file, 'utf8');
    return sectionOf(file, content, VERIFY_SECTION_START, VERIFY_SECTION_END);
}

function assertVerifyBaseline(file) {
    const body = readVerifySection(file);
    for (const needle of [
        'openspec list --json',
        'baseBranch',
        'git log --oneline "$base"..HEAD | wc -l',
        'baseline: origin/main (registry had no baseBranch)',
    ]) {
        assert.ok(
            body.includes(needle),
            `${file}: verify PRECHECK must contain \`${needle}\``,
        );
    }
    assert.equal(
        body.includes('git merge-base HEAD origin/main'),
        false,
        `${file}: verify PRECHECK must not use \`git merge-base HEAD origin/main\` as its primary path`,
    );
    return body;
}

describe('verify artifact derives commit evidence from the change baseBranch', () => {
    it('template schema.yaml verify PRECHECK uses baseBranch and the annotated fallback', () => {
        assertVerifyBaseline(TEMPLATE_SCHEMA_PATH);
    });

    it('repository schema.yaml verify PRECHECK matches the template copy when present', (t) => {
        if (!fs.existsSync(REPO_SCHEMA_PATH)) {
            t.skip(`repository schema copy absent (gitignored): ${REPO_SCHEMA_PATH}`);
            return;
        }
        const repoBody = assertVerifyBaseline(REPO_SCHEMA_PATH);
        const templateBody = readVerifySection(TEMPLATE_SCHEMA_PATH);
        assert.equal(
            repoBody.replace(/\r\n/g, '\n'),
            templateBody.replace(/\r\n/g, '\n'),
            'repository and template verify sections must stay identical (line endings ignored)',
        );
    });
});