const C = {
    blue: '\x1b[34m',
    boldBlue: '\x1b[34;1m',
    boldCyan: '\x1b[36;1m',
    yellow: '\x1b[33m',
    gray: '\x1b[90m',
    default: '',
    reset: '\x1b[0m',
};

type ColorName = keyof typeof C;

interface ConsoleReporterOptions {
    mode?: string;
    noColor?: boolean;
}

interface SetupReporter {
    milestone(text: string): void;
    blank(): void;
    banner(text: string): void;
    step(n: number, total: number, label: string): void;
    pass(item: string, detail?: string): void;
    fail(item: string, detail?: string): void;
    warn(item: string, detail?: string): void;
    info(text: string): void;
    action(text: string): void;
    section(label: string): void;
    done(label: string): void;
    raw(text: string): void;
    bannerInit(): void;
    decision(question: string, answer: string): void;
    dryRunCancel(): void;
}

interface ProgressEvent {
    type: string;
    n?: number;
    total?: number;
    label?: string;
    item?: string;
    detail?: string;
    text?: string;
    question?: string;
    answer?: string;
}

function stripColors(text: string): string {
    return text.replace(/\x1b\[\d+(?:;\d+)*m/g, '');
}

function colored(color: ColorName, text: string): string {
    return `${C[color] || ''}${text}${C.reset}`;
}

function createConsoleReporter(options: ConsoleReporterOptions = {}): SetupReporter {
    const dryRun = options.mode === 'dry-run';
    const prefix = dryRun ? '[DRY-RUN] ' : '';
    const noColor = options.noColor || false;

    function out(color: ColorName, text: string): void {
        const line = `${prefix}${text}`;
        console.log(noColor ? stripColors(line) : colored(color, line));
    }

    return {
        milestone(text: string): void {
            out('boldBlue', '\u2713 ' + text);
        },
        blank(): void {
            console.log('');
        },
        banner(text: string): void {
            console.log('');
            out('boldCyan', `=== ${text} ===`);
        },
        step(n: number, total: number, label: string): void {
            out('boldCyan', `[${n}/${total}] ${label}...`);
        },
        pass(item: string, detail?: string): void {
            const d = detail ? `: ${detail}` : '';
            out('blue', `  \u2713 ${item}${d}`);
        },
        fail(item: string, detail?: string): void {
            const d = detail ? `: ${detail}` : '';
            out('yellow', `  \u2717 ${item}${d}`);
        },
        warn(item: string, detail?: string): void {
            const d = detail ? `: ${detail}` : '';
            out('yellow', `  \u26a0 ${item}${d}`);
        },
        info(text: string): void {
            out('default', `  ${text}`);
        },
        action(text: string): void {
            out('default', `  ${text}`);
        },
        section(label: string): void {
            console.log('');
            out('boldCyan', `--- ${label} ---`);
        },
        done(label: string): void {
            console.log('');
            out('boldCyan', `=== ${label} ===`);
            console.log('');
        },
        raw(text: string): void {
            out('default', text);
        },
        bannerInit(): void {
            console.log('');
            out('boldCyan', '='.repeat(50));
            out('boldCyan', '  🎉 Init complete');
            out('boldCyan', '='.repeat(50));
        },
        decision(question: string, answer: string): void {
            out('default', `  ${question} → ${answer}`);
        },
        dryRunCancel(): void {
            out('yellow', '  已取消');
        },
    };
}

function progressFromReporter(reporter: SetupReporter): (event: ProgressEvent) => void {
    return (event: ProgressEvent): void => {
        switch (event.type) {
            case 'step': reporter.step(event.n!, event.total!, event.label!); break;
            case 'pass': reporter.pass(event.item!, event.detail); break;
            case 'fail': reporter.fail(event.item!, event.detail); break;
            case 'warn': reporter.warn(event.item!, event.detail); break;
            case 'info': reporter.info(event.text!); break;
            case 'action': reporter.action(event.text!); break;
            case 'section': reporter.section(event.label!); break;
            case 'done': reporter.done(event.label!); break;
            case 'decision': reporter.decision(event.question!, event.answer!); break;
            case 'dry-run-cancel': reporter.dryRunCancel(); break;
            case 'dir-created': reporter.pass('Directory created'); break;
            case 'banner': reporter.banner(event.text!); break;
            case 'milestone': reporter.milestone(event.text!); break;
            case 'blank': reporter.blank(); break;
            case 'raw': reporter.raw(event.text!); break;
            case 'banner-init': reporter.bannerInit(); break;
        }
    };
}

export { createConsoleReporter, progressFromReporter };