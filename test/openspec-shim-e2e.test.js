/**
 * 真实 shim 全链路端到端：用户敲 openspec → shim 拦截/透传 → openspec-orig。
 * 前提：本机已安装 openspec CLI 且 OSO 已 install（垫片就位）。任一前提缺失则跳过。
 * 与 shims-installer.test.js 的区别：那套用 fixture 验证安装器的文件操作；
 * 本套件对真实全局环境发起真实 CLI 调用（无替身）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runOpen(cmd, args) {
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', cmd, ...args], { encoding: 'utf8' })
    : spawnSync(cmd, args, { encoding: 'utf8' });
  return { out: (r.stdout ?? '') + (r.stderr ?? ''), status: r.status ?? -1 };
}

const shim = runOpen('openspec', ['--version']);
// 当前机器形态二选一：装了 OSO 后为 shim+openspec-orig；未装时裸 openspec 原样可用。
// 本套件只在 shim 形态下有验证意义；裸形态跳过。
const orig = runOpen('openspec-orig', ['--version']);
const shimFormPresent = shim.status === 0 && orig.status === 0;

describe('openspec shim end-to-end [real CLI]', { skip: !shimFormPresent && 'openspec shim form not present on this machine (bare openspec or none)' }, () => {
  test('shim passes through --version identically to openspec-orig', () => {
    assert.equal(shim.status, 0);
    assert.equal(orig.status, 0);
    assert.equal(shim.out.trim(), orig.out.trim(), 'shim and orig must report the same version');
  });

  test('shim intercepts `openspec list` (registry-aware output, not passthrough)', () => {
    const r = runOpen('openspec', ['list']);
    assert.equal(r.status, 0, `openspec list failed: ${r.out.slice(0, 300)}`);
    assert.ok(
      !/Usage:|command not found/i.test(r.out),
      'list should be intercepted by OSO shim, not fall through to openspec-orig',
    );
  });

  test('non-intercepted subcommands pass through to openspec-orig', () => {
    const r = runOpen('openspec', ['validate', '--help']);
    assert.equal(r.status, 0, `passthrough validate --help failed: ${r.out.slice(0, 300)}`);
  });
});
