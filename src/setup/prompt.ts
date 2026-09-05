type Decision = 'yes' | 'no' | 'ask';

interface DecisionOptions {
    allowAsk?: boolean;
    override?: string;
    prompt?: (question: string) => Promise<string>;
    question?: string;
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

async function resolveDecision(options: DecisionOptions = {}): Promise<Decision> {
    const normalizedOverride = normalizeOverride(options.override, options);
    if (normalizedOverride) return normalizedOverride;
    if (typeof options.prompt !== 'function') return 'no';

    while (true) {
        const response = await options.prompt(options.question || 'Continue?');
        const decision = normalizeResponse(response, options);
        if (decision) return decision;
    }
}

export {
    normalizeOverride,
    resolveDecision,
};