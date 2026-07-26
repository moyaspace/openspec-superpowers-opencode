function isEmpty(value) {
    return value === null || value === undefined || value === '';
}

function mergeKeys(templateValue, userValue) {
    const template = templateValue || {};
    const user = userValue || {};
    const result = {};

    for (const key of Object.keys(template)) {
        result[key] = key in user && !isEmpty(user[key]) ? user[key] : template[key];
    }

    for (const key of Object.keys(user)) {
        if (!(key in template) && !isEmpty(user[key])) {
            result[key] = user[key];
        }
    }

    return result;
}

function mergeOcodeJson(userJson = {}, templateJson = {}) {
    const result = mergeKeys(templateJson, userJson);
    const templatePermission = templateJson.permission || {};
    const userPermission = userJson.permission || {};
    const permission = mergeKeys(templatePermission, userPermission);

    for (const action of ['write', 'edit']) {
        if (permission[action] && typeof permission[action] === 'object') {
            permission[action] = mergeKeys(templatePermission[action], permission[action]);
        }
    }

    if (permission.bash && typeof permission.bash === 'object') {
        permission.bash = mergeKeys(templatePermission.bash, permission.bash);
    }

    result.permission = permission;
    return result;
}

function mergeMarker(options) {
    const { existing, managed, marker } = options;
    if (existing === null || existing === undefined) {
        return { action: 'create', content: managed };
    }

    const markerCount = existing.split(marker).length - 1;
    if (markerCount === 0) {
        const separator = existing.endsWith('\n') ? '\n' : '\n\n';
        return { action: 'append', content: `${existing}${separator}${managed}` };
    }
    if (markerCount !== 2) {
        throw new Error(`Incomplete managed marker section: expected 0 or 2 markers, found ${markerCount}`);
    }
    if (options.decision !== 'yes') {
        return { action: 'skip', content: existing };
    }

    const start = existing.indexOf(marker);
    const end = existing.indexOf(marker, start + marker.length) + marker.length;
    return {
        action: 'replace',
        content: `${existing.slice(0, start)}${managed.trimEnd()}${existing.slice(end)}`,
    };
}

module.exports = {
    mergeMarker,
    mergeKeys,
    mergeOcodeJson,
};
