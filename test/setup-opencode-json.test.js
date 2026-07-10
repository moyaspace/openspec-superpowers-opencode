/**
 * setup-opencode-json.test.js — 验证 opencode.json 合并的 key 顺序
 *
 * 棕地合并时，输出 JSON 的 key 顺序必须与模板一致：
 * 1. 模板 key 原序（包括 edit 中的 * 兜底在首位）
 * 2. 用户自定义 key 追加末尾（last wins）
 *
 * RED 阶段：这些测试目前会失败。
 */

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// 从 setup.sh 提取的 merge 逻辑（Node.js inline script 版本）
// ============================================================

/**
 * 合并两个对象，按 a 的 key 序 + 补 b 中 a 没有的 key。
 * 类似于 Object.assign，但 preserves a 的 key 顺序。
 */
function mergeKeys(a, b) {
    const o = {};
    // 1. a 的 key 原序，值优先用 b 的
    for (const k of Object.keys(a || {})) {
        o[k] = (b != null && k in b) ? b[k] : a[k];
    }
    // 2. b 中 a 没有的 key，追加末尾
    for (const k of Object.keys(b || {})) {
        if (a == null || !(k in a)) o[k] = b[k];
    }
    return o;
}

/**
 * 棕地合并 opencode.json。
 * @param {object} userJson — 用户已存在的 .opencode/opencode.json
 * @param {object} tmplJson — 模板 .opencode/opencode.json
 * @returns {{permission: object}} 合并结果
 */
function mergeOcodeJson(userJson, tmplJson) {
    const perm = mergeKeys(tmplJson.permission, userJson.permission);

    const required = ['.worktrees/**', 'openspec/changes/**', 'openspec/specs/**', '.opencode/**'];
    const denied = ['openspec/schemas/**', 'openspec/config.yaml'];

    for (const action of ['write', 'edit']) {
        const obj = perm[action];
        if (obj && typeof obj === 'object') {
            const sub = mergeKeys(tmplJson.permission?.[action], obj);
            for (const r of required) sub[r] = 'allow';
            for (const d of denied) sub[d] = 'deny';
            perm[action] = sub;
        }
    }

    if (perm.bash && typeof perm.bash === 'object' && tmplJson.permission?.bash) {
        perm.bash = mergeKeys(tmplJson.permission.bash, perm.bash);
    }

    return { permission: perm };
}

// ============================================================
// 测试
// ============================================================

