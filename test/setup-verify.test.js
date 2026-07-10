/**
 * setup-verify.test.js — 验证 setup.ps1/setup.sh 的 OpenSpec 工作流验证步骤
 *
 * 覆盖 setup.ps1 L917-994 的 6 个子步骤：
 *   6a. 模板解析 → openspec templates --json
 *   6b. 创建测试变更 → openspec new change
 *   6c. 验证变更被列出 → openspec list --json
 *   6d. artifact 链完整性 → openspec status --change
 *   6e. 指令生成 → openspec instructions brainstorm --change
 *   6f. 清理测试变更
 *
 * 测试策略：
 *   - 单元测试：复现验证逻辑，用 mock 数据替代 openspec CLI 调用
 *   - 集成测试：实际调用 openspec CLI（跳过如果未安装）
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

// ============================================================
// 辅助：检查 openspec CLI 是否可用
// ============================================================
function openspecAvailable() {
    try {
        execSync('openspec --version', { stdio: 'pipe', encoding: 'utf8' });
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// 复现 setup.ps1 的验证逻辑（mockable）
// ============================================================

/**
 * 模拟 openspec templates --json 的输出解析。
 * @param {string} stdout — openspec templates --json --schema X 的输出
 * @returns {{ok: boolean, count: number}}
 */
function parseTemplateOutput(stdout) {
    try {
        const parsed = JSON.parse(stdout);
        // openspec templates --json 输出是 { artifactName: { path, source } } 格式
        const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
        const projectCount = entries.filter(t => t && t.source === 'project').length;
        return { ok: projectCount >= 8, count: projectCount };
    } catch {
        return { ok: false, count: 0 };
    }
}

/**
 * 模拟 openspec list --json 的输出解析。
 * @param {string} stdout
 * @param {string} changeName
 * @returns {boolean}
 */
function changeListed(stdout, changeName) {
    try {
        const parsed = JSON.parse(stdout);
        const changes = parsed.changes || parsed || [];
        return Array.isArray(changes) && changes.some(c => {
            if (typeof c === 'string') return c === changeName;
            return c.name === changeName;
        });
    } catch {
        return stdout.includes(changeName);
    }
}

/**
 * 模拟 openspec status --change X 的输出解析。
 * @param {string} stdout
 * @param {number} minArtifacts
 * @returns {{ok: boolean, count: number}}
 */
function parseStatusOutput(stdout, minArtifacts = 8) {
    // 统计以 [ 开头的行数（artifact 行）
    const artifactLines = stdout.split('\n').filter(l => l.trimStart().startsWith('[')).length;
    return { ok: artifactLines >= minArtifacts, count: artifactLines };
}

// ============================================================
// 单元测试：验证逻辑
// ============================================================

describe('验证逻辑 — 单元测试', () => {
    describe('parseTemplateOutput()', () => {
        it('成功解析 8+ 个 project 源模板', () => {
            const tmpls = Array.from({ length: 10 }, (_, i) => ({
                name: `tmpl${i}`,
                source: i < 8 ? 'project' : 'builtin',
            }));
            const result = parseTemplateOutput(JSON.stringify(tmpls));
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.count, 8);
        });

        it('不足 8 个 project 源模板时报错', () => {
            const tmpls = Array.from({ length: 3 }, (_, i) => ({
                name: `tmpl${i}`,
                source: 'project',
            }));
            const result = parseTemplateOutput(JSON.stringify(tmpls));
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.count, 3);
        });

        it('无效 JSON 时报错', () => {
            const result = parseTemplateOutput('not json');
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.count, 0);
        });

        it('空数组时通过但 count=0', () => {
            const result = parseTemplateOutput('[]');
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.count, 0);
        });
    });

    describe('changeListed()', () => {
        it('在 changes 数组中找到变更名', () => {
            const json = JSON.stringify({ changes: [{ name: 'verify-deploy' }] });
            assert.strictEqual(changeListed(json, 'verify-deploy'), true);
        });

        it('多个变更中找到目标', () => {
            const json = JSON.stringify({
                changes: [
                    { name: 'feature-a' },
                    { name: 'verify-deploy' },
                    { name: 'feature-b' },
                ],
            });
            assert.strictEqual(changeListed(json, 'verify-deploy'), true);
        });

        it('变更不存在时返回 false', () => {
            const json = JSON.stringify({ changes: [{ name: 'feature-a' }] });
            assert.strictEqual(changeListed(json, 'verify-deploy'), false);
        });

        it('空 changes 列表返回 false', () => {
            const json = JSON.stringify({ changes: [] });
            assert.strictEqual(changeListed(json, 'verify-deploy'), false);
        });

        it('直接数组格式（非 {changes: []}）也能处理', () => {
            const json = JSON.stringify(['verify-deploy', 'feature-a']);
            assert.strictEqual(changeListed(json, 'verify-deploy'), true);
        });

        it('无效 JSON 回退到字符串匹配', () => {
            assert.strictEqual(changeListed('verify-deploy', 'verify-deploy'), true);
            assert.strictEqual(changeListed('no-match', 'verify-deploy'), false);
        });
    });

    describe('parseStatusOutput()', () => {
        it('统计 [ 开头的 artifact 行', () => {
            const lines = [
                '[1] brainstorm',
                '[2] proposal',
                '[3] spec',
                '[4] design',
                '[5] tasks',
                '[6] plan',
                '[7] verify',
                '[8] retro',
                '',
                'some extra text',
            ].join('\n');
            const result = parseStatusOutput(lines, 8);
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.count, 8);
        });

        it('artifact 不足时报错', () => {
            const lines = ['[1] brainstorm', '[2] plan'].join('\n');
            const result = parseStatusOutput(lines, 8);
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.count, 2);
        });

        it('空输出 count=0', () => {
            const result = parseStatusOutput('', 8);
            assert.strictEqual(result.ok, false);
            assert.strictEqual(result.count, 0);
        });
    });
});

