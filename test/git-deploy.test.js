// .gitignore / .gitattributes / .editorconfig 部署逻辑测试
// 覆盖 marker 检测/替换/追加三种场景，与 AGENTS.md 部署逻辑一致
//
// 通用规则：
//   < 2 个 marker → 无 bridge → 静默追加
//   ≥ 2 个 marker → 已有 bridge → Prompt 替换/跳过

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const templateDir = path.resolve(__dirname, '..', 'template');

// 模板内容和 marker
const gitignoreMarker     = 'openspec-superpowers-opencode_gitignore';
const gitattrMarker       = 'openspec-superpowers-opencode_gitattributes';
const editorconfigMarker  = 'openspec-superpowers-opencode_editorconfig';
const gitignoreContent     = fs.readFileSync(path.join(templateDir, '_gitignore'), 'utf-8');
const gitattrContent       = fs.readFileSync(path.join(templateDir, '_gitattributes'), 'utf-8');
const editorconfigContent  = fs.readFileSync(path.join(templateDir, '_editorconfig'), 'utf-8');

// 通用测试运行器：对所有 marker/内容对分别执行同一组断言
function forBothMarkers(name, fn) {
  const scenarios = [
    { name: '.gitignore', marker: gitignoreMarker, content: gitignoreContent, file: '_gitignore' },
    { name: '.gitattributes', marker: gitattrMarker, content: gitattrContent, file: '_gitattributes' },
    { name: '.editorconfig', marker: editorconfigMarker, content: editorconfigContent, file: '_editorconfig' },
  ];
  for (const s of scenarios) {
    it(`${name} (${s.name})`, () => fn(s));
  }
}

