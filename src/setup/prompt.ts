export type Decision = 'yes' | 'no' | 'ask';

export interface DecisionOptions {
    allowAsk?: boolean | undefined;
    override?: string | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    question?: string | undefined;
}

function normalizeOverride(value: unknown, options: DecisionOptions = {}): Decision | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'no') return normalized;
    if (options.allowAsk && normalized === 'ask') return 'ask';
    return null;
}

function normalizeResponse(value: unknown, options: DecisionOptions = {}): Decision | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'y') return 'yes';
    if (normalized === 'n' || normalized === '') return 'no';
    if (options.allowAsk && normalized === 'a') return 'ask';
    return normalizeOverride(normalized, options);
}

function hintFor(allowAsk: boolean | undefined): string {
    return allowAsk === true ? '(y/n/a)' : '(y/N)';
}

async function resolveDecision(options: DecisionOptions = {}): Promise<Decision> {
    const normalizedOverride = normalizeOverride(options.override, options);
    if (normalizedOverride) return normalizedOverride;
    if (typeof options.prompt !== 'function') return 'no';

    const question = `${options.question || 'Continue?'} ${hintFor(options.allowAsk)}`;

    while (true) {
        const response = await options.prompt(question);
        const decision = normalizeResponse(response, options);
        if (decision) return decision;
    }
}

export {
    normalizeOverride,
    resolveDecision,
};