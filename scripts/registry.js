// registry.js — 注册表读写逻辑
// CommonJS 模块，所有函数接收 changes.json 的绝对路径作为第一个参数

const fs = require('fs');
const path = require('path');

/**
 * 读注册表文件
 * @param {string} registryPath — openspec/changes.json 的绝对路径
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
 * @param {string} status
 * @param {string} worktree
 */
function add(registryPath, name, status, worktree) {
    const data = read(registryPath);
    const idx = data.changes.findIndex(c => c.name === name);
    const entry = { name, status, worktree, createdAt: new Date().toISOString() };
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
 * 更新条目状态
 * @param {string} registryPath
 * @param {string} name
 * @param {string} status
 */
function updateStatus(registryPath, name, status) {
    const data = read(registryPath);
    const entry = data.changes.find(c => c.name === name);
    if (entry) {
        entry.status = status;
        write(registryPath, data);
    }
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
    const nameWidth = Math.max(...data.changes.map(c => c.name.length));
    const lines = data.changes.map(c => {
        return `  ${c.name.padEnd(nameWidth)} ${c.status.padEnd(12)} ${relativeTime(c.createdAt)}  ${c.worktree}`;
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

module.exports = { read, write, add, remove, updateStatus, list };
