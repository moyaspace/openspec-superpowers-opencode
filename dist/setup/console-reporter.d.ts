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
declare function createConsoleReporter(options?: ConsoleReporterOptions): SetupReporter;
declare function progressFromReporter(reporter: SetupReporter): (event: ProgressEvent) => void;
export { createConsoleReporter, progressFromReporter };
//# sourceMappingURL=console-reporter.d.ts.map