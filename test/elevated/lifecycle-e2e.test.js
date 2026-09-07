/**
 * 全生命周期端到端（提权套件）：npm pack → install -g → init → registry → reset。
 * 前提：需要对 npm 全局/临时目录写入，因此位于 test/elevated/（npm test 尾声经 gsudo 编排）。
 * 未装 openspec 时跳过 openspec 相关断言。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd, args, cwd, timeout = 180000, env) {
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { cwd, encoding: 'utf8', timeout, env: env ? { ...process.env, ...env } : undefined })
    : spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, env: env ? { ...process.env, ...env } : undefined });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), status: r.status ?? -1 };
}

const openspecAvailable = run('openspec', ['--version']).status === 0;
const workRoot = mkdtempSync(join(tmpdir(), 'oso-lifecycle-'));
const project = join(workRoot, 'proj-e2e');
const cliEntry = join(project, 'node_modules', '@moyaspace', 'openspec-superpowers-opencode', 'dist', 'cli', 'index.js');

describe('OSO lifecycle end-to-end [elevated]', () => {
  test('npm pack produces installable tarball and oso init deploys project', () => {
    const pack = run('npm', ['pack', '--pack-destination', workRoot, repoRoot], workRoot, 300000);
    assert.equal(pack.status, 0, `npm pack failed: ${pack.out.slice(0, 300)}`);
    const tgz = readdirSync(workRoot).find((f) => f.endsWith('.tgz'));
    assert.ok(tgz, 'tarball not produced');

    mkdirSync(project, { recursive: true });
    const inst = run('npm', ['install', join(workRoot, tgz), '--no-audit', '--no-fund'], project, 600000);
    assert.equal(inst.status, 0, `npm install oso failed: ${inst.out.slice(0, 400)}`);
    assert.equal(existsSync(cliEntry), true, 'cli entry missing after install');

    const init = run('node', [cliEntry, 'init', '.'], project, 600000, {
      BROWN_OVERRIDE_INIT: 'yes',
      BROWN_OVERRIDE_OPENSPEC: 'yes',
      BROWN_OVERRIDE_OCODEJSON: 'yes',
      BROWN_OVERRIDE_COMMANDS: 'yes',
      BROWN_OVERRIDE_SKILLS: 'yes',
      BROWN_OVERRIDE_AGENTS: 'yes',
      BROWN_OVERRIDE_REGISTRY: 'yes',
    });
    assert.equal(init.status, 0, `oso init failed: ${init.out.slice(0, 400)}`);
    assert.equal(existsSync(join(project, 'openspec', 'oso-change-registry.json')), true, 'registry missing');
    assert.equal(existsSync(join(project, 'openspec', 'schemas', 'superpowers-bridge-opencode')), true, 'schemas missing');
    assert.equal(existsSync(join(project, 'AGENTS.md')), true, 'AGENTS.md not deployed');
  });

  test('registry file is well-formed', () => {
    if (!openspecAvailable) return;
    const registry = JSON.parse(readFileSync(join(project, 'openspec', 'oso-change-registry.json'), 'utf8'));
    assert.ok(Array.isArray(registry.changes), 'registry.changes missing');
  });

  test('reset clears registry and preserves user files', () => {
    const reset = run('node', [cliEntry, 'reset'], project);
    assert.equal(reset.status, 0, `reset failed: ${reset.out.slice(0, 300)}`);
    const after = JSON.parse(readFileSync(join(project, 'openspec', 'oso-change-registry.json'), 'utf8'));
    assert.deepEqual(after.changes, [], 'registry not cleared');
    assert.equal(existsSync(join(project, 'AGENTS.md')), true, 'AGENTS.md must survive reset');
    assert.equal(existsSync(join(project, 'openspec', 'schemas', 'superpowers-bridge-opencode')), true, 'schemas must survive reset');
  });

  test('cleanup removes work root', () => {
    rmSync(workRoot, { recursive: true, force: true });
    assert.equal(existsSync(workRoot), false);
  });
});
