// AGENTS.md 部署逻辑测试
// 覆盖 setup.ps1 中 <!-- openspec-superpowers-opencode_instructions --> 标记检测/替换/追加三种场景
//
// 测试策略：setup.ps1 的 AGENTS.md 逻辑本质是字符串操作，
// 在 Node.js 中复现相同逻辑验证三路分支。

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 读取模板 AGENTS.md 作为 bridge 内容
const templateDir = path.resolve(__dirname, '..', 'template');
const bridgeContent = fs.readFileSync(path.join(templateDir, '_AGENTS.md'), 'utf-8');
const marker = '<!-- openspec-superpowers-opencode_instructions -->';

describe('AGENTS.md 部署逻辑', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- 场景 1：绿地（文件不存在）----

  it('绿地：文件不存在时直接写入 bridge 内容', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    // 模拟 setup.ps1 的绿地分支
    fs.writeFileSync(dst, bridgeContent, 'utf-8');

    const written = fs.readFileSync(dst, 'utf-8');
    assert.strictEqual(written, bridgeContent);
    assert.ok(written.includes(marker), '应包含标记');
  });

  // ---- 场景 2：棕地，已有标记 ----

  it('棕地已有标记：用户选择替换 — 标记间内容被更新', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    // 创建带旧 bridge 内容的 AGENTS.md
    const oldBridge = `${marker}\n旧内容\n${marker}`;
    const userContent = '# 用户自有指令\n\n一些配置\n\n';
    fs.writeFileSync(dst, userContent + oldBridge, 'utf-8');

    // 模拟替换逻辑（setup.ps1 L587-589 的 -replace）
    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}[\\s\\S]*?${escaped}`, 'g');
    const newContent = existing.replace(pattern, bridgeContent.trimEnd());

    fs.writeFileSync(dst, newContent, 'utf-8');
    const result = fs.readFileSync(dst, 'utf-8');

    // 用户内容应保留
    assert.ok(result.includes('# 用户自有指令'), '用户内容应保留');
    assert.ok(result.includes('一些配置'), '用户配置应保留');
    // 标记间内容应为新 bridge
    const markerMatch = result.match(new RegExp(`${escaped}([\\s\\S]*?)${escaped}`));
    assert.ok(markerMatch, '标记应存在');
    assert.ok(markerMatch[1].includes('Superpowers Skill 载入'), 'bridge 内容应已更新');
    // 不应包含旧内容
    assert.ok(!result.includes('旧内容'), '旧 bridge 内容应被替换');
  });

  it('棕地已有标记：用户选择跳过 — AGENTS.md 不变', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    const original = `# 用户内容\n${marker}\n旧 bridge\n${marker}\n更多用户内容`;
    fs.writeFileSync(dst, original, 'utf-8');

    // 模拟跳过（不做任何操作）
    // 验证文件未变
    const result = fs.readFileSync(dst, 'utf-8');
    assert.strictEqual(result, original);
  });

  it('棕地已有标记：仅一个标记时不视为已有 bridge', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    // 只有开标记，缺少闭标记
    const content = `# 用户内容\n${marker}\n不完整 bridge\n`;
    fs.writeFileSync(dst, content, 'utf-8');

    // 检测标记数
    const matches = content.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    const count = matches ? matches.length : 0;
    assert.strictEqual(count, 1, '只有 1 个标记');

    // 小于 2 → 走追加分支
    if (count < 2) {
      fs.appendFileSync(dst, '\n' + bridgeContent, 'utf-8');
    }

    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.includes('# 用户内容'), '用户内容应保留');
    assert.ok(result.includes('Superpowers Skill 载入'), 'bridge 内容应追加');
    // 现在应有 3 个标记（原 1 个 + bridge 中的 2 个）
    const finalMatches = result.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    assert.strictEqual(finalMatches ? finalMatches.length : 0, 3, '应有 3 个标记');
  });

  // ---- 场景 3：棕地，无标记 ----

  it('棕地无标记：追加 bridge 内容到末尾', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    const userContent = '# 用户自有 AGENTS.md\n\n## 规则\n\n- 规则一\n- 规则二\n';
    fs.writeFileSync(dst, userContent, 'utf-8');

    // 模拟静默追加
    fs.appendFileSync(dst, '\n' + bridgeContent, 'utf-8');

    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.startsWith('# 用户自有 AGENTS.md'), '用户内容应在文件开头');
    assert.ok(result.trimEnd().endsWith(bridgeContent.trimEnd()), 'bridge 内容应在文件末尾');
    assert.ok(result.includes('Superpowers Skill 载入'), '应包含 bridge 内容');
  });

  // ---- 标记检测 ----

  it('标记 `_` 格式与 template 一致', () => {
    assert.ok(marker.includes('_instructions'), '标记应使用下划线格式');
    assert.ok(!marker.includes('-instructions'), '不应使用连字符格式');
  });

  it('标记在 template 中出现恰好 2 次（首尾各一）', () => {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = bridgeContent.match(new RegExp(escaped, 'g'));
    assert.strictEqual(matches ? matches.length : 0, 2, 'template 应有恰好 2 个标记');
  });

  // ---- setup.sh python3 替换路径（re.sub 模式）----

  it('python3 re.sub 模式：count=1 仅替换第一个标记对', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    // 两个标记对
    const content = `# 用户\n${marker}\n旧 bridge\n${marker}\n# 中间\n${marker}\n另一段 bridge\n${marker}\n# 末尾`;
    fs.writeFileSync(dst, content, 'utf-8');

    // 模拟 setup.sh 的 python3 re.sub(count=1) 模式
    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 与 setup.sh python3 代码完全一致的逻辑:
    // re.sub(pattern, bridge.strip(), existing, count=1, flags=re.DOTALL)
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, bridgeContent.trimEnd());

    fs.writeFileSync(dst, result, 'utf-8');
    const final = fs.readFileSync(dst, 'utf-8');

    // 第一个标记对被替换
    assert.ok(!final.includes('旧 bridge'), '第一个标记对内容应被替换');
    // 第二个标记对应保留（count=1）
    assert.ok(final.includes('另一段 bridge'), '第二个标记对内容应保留');
    assert.ok(final.includes('# 用户'), '用户开头内容应保留');
    assert.ok(final.includes('# 末尾'), '用户末尾内容应保留');
  });

  it('python3 re.sub 模式：`.strip()` 去除 bridge 尾部换行', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    const content = `前缀\n${marker}\n旧\n${marker}\n后缀`;
    fs.writeFileSync(dst, content, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    // bridgeContent 末尾有换行，.trimEnd()/.strip() 去除后替换
    const result = existing.replace(pattern, bridgeContent.trimEnd());

    assert.ok(result.includes('Superpowers Skill 载入'), 'bridge 内容应在替换结果中');
    assert.ok(result.startsWith('前缀'), '前缀应保留');
    assert.ok(result.endsWith('后缀'), '后缀应保留');
  });

  it('grep -c 风格：标记计数 ≥2 检测', () => {
    // 模拟 setup.sh: MARKER_COUNT=$(grep -c "$MARKER" ... || echo 0)

    // 0 标记
    const noMarker = '# 无标记内容\n## 规则\n';
    const count0 = (noMarker.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(count0, 0, '无标记时计数为 0');
    assert.ok(count0 < 2, '0 < 2 → 走追加分支');

    // 1 标记
    const oneMarker = `# 内容\n${marker}\n不完整`;
    const count1 = (oneMarker.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(count1, 1, '1 个标记');
    assert.ok(count1 < 2, '1 < 2 → 走追加分支');

    // 2 标记
    const twoMarker = `# 内容\n${marker}\nbridge\n${marker}\n更多`;
    const count2 = (twoMarker.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(count2, 2, '2 个标记');
    assert.ok(count2 >= 2, '2 ≥ 2 → 走替换分支');

    // 3 标记
    const threeMarker = `# 内容\n${marker}\nb1\n${marker}\n中\n${marker}\nb2`;
    const count3 = (threeMarker.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.strictEqual(count3, 3, '3 个标记');
    assert.ok(count3 >= 2, '3 ≥ 2 → 走替换分支');
  });

  it('CRLF/LF 跨平台：标记在 \\r\\n 换行中仍被正确识别', () => {
    // Windows CRLF 内容
    const dst = path.join(tmpDir, 'AGENTS.md');
    const crlfContent = '# 用户\r\n\r\n一些说明\r\n'.replace(/\n/g, '\r\n');
    // 手动构建 CRLF 版本的 markers
    const crlfExisting = `# 用户\r\n${marker}\r\n旧 bridge 内容\r\n${marker}\r\n# 更多用户内容`;
    fs.writeFileSync(dst, crlfExisting, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, bridgeContent.trimEnd());

    assert.ok(result.includes('Superpowers Skill 载入'), '在 CRLF 内容中替换应成功');
    assert.ok(result.startsWith('# 用户'), 'CRLF 前缀应保留');
  });

  it('边缘：AGENTS.md 仅有标记和 bridge 内容（无用户内容）', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    const onlyBridge = `${marker}\n旧 bridge\n${marker}`;
    fs.writeFileSync(dst, onlyBridge, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, bridgeContent.trimEnd());

    assert.ok(result.includes('Superpowers Skill 载入'), '替换后为新 bridge');
    assert.ok(!result.includes('旧 bridge'), '旧内容被替换');
  });

  it('边缘：AGENTS.md 为空文件', () => {
    const dst = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(dst, '', 'utf-8');

    // 空文件 → grep -c 返回 0 → 走追加分支
    const existing = fs.readFileSync(dst, 'utf-8');
    const matches = (existing.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []);
    assert.strictEqual(matches.length, 0, '空文件无标记');

    // 追加
    fs.appendFileSync(dst, '\n' + bridgeContent, 'utf-8');
    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.includes('Superpowers Skill 载入'), '空文件可追加 bridge 内容');
  });
});
