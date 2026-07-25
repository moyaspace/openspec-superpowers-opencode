async function runSetupCommand(command, options, api) {
    const method = {
        init: 'initProject',
        reset: 'resetProject',
        'dry-run': 'dryRunProject',
    }[command];
    if (!method || typeof api[method] !== 'function') {
        return { code: 1, error: new Error(`Unsupported setup command: ${command}`) };
    }
    try {
        const value = await api[method](options);
        return { code: value && value.success === false ? 1 : 0, value };
    } catch (error) {
        return { code: 1, error };
    }
}

module.exports = {
    runSetupCommand,
};
