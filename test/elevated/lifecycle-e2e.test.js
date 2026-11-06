/**
 * 全生命周期端到端（提权套件）：npm pack → install -g → init → registry → reset。
 * 前提：需要对 npm 全局/临时目录写入，因此位于 test/elevated/（npm test 尾声经 gsudo 编排）。
 * 未装 openspec 时跳过 openspec 相关断言。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, delimiter } from 'node:path';
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

/**
 * 隔离 bin 目录：把**真实的 openspec 可执行文件复制一份**放进去，并前置到 PATH。
 *
 * 为什么需要：`oso init` 的 ensureShim 会执行 installShims，其 findOpenspecBinDir
 * 用 `where`/`which openspec` 定位 bin。
 * 不隔离就会写进**机器全局** npm bin，TOOL_DIR 指向随后被删除的临时项目，
 * 收尾时把开发机的 openspec 弄坏（ps1/cmd 指向不存在的目录）。
 *
 * 为什么复制真文件而不是 dummy：shim 会把这里的 openspec 备份成 openspec-orig
 * 并回落到它。dummy 什么都不输出，会让 init 的内部验证失败。
 */
function makeIsolatedBin() {
  const bin = mkdtempSync(join(tmpdir(), 'oso-lifecycle-bin-'));
  const probe = process.platform === 'win32'
    ? spawnSync('where.exe', ['openspec'], { encoding: 'utf8' })
    : spawnSync('which', ['openspec'], { encoding: 'utf8' });
  const found = (probe.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let copied = 0;
  for (const p of found) {
    const name = basename(p);
    if (!name.startsWith('openspec')) continue;
    if (existsSync(join(bin, name))) continue;
    if (process.platform === 'win32') {
      copyFileSync(p, join(bin, name));
    } else {
      // npm's global bin entry is a symlink into the package, e.g. bin/openspec.js
      // whose body is `import '../dist/cli/index.js'`. copyFileSync follows the
      // symlink, so the relocated copy resolves that relative import against the
      // temp dir and fails. Wrap the resolved absolute path instead.
      writeFileSync(
        join(bin, name),
        `#!/bin/sh\nexec node "${realpathSync(p)}" "$@"\n`,
        { mode: 0o755 },
      );
    }
    copied += 1;
  }
  if (copied === 0) {
    writeFileSync(join(bin, 'openspec.cmd'), '@echo off\r\nexit /b 0\r\n');
    writeFileSync(join(bin, 'openspec.ps1'), 'exit 0\r\n');
    writeFileSync(join(bin, 'openspec'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  const opencodeProbe = process.platform === 'win32'
    ? spawnSync('where.exe', ['opencode'], { encoding: 'utf8' })
    : spawnSync('which', ['opencode'], { encoding: 'utf8' });
  const hasOpencode = (opencodeProbe.stdout ?? '').trim().length > 0;
  if (!hasOpencode) {
    // `opencode` is a documented prerequisite that CI images do not ship, and
    // `oso init` only probes `opencode --version`. A version-printing stub keeps
    // the lifecycle test runnable without pulling the native binary.
    if (process.platform === 'win32') {
      writeFileSync(join(bin, 'opencode.cmd'), '@echo off\r\necho 0.0.0-stub\r\n');
      writeFileSync(join(bin, 'opencode.ps1'), "Write-Output '0.0.0-stub'\r\n");
    } else {
      writeFileSync(join(bin, 'opencode'), '#!/bin/sh\necho 0.0.0-stub\n', { mode: 0o755 });
    }
  }
  return bin;
}

const isolatedBin = makeIsolatedBin();
const project = join(workRoot, 'proj-e2e');
const cliEntry = join(project, 'node_modules', '@moyaspace', 'openspec-superpowers-opencode', 'dist', 'cli', 'index.js');

describe('OSO lifecycle end-to-end [elevated]', () => {
  test('npm pack produces installable tarball and oso init deploys project', () => {
    const pack = run('npm', ['pack', '--pack-destination', workRoot, repoRoot], workRoot, 300000);
    assert.equal(pack.status, 0, `npm pack failed: ${pack.out.slice(0, 300)}`);
    const tgz = readdirSync(workRoot).find((f) => f.endsWith('.tgz'));
    assert.ok(tgz, 'tarball not produced');

    mkdirSync(project, { recursive: true });
    const inst = run('npm', ['install', join(workRoot, tgz), '--no-audit', '--no-fund'], project, 600000, {
      PATH: isolatedBin + delimiter + (process.env.PATH ?? ''),
    });
    assert.equal(inst.status, 0, `npm install oso failed: ${inst.out.slice(0, 400)}`);
    assert.equal(existsSync(cliEntry), true, 'cli entry missing after install');

    const init = run('node', [cliEntry, 'init', '.'], project, 600000, {
      PATH: isolatedBin + delimiter + (process.env.PATH ?? ''),
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
    rmSync(isolatedBin, { recursive: true, force: true });
    assert.equal(existsSync(workRoot), false);
    assert.equal(existsSync(isolatedBin), false);
  });
});
