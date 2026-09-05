/**
 * no-cjs.test.js — CommonJS 禁用扫描。
 *
 * dist/ 下全部 .js 必须是纯 ESM：不得出现 require(、module.exports、
 * __dirname（按代码语义匹配；字符串/注释中偶然出现该词不算违规，
 * 正则锚定到调用/赋值形态）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

function listJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listJsFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            out.push(full);
        }
    }
    return out;
}

test('dist/ contains no CommonJS constructs (require / module.exports / __dirname)', () => {
    assert.ok(fs.existsSync(distDir), `dist/ 不存在，请先执行 npm run build: ${distDir}`);
    const files = listJsFiles(distDir);
    assert.ok(files.length > 0, 'dist/ 中没有 .js 文件');

    const violations = [];
    const patterns = [
        [/\brequire\s*\(/, 'require()'],
        [/\bmodule\.exports\b/, 'module.exports'],
        [/\b__dirname\b/, '__dirname'],
    ];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        for (const [re, label] of patterns) {
            if (re.test(content)) {
                violations.push(`${path.relative(distDir, file)}: ${label}`);
            }
        }
    }

    assert.deepEqual(
        violations,
        [],
        `dist/ 中发现 CommonJS 构造（应为纯 ESM）:\n  ${violations.join('\n  ')}`
    );
});