describe('.gitignore / .gitattributes / .editorconfig 部署逻辑', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-deploy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- 场景 1：绿地（文件不存在）----

  forBothMarkers('绿地：文件不存在时直接写入内容', (s) => {
    const dst = path.join(tmpDir, s.file);
    // 模拟绿地分支：直接写 template 内容
    fs.writeFileSync(dst, s.content, 'utf-8');

    const written = fs.readFileSync(dst, 'utf-8');
    assert.strictEqual(written, s.content);
    assert.ok(written.includes(s.marker), `${s.name} 应包含标记`);
  });

  // ---- 场景 2：棕地，已有标记 ----

  forBothMarkers('棕地已有标记：标记间内容被更新（模拟替换）', (s) => {
    const dst = path.join(tmpDir, s.file);
    const oldContent = `# 用户自定义规则\n\n${s.marker}\n旧 bridge 内容\n${s.marker}\n# 更多用户规则\n`;
    fs.writeFileSync(dst, oldContent, 'utf-8');

    // 模拟替换逻辑：正则替换标记对之间的内容
    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}[\\s\\S]*?${escaped}`, 'g');
    const newContent = existing.replace(pattern, s.content.trimEnd());

    fs.writeFileSync(dst, newContent, 'utf-8');
    const result = fs.readFileSync(dst, 'utf-8');

    assert.ok(result.includes('# 用户自定义规则'), '用户前部内容应保留');
    assert.ok(result.includes('# 更多用户规则'), '用户后部内容应保留');
    assert.ok(!result.includes('旧 bridge 内容'), '旧 bridge 内容应被替换');
    // 验证新 bridge 核心规则（不依赖特定文本，仅检查 marker 间的实际内容）
    const match = result.match(new RegExp(`${escaped}([\\s\\S]*?)${escaped}`));
    assert.ok(match, '标记对应存在');
    // 内容不应包含旧 bridge 的标记
    assert.ok(!match[1] ? false : !match[1].includes(s.marker), '标记间不应嵌套标记');
  });

  forBothMarkers('棕地已有标记：跳过 — 文件不变', (s) => {
    const dst = path.join(tmpDir, s.file);
    const original = `# 用户\n${s.marker}\n旧\n${s.marker}\n# 更多`;
    fs.writeFileSync(dst, original, 'utf-8');

    // 模拟跳过：不做任何操作
    const result = fs.readFileSync(dst, 'utf-8');
    assert.strictEqual(result, original);
  });

  // ---- 标记检测 ----

  forBothMarkers('仅 1 个标记时不视为已有 bridge', (s) => {
    const dst = path.join(tmpDir, s.file);
    const content = `# 用户内容\n${s.marker}\n不完整的标记对\n`;
    fs.writeFileSync(dst, content, 'utf-8');

    // 检测标记数
    const matches = content.match(new RegExp(s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    const count = matches ? matches.length : 0;
    assert.strictEqual(count, 1, `${s.name} 应有 1 个标记`);

    // < 2 → 走追加分支
    if (count < 2) {
      fs.appendFileSync(dst, '\n' + s.content, 'utf-8');
    }

    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.includes('# 用户内容'), '用户内容应保留');
    // 现在应有 3 个标记（原 1 个 + template 中的 2 个）
    const finalMatches = result.match(new RegExp(s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    assert.strictEqual(finalMatches ? finalMatches.length : 0, 3, `${s.name} 最终应有 3 个标记`);
  });

  // ---- 场景 3：棕地，无标记 ----

  forBothMarkers('棕地无标记：追加内容到末尾', (s) => {
    const dst = path.join(tmpDir, s.file);
    const userContent = `# 用户自有 ${s.name}\n\n# 一些自定义忽略规则\n*.log\nnode_modules/\n`;
    fs.writeFileSync(dst, userContent, 'utf-8');

    // 模拟静默追加
    fs.appendFileSync(dst, '\n' + s.content, 'utf-8');

    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.startsWith('# 用户自有'), '用户内容应在文件开头');
    assert.ok(result.trimEnd().endsWith(s.content.trimEnd()), 'bridge 内容应在文件末尾');
    assert.ok(result.includes(s.marker), '应包含 bridge 标记');
  });

  // ---- 标记计数 <2 / ≥2 判定 ----

  forBothMarkers('grep -c 风格：标记计数判定', (s) => {
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 0 标记
    const noMarker = '# 无标记内容\n*.tmp\n';
    const count0 = (noMarker.match(new RegExp(escaped, 'g')) || []).length;
    assert.strictEqual(count0, 0, `${s.name} 无标记时计数为 0`);
    assert.ok(count0 < 2, '0 < 2 → 走追加分支');

    // 1 标记
    const oneMarker = `# 内容\n${s.marker}\n不完整`;
    const count1 = (oneMarker.match(new RegExp(escaped, 'g')) || []).length;
    assert.strictEqual(count1, 1, `${s.name} 1 个标记`);
    assert.ok(count1 < 2, '1 < 2 → 走追加分支');

    // 2 标记
    const twoMarker = `# 内容\n${s.marker}\nbridge\n${s.marker}\n# 更多`;
    const count2 = (twoMarker.match(new RegExp(escaped, 'g')) || []).length;
    assert.strictEqual(count2, 2, `${s.name} 2 个标记`);
    assert.ok(count2 >= 2, '2 ≥ 2 → 走替换分支');

    // 3 标记
    const threeMarker = `# 内容\n${s.marker}\nb1\n${s.marker}\n中\n${s.marker}\nb2`;
    const count3 = (threeMarker.match(new RegExp(escaped, 'g')) || []).length;
    assert.strictEqual(count3, 3, `${s.name} 3 个标记`);
    assert.ok(count3 >= 2, '3 ≥ 2 → 走替换分支');
  });

  // ---- python3 re.sub 模式 ----

  forBothMarkers('python3 re.sub 模式：count=1 仅替换第一个标记对', (s) => {
    const dst = path.join(tmpDir, s.file);
    // 两个标记对
    const content = `# 用户\n${s.marker}\n旧内容 A\n${s.marker}\n# 中间\n${s.marker}\n旧内容 B\n${s.marker}\n# 末尾`;
    fs.writeFileSync(dst, content, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // re.sub(pattern, bridge.strip(), existing, count=1, flags=re.DOTALL)
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, s.content.trimEnd());

    fs.writeFileSync(dst, result, 'utf-8');
    const final = fs.readFileSync(dst, 'utf-8');

    assert.ok(!final.includes('旧内容 A'), '第一个标记对内容应被替换');
    assert.ok(final.includes('旧内容 B'), '第二个标记对内容应保留');
    assert.ok(final.includes('# 用户'), '开头用户内容应保留');
    assert.ok(final.includes('# 末尾'), '末尾用户内容应保留');
  });

  forBothMarkers('python3 re.sub 模式：`.strip()` 去除尾部换行', (s) => {
    const dst = path.join(tmpDir, s.file);
    const content = `前缀\n${s.marker}\n旧\n${s.marker}\n后缀`;
    fs.writeFileSync(dst, content, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, s.content.trimEnd());

    assert.ok(result.startsWith('前缀'), '前缀应保留');
    assert.ok(result.endsWith('后缀'), '后缀应保留');
  });

  // ---- 跨平台 ----

  forBothMarkers('CRLF 换行：标记在 \\r\\n 中仍被正确识别', (s) => {
    const dst = path.join(tmpDir, s.file);
    const crlfExisting = `# 用户\r\n${s.marker}\r\n旧 bridge 内容\r\n${s.marker}\r\n# 更多用户内容\r\n`;
    fs.writeFileSync(dst, crlfExisting, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, s.content.trimEnd());

    assert.ok(result.startsWith('# 用户'), 'CRLF 前缀应保留');
    assert.ok(result.includes(s.marker), 'CRLF 内容中标记应保留');
  });

  // ---- 边缘 ----

  forBothMarkers('边缘：仅有标记和 bridge 内容（无用户内容）', (s) => {
    const dst = path.join(tmpDir, s.file);
    const onlyBridge = `${s.marker}\n旧内容\n${s.marker}`;
    fs.writeFileSync(dst, onlyBridge, 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const escaped = s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped + '[\\s\\S]*?' + escaped);
    const result = existing.replace(pattern, s.content.trimEnd());

    assert.ok(result.includes(s.marker), '替换 후 marker 应存在');
    assert.ok(!result.includes('旧内容'), '旧内容应被替换');
  });

  forBothMarkers('边缘：空文件', (s) => {
    const dst = path.join(tmpDir, s.file);
    fs.writeFileSync(dst, '', 'utf-8');

    const existing = fs.readFileSync(dst, 'utf-8');
    const matches = (existing.match(new RegExp(s.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []);
    assert.strictEqual(matches.length, 0, '空文件无标记');

    // 追加
    fs.appendFileSync(dst, '\n' + s.content, 'utf-8');
    const result = fs.readFileSync(dst, 'utf-8');
    assert.ok(result.includes(s.marker), '空文件可追加 bridge 内容');
  });

  // ---- template 一致性 ----

  it('template/_gitignore 包含恰好的 marker 对', () => {
    const escaped = gitignoreMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = gitignoreContent.match(new RegExp(escaped, 'g'));
    assert.strictEqual(matches ? matches.length : 0, 2, '_gitignore template 应有恰好 2 个 marker');
  });

  it('template/_gitattributes 包含恰好的 marker 对', () => {
    const escaped = gitattrMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = gitattrContent.match(new RegExp(escaped, 'g'));
    assert.strictEqual(matches ? matches.length : 0, 2, '_gitattributes template 应有恰好 2 个 marker');
  });

  it('template/_editorconfig 包含恰好的 marker 对', () => {
    const escaped = editorconfigMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = editorconfigContent.match(new RegExp(escaped, 'g'));
    assert.strictEqual(matches ? matches.length : 0, 2, '_editorconfig template 应有恰好 2 个 marker');
  });

  it('.gitignore marker 在 # 注释行中（忽略 # 前缀也可搜索到）', () => {
    assert.ok(gitignoreContent.includes('# <!--'), 'gitignore marker 应在 # 注释行中');
    assert.ok(gitignoreContent.includes(gitignoreMarker), 'marker 文本可被 grep 直接搜索');
  });

  it('.gitattributes marker 在 # 注释行中', () => {
    assert.ok(gitattrContent.includes('# <!--'), 'gitattributes marker 应在 # 注释行中');
    assert.ok(gitattrContent.includes(gitattrMarker), 'marker 文本可被 grep 直接搜索');
  });

  it('.editorconfig marker 在 # 注释行中', () => {
    assert.ok(editorconfigContent.includes('# <!--'), 'editorconfig marker 应在 # 注释行中');
    assert.ok(editorconfigContent.includes(editorconfigMarker), 'marker 文本可被 grep 直接搜索');
  });
});