describe('mergeOcodeJson()', () => {
    // ---- Top-level key order ----

    test('top-level keys follow template order', () => {
        const tmpl = {
            permission: {
                read: 'allow',
                glob: 'allow',
                webfetch: 'allow',
                edit: { '*': 'ask' },
                bash: { '*': 'allow' },
            },
        };
        const user = { permission: { read: 'deny' } };

        const result = mergeOcodeJson(user, tmpl);

        // 用户只有 read，结果应该包含所有模板 key 且顺序一致
        assert.deepStrictEqual(Object.keys(result.permission), ['read', 'glob', 'webfetch', 'edit', 'bash']);
    });

    test('custom top-level keys appended at end', () => {
        const tmpl = {
            permission: {
                read: 'allow',
                glob: 'allow',
            },
        };
        const user = { permission: { read: 'deny', 'my-custom-key': 'allow' } };

        const result = mergeOcodeJson(user, tmpl);

        const keys = Object.keys(result.permission);
        assert.strictEqual(keys[0], 'read');
        assert.strictEqual(keys[1], 'glob');
        assert.strictEqual(keys[2], 'my-custom-key');
    });

    // ---- Edit sub-key order ----

    test('edit sub-keys follow template order with * first', () => {
        const tmpl = {
            permission: {
                edit: {
                    '*': 'ask',
                    '.worktrees/**': 'allow',
                    'openspec/changes/**': 'allow',
                    'AGENTS.md': 'allow',
                },
            },
        };
        const user = { permission: { edit: { '*': 'deny' } } };

        const result = mergeOcodeJson(user, tmpl);

        const editKeys = Object.keys(result.permission.edit);
        assert.strictEqual(editKeys[0], '*');
        assert.strictEqual(editKeys[1], '.worktrees/**');
        assert.strictEqual(editKeys[2], 'openspec/changes/**');
        assert.strictEqual(editKeys[3], 'AGENTS.md');
    });

    test('custom edit keys appended at end after all template keys', () => {
        // 模板必须包含 required/deny 路径，因为它们是基础设施的一部分
        const tmpl = {
            permission: {
                edit: {
                    '*': 'ask',
                    '.worktrees/**': 'allow',
                    'openspec/changes/**': 'allow',
                    'openspec/specs/**': 'allow',
                    'openspec/schemas/**': 'deny',
                    'openspec/config.yaml': 'deny',
                    '.opencode/**': 'allow',
                },
            },
        };
        const user = {
            permission: {
                edit: {
                    '*': 'ask',
                    'my-custom-path/**': 'allow',
                },
            },
        };

        const result = mergeOcodeJson(user, tmpl);

        const editKeys = Object.keys(result.permission.edit);
        const tmplEditKeys = Object.keys(tmpl.permission.edit);
        for (let i = 0; i < tmplEditKeys.length; i++) {
            assert.strictEqual(editKeys[i], tmplEditKeys[i],
                `Edit key #${i} should be "${tmplEditKeys[i]}" but got "${editKeys[i]}"`);
        }
        assert.strictEqual(editKeys[editKeys.length - 1], 'my-custom-path/**');
    });

    // ---- Values preserved ----

    test('user values override template values', () => {
        const tmpl = {
            permission: { read: 'allow', webfetch: 'allow' },
        };
        const user = { permission: { read: 'deny' } };

        const result = mergeOcodeJson(user, tmpl);

        assert.strictEqual(result.permission.read, 'deny');
        assert.strictEqual(result.permission.webfetch, 'allow');
    });

    test('user edit values preserved through merge', () => {
        const tmpl = {
            permission: {
                edit: { '*': 'ask', 'AGENTS.md': 'allow' },
            },
        };
        const user = {
            permission: {
                edit: { '*': 'ask', 'AGENTS.md': 'deny' },
            },
        };

        const result = mergeOcodeJson(user, tmpl);

        assert.strictEqual(result.permission.edit['*'], 'ask');
        assert.strictEqual(result.permission.edit['AGENTS.md'], 'deny');
    });

    // ---- required/deny force insert ----

    test('required paths are always allow', () => {
        const tmpl = {
            permission: { edit: { '*': 'ask' } },
        };
        const user = { permission: { edit: { '*': 'deny' } } };

        const result = mergeOcodeJson(user, tmpl);

        assert.strictEqual(result.permission.edit['.worktrees/**'], 'allow');
        assert.strictEqual(result.permission.edit['openspec/changes/**'], 'allow');
        assert.strictEqual(result.permission.edit['openspec/specs/**'], 'allow');
        assert.strictEqual(result.permission.edit['.opencode/**'], 'allow');
    });

    test('deny paths are always deny', () => {
        const tmpl = {
            permission: { edit: { '*': 'ask' } },
        };
        const user = {
            permission: {
                edit: { 'openspec/schemas/**': 'allow', 'openspec/config.yaml': 'allow' },
            },
        };

        const result = mergeOcodeJson(user, tmpl);

        assert.strictEqual(result.permission.edit['openspec/schemas/**'], 'deny');
        assert.strictEqual(result.permission.edit['openspec/config.yaml'], 'deny');
    });

    // ---- End-to-end with real template ----

    test('end-to-end: real template key order preserved', () => {
        const tmplPath = path.join(__dirname, '..', 'template', '.opencode', 'opencode.json');
        const tmpl = JSON.parse(fs.readFileSync(tmplPath, 'utf8'));

        const user = {
            permission: {
                edit: { '*': 'ask', 'user-path/**': 'allow' },
                bash: { '*': 'allow' },
            },
        };

        const result = mergeOcodeJson(user, tmpl);
        const permKeys = Object.keys(result.permission);
        const tmplPermKeys = Object.keys(tmpl.permission);

        // Template keys should be first, in order
        for (let i = 0; i < tmplPermKeys.length; i++) {
            assert.strictEqual(permKeys[i], tmplPermKeys[i],
                `Top-level key #${i} should be "${tmplPermKeys[i]}" but got "${permKeys[i]}"`);
        }

        // Edit sub-keys should be in template order
        const editKeys = Object.keys(result.permission.edit);
        const tmplEditKeys = Object.keys(tmpl.permission.edit);
        for (let i = 0; i < tmplEditKeys.length; i++) {
            assert.strictEqual(editKeys[i], tmplEditKeys[i],
                `Edit key #${i} should be "${tmplEditKeys[i]}" but got "${editKeys[i]}"`);
        }

        // Custom key should be last in edit
        assert.strictEqual(editKeys[editKeys.length - 1], 'user-path/**');
    });
});
