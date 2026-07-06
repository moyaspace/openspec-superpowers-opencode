// registry.js — 注册表读写逻辑
// CommonJS 模块，所有函数接收 oso-change-registry.json 的绝对路径作为第一个参数

const fs = require('fs');
const path = require('path');

/**
 * 读注册表文件
 * @param {string} registryPath — openspec/oso-change-registry.json 的绝对路径
 * @returns {{ changes: Array }}
 */
function read(registryPath) {
    try {
        const raw = fs.readFileSync(registryPath, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return { changes: [] };
    }
}

/**
 * 写注册表文件（确保目录存在）
 * @param {string} registryPath
 * @param {object} data
 */
function write(registryPath, data) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + '\n');
}

/**
 * 添加条目（同名覆盖）
 * @param {string} registryPath
 * @param {string} name
 * @param {string} worktree
 */
function add(registryPath, name, worktree) {
    const data = read(registryPath);
    const idx = data.changes.findIndex(c => c.name === name);
    const entry = { name, worktree, createdAt: new Date().toISOString() };
    if (idx >= 0) {
        data.changes[idx] = entry;
    } else {
        data.changes.push(entry);
    }
    write(registryPath, data);
}

/**
 * 删除条目（保留空文件）
 * @param {string} registryPath
 * @param {string} name
 */
function remove(registryPath, name) {
    const data = read(registryPath);
    data.changes = data.changes.filter(c => c.name !== name);
    write(registryPath, data);
}

/**
 * 格式化输出所有活跃变更
 * @param {string} registryPath
 * @returns {string}
 */
function list(registryPath) {
    const data = read(registryPath);
    if (data.changes.length === 0) {
        return 'No active changes found.\n';
    }
    const lines = data.changes.map(c => {
        const age = c.createdAt ? relativeTime(c.createdAt) : '';
        return `  ${c.name}  ${c.worktree}  ${age}`;
    });
    return 'Changes:\n' + lines.join('\n');
}

/**
 * 计算相对时间（如 "2m ago"、"3h ago"、"1d ago"）
 * @param {string} iso — ISO 时间戳
 * @returns {string}
 */
function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

/**
 * 重置注册表为空（可选备份原文件）。
 * @param {string} registryPath
 * @param {boolean} [backup=true] — 是否备份原文件为 oso-change-registry.json.bak
 * @returns {{backupPath: string|null, changesCount: number}}
 */
function reset(registryPath, backup) {
    const changesCount = read(registryPath).changes.length;
    let backupPath = null;

    if (backup !== false && fs.existsSync(registryPath)) {
        backupPath = registryPath + '.bak';
        fs.copyFileSync(registryPath, backupPath);
    }

    write(registryPath, { changes: [] });
    return { backupPath, changesCount };
}

module.exports = { read, write, add, remove, list, reset };