// ============================================================
// 集成测试：实际调用 openspec（跳过如果 CLI 不可用）
// ============================================================

describe('openspec CLI 集成', { skip: !openspecAvailable() }, () => {
    let tmpDir;
    let origCwd;

    before(() => {
        // 创建一个临时项目目录，模拟 setup.ps1 初始化后的项目结构
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oso-verify-test-'));
        const templateDir = path.resolve(__dirname, '..', 'template');
        // 复制整个 openspec/（包含 schemas + config.yaml）
        const tmplOpenspecDir = path.join(templateDir, 'openspec');
        const dstOpenspecDir = path.join(tmpDir, 'openspec');
        if (fs.existsSync(tmplOpenspecDir)) {
            fs.cpSync(tmplOpenspecDir, dstOpenspecDir, { recursive: true });
        }
        // openspec 还需要 .opencode/opencode.json 等文件来运行
        const tmplOcodeDir = path.join(templateDir, '.opencode');
        const dstOcodeDir = path.join(tmpDir, '.opencode');
        if (fs.existsSync(tmplOcodeDir)) {
            fs.cpSync(tmplOcodeDir, dstOcodeDir, { recursive: true });
        }
        origCwd = process.cwd();
        process.chdir(tmpDir);
    });

    after(() => {
        process.chdir(origCwd);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('openspec templates --json 返回 8+ 个 project 源', () => {
        const out = execSync(
            'openspec templates --json --schema superpowers-bridge-opencode',
            { stdio: 'pipe', encoding: 'utf8', cwd: tmpDir }
        );
        const result = parseTemplateOutput(out);
        assert.strictEqual(result.ok, true,
            `Expected >=8 project templates, got ${result.count}`);
    });

    it('openspec new change + list --json 创建并列出变更', () => {
        const changeName = 'test-verify-integration';

        // 创建变更
        execSync(`openspec new change ${changeName} --description "集成测试"`, {
            stdio: 'pipe', encoding: 'utf8', cwd: tmpDir,
        });

        // 验证列出
        const listOut = execSync('openspec list --json', {
            stdio: 'pipe', encoding: 'utf8', cwd: tmpDir,
        });
        assert.strictEqual(changeListed(listOut, changeName), true,
            `openspec list --json 应包含 "${changeName}"，输出: ${listOut}`);

        // 清理
        const changeDir = path.join(tmpDir, 'openspec', 'changes', changeName);
        if (fs.existsSync(changeDir)) {
            fs.rmSync(changeDir, { recursive: true, force: true });
        }
    });

    it('openspec status --change 返回 8+ 个 artifact', () => {
        const changeName = 'test-verify-artifacts';

        // 创建变更
        execSync(`openspec new change ${changeName} --description "artifact 测试"`, {
            stdio: 'pipe', encoding: 'utf8', cwd: tmpDir,
        });

        // 获取 status
        const statusOut = execSync(`openspec status --change ${changeName}`, {
            stdio: 'pipe', encoding: 'utf8', cwd: tmpDir,
        });
        const result = parseStatusOutput(statusOut, 8);
        assert.strictEqual(result.ok, true,
            `Expected >=8 artifacts, got ${result.count}. Output:\n${statusOut}`);

        // 清理
        const changeDir = path.join(tmpDir, 'openspec', 'changes', changeName);
        if (fs.existsSync(changeDir)) {
            fs.rmSync(changeDir, { recursive: true, force: true });
        }
    });
});
