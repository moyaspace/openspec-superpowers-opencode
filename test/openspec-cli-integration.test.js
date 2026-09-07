/**
 * 真实 openspec CLI 集成：OSO 部署的 schema/模板被真实 CLI 正确消费。
 * 前提：本机已安装 openspec CLI；缺失时整体跳过（CI 上装 openspec 后运行）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync, cpSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function runOpen(args, cwd) {
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'openspec', ...args], { cwd, encoding: 'utf8' })
    : spawnSync('openspec', args, { cwd, encoding: 'utf8' });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), status: r.status ?? -1 };
}

const probe = runOpen(['--version']);
const openspecAvailable = probe.status === 0;

describe('openspec CLI consumes OSO schema [real CLI]', { skip: !openspecAvailable && 'openspec CLI not installed on this machine' }, () => {
  const work = mkdtempSync(join(tmpdir(), 'oso-cli-integration-'));
  // 模拟 OSO init 的 openspec 部分：config.yaml + 完整 schemas/ 目录（含 templates/）
  const schemaDest = join(work, 'openspec', 'schemas', 'superpowers-bridge-opencode');
  cpSync(join(repoRoot, 'template', 'openspec', 'schemas', 'superpowers-bridge-opencode'), schemaDest, { recursive: true });
  copyFileSync(join(repoRoot, 'template', 'openspec', 'config.yaml'), join(work, 'openspec', 'config.yaml'));

  test('openspec new change applies OSO schema to the change', () => {
    const r = runOpen(['new', 'change', 'oso-cli-integration-check'], work);
    assert.equal(r.status, 0, `new change failed: ${r.out.slice(0, 300)}`);
    assert.match(r.out, /schema: superpowers-bridge-opencode/, 'CLI output must show OSO schema applied');
    const changeDir = join(work, 'openspec', 'changes', 'oso-cli-integration-check');
    assert.equal(existsSync(join(changeDir, '.openspec.yaml')), true, '.openspec.yaml missing');
    const yaml = readFileSync(join(changeDir, '.openspec.yaml'), 'utf8');
    assert.match(yaml, /schema: superpowers-bridge-opencode/, '.openspec.yaml must record OSO schema');
  });

  test('openspec instructions serves OSO template content for artifacts', () => {
    const r = runOpen(['instructions', 'proposal', '--change', 'oso-cli-integration-check'], work);
    assert.equal(r.status, 0, `instructions failed: ${r.out.slice(0, 300)}`);
    assert.match(r.out, /<artifact id="proposal" .*schema="superpowers-bridge-opencode"/, 'artifact block must carry OSO schema');
    assert.match(r.out, /Create the proposal artifact/, 'template task text missing — schema templates not consumed');
  });

  test('cleanup: change archived, changes/ back to bare state', () => {
    rmSync(join(work, 'openspec', 'changes', 'oso-cli-integration-check'), { recursive: true, force: true });
    assert.equal(existsSync(join(work, 'openspec', 'changes', 'oso-cli-integration-check')), false);
  });
});
