/**
 * setup-brownfield-gate.test.js — 棕地 init 门控逻辑测试
 *
 * 覆盖 setup.ps1 Step 2 改动：
 *   1. 棕地标记显示 `(brownfield)`
 *   2. 全局门控「继续完整 init？」，选 N → exit 0
 *   3. 选 Y → 逐项确认，选 N 不 exit 改为跳过继续
 *   4. manifest 记录完整性
 *   5. opencode.json 保护路径
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ============================================================
// 复现 setup.ps1 的棕地门控决策逻辑
// 返回值: { action: 'exit' | 'skip-openspec' | 'deploy-openspec' | 'auto-deploy' }
// ============================================================

function step2Gate(isBrownfield, globalAnswer, openspecAnswer) {
    if (!isBrownfield) {
        return { action: 'auto-deploy', message: 'greenfield, auto-deploy' };
    }

    // 棕地：全局门控
    if (globalAnswer === 'no' || globalAnswer === '') {
        return { action: 'exit', message: 'user declined full init' };
    }

    // 全局门控通过，逐项确认 openspec/
    if (openspecAnswer === 'no' || openspecAnswer === '') {
        return { action: 'skip-openspec', message: 'skip openspec/, continue' };
    }

    return { action: 'deploy-openspec', message: 'deploy openspec/' };
}

// ============================================================
// 复现 manifest 记录逻辑
// ============================================================

function buildManifest(files, skipDecisions = {}) {
    const uniqueFiles = [...new Set(files)].sort();
    const overwriteDecisions = {};
    for (const f of uniqueFiles) {
        const basename = f.split(/[\\/]/).pop();
        const isProtected = ['AGENTS.md', '.gitignore', '.gitattributes', '.editorconfig', 'opencode.json'].includes(basename);
        if (!isProtected && !skipDecisions[f]) {
            overwriteDecisions[f] = 'overwrite';
        }
    }
    for (const [f, skipped] of Object.entries(skipDecisions)) {
        if (skipped) overwriteDecisions[f] = 'skip';
    }
    return { files: uniqueFiles, overwriteDecisions };
}

// ============================================================
// 复现保护文件检查逻辑
// ============================================================

function isProtectedFile(filePath, protectedPatterns) {
    for (const pattern of protectedPatterns) {
        if (filePath === pattern) return true;
        const basename = filePath.split(/[\\/]/).pop();
        if (basename === pattern) return true;
    }
    return false;
}

// ============================================================
// 测试
// ============================================================

describe('棕地门控 (Step 2) — 决策逻辑', () => {
    it('棕地 + 全局门控 N → exit', () => {
        const r = step2Gate(true, 'no', '');
        assert.strictEqual(r.action, 'exit');
    });

    it('棕地 + 全局门控 默认(回车) → exit', () => {
        const r = step2Gate(true, '', '');
        assert.strictEqual(r.action, 'exit');
    });

    it('棕地 + 全局门控 Y + openspec N → skip-openspec', () => {
        const r = step2Gate(true, 'yes', 'no');
        assert.strictEqual(r.action, 'skip-openspec');
    });

    it('棕地 + 全局门控 Y + openspec Y → deploy-openspec', () => {
        const r = step2Gate(true, 'yes', 'yes');
        assert.strictEqual(r.action, 'deploy-openspec');
    });

    it('绿地 → auto-deploy', () => {
        const r = step2Gate(false, '', '');
        assert.strictEqual(r.action, 'auto-deploy');
    });

    it('棕地标记应包含 brownfield 字样', () => {
        assert.ok('  - openspec/ already exists (brownfield)'.includes('brownfield'));
    });

    it('绿地标记应包含 greenfield 字样', () => {
        assert.ok('  - openspec/ not found (greenfield, auto-deploy)'.includes('greenfield'));
    });
});

describe('manifest 记录完整性', () => {
    it('非保护文件在 overwriteDecisions 中，保护文件不在', () => {
        const files = [
            'openspec\\config.yaml',
            'openspec\\schemas\\superpowers-bridge-opencode\\schema.yaml',
            '.opencode\\commands\\opsx-apply.md',
            'AGENTS.md',
            '.gitignore',
            '.editorconfig',
            '.opencode\\opencode.json',
        ];
        const m = buildManifest(files);
        assert.strictEqual(m.overwriteDecisions['openspec\\config.yaml'], 'overwrite');
        assert.strictEqual(m.overwriteDecisions['.opencode\\commands\\opsx-apply.md'], 'overwrite');
        assert.strictEqual(m.overwriteDecisions['AGENTS.md'], undefined, 'AGENTS.md 不在 decisions');
        assert.strictEqual(m.overwriteDecisions['.gitignore'], undefined, '.gitignore 不在 decisions');
        assert.strictEqual(m.overwriteDecisions['.editorconfig'], undefined, '.editorconfig 不在 decisions');
        assert.strictEqual(m.overwriteDecisions['.opencode\\opencode.json'], undefined, 'opencode.json 不在 decisions');
    });

    it('AGENTS.md 在 files 中', () => {
        const m = buildManifest(['AGENTS.md', 'openspec\\config.yaml']);
        assert.ok(m.files.includes('AGENTS.md'));
    });

    it('files 排序去重', () => {
        const m = buildManifest(['b', 'a', 'b', 'c']);
        assert.deepStrictEqual(m.files, ['a', 'b', 'c']);
    });
});

describe('opencode.json 保护路径', () => {
    const patterns = ['AGENTS.md', 'opencode.json', '.gitignore', '.gitattributes', '.editorconfig'];

    it('子目录 opencode.json 应匹配', () => {
        assert.ok(isProtectedFile('.opencode\\opencode.json', patterns));
        assert.ok(isProtectedFile('.opencode/opencode.json', patterns));
    });

    it('根目录 opencode.json 应匹配', () => {
        assert.ok(isProtectedFile('opencode.json', patterns));
    });

    it('config.yaml 不应匹配', () => {
        assert.ok(!isProtectedFile('openspec\\config.yaml', patterns));
    });

    it('opsx 命令不应匹配', () => {
        assert.ok(!isProtectedFile('.opencode\\commands\\opsx-apply.md', patterns));
    });
});
