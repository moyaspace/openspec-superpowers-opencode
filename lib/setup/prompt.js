function normalizeOverride(value, options = {}) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'no') return normalized;
    if (options.allowAsk && normalized === 'ask') return 'ask';
    return null;
}

function normalizeResponse(value, options = {}) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'y') return 'yes';
    if (normalized === 'n' || normalized === '') return 'no';
    if (options.allowAsk && normalized === 'a') return 'ask';
    return normalizeOverride(normalized, options);
}

async function resolveDecision(options = {}) {
    const normalizedOverride = normalizeOverride(options.override, options);
    if (normalizedOverride) return normalizedOverride;
    if (typeof options.prompt !== 'function') return 'no';

    while (true) {
        const response = await options.prompt(options.question || 'Continue?');
        const decision = normalizeResponse(response, options);
        if (decision) return decision;
    }
}

module.exports = {
    normalizeOverride,
    resolveDecision,
};
