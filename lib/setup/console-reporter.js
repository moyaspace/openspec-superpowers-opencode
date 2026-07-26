const C = {
    blue: '\x1b[34m',
    boldBlue: '\x1b[34;1m',
    boldCyan: '\x1b[36;1m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m',
    default: '',
    reset: '\x1b[0m',
};

function stripColors(text) {
    return text.replace(/\x1b\[\d+(?:;\d+)*m/g, '');
}

function colored(color, text) {
    return `${C[color] || ''}${text}${C.reset}`;
}

function createConsoleReporter(options = {}) {
    const dryRun = options.mode === 'dry-run';
    const prefix = dryRun ? '[DRY-RUN] ' : '';
    const noColor = options.noColor || false;

    function out(color, text) {
        const line = `${prefix}${text}`;
        console.log(noColor ? stripColors(line) : colored(color, line));
    }

    return {
        milestone(text) {
            out('boldBlue', '\u2713 ' + text);
        },
        blank() {
            console.log('');
        },
        banner(text) {
            console.log('');
            out('boldCyan', `=== ${text} ===`);
        },
        step(n, total, label) {
            out('boldCyan', `[${n}/${total}] ${label}...`);
        },
        pass(item, detail) {
            const d = detail ? `: ${detail}` : '';
            out('blue', `  \u2713 ${item}${d}`);
        },
        fail(item, detail) {
            const d = detail ? `: ${detail}` : '';
            out('yellow', `  \u2717 ${item}${d}`);
        },
        warn(item, detail) {
            const d = detail ? `: ${detail}` : '';
            out('yellow', `  \u26a0 ${item}${d}`);
        },
        info(text) {
            out('default', `  ${text}`);
        },
        action(text) {
            out('default', `  ${text}`);
        },
        section(label) {
            console.log('');
            out('boldCyan', `--- ${label} ---`);
        },
        done(label) {
            console.log('');
            out('boldCyan', `=== ${label} ===`);
            console.log('');
        },
        raw(text) {
            out('default', text);
        },
        bannerInit() {
            console.log('');
            out('boldCyan', '='.repeat(50));
            out('boldCyan', '  🎉 Init complete');
            out('boldCyan', '='.repeat(50));
        },
        decision(question, answer) {
            out('default', `  ${question} → ${answer}`);
        },
        dryRunCancel() {
            out('yellow', '  已取消');
        },
    };
}

function progressFromReporter(reporter) {
    return (event) => {
        switch (event.type) {
            case 'step': reporter.step(event.n, event.total, event.label); break;
            case 'pass': reporter.pass(event.item, event.detail); break;
            case 'fail': reporter.fail(event.item, event.detail); break;
            case 'warn': reporter.warn(event.item, event.detail); break;
            case 'info': reporter.info(event.text); break;
            case 'action': reporter.action(event.text); break;
            case 'section': reporter.section(event.label); break;
            case 'done': reporter.done(event.label); break;
            case 'decision': reporter.decision(event.question, event.answer); break;
            case 'dry-run-cancel': reporter.dryRunCancel(); break;
            case 'dir-created': reporter.pass('Directory created'); break;
            case 'banner': reporter.banner(event.text); break;
            case 'milestone': reporter.milestone(event.text); break;
            case 'blank': reporter.blank(); break;
            case 'raw': reporter.raw(event.text); break;
            case 'banner-init': reporter.bannerInit(); break;
        }
    };
}

module.exports = { createConsoleReporter, progressFromReporter };
