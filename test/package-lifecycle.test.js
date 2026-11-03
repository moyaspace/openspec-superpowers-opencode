import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('package lifecycle', () => {
  test('no preinstall/install/postinstall scripts', () => {
    for (const key of ['preinstall', 'install', 'postinstall']) {
      assert.equal(key in (pkg.scripts ?? {}), false, `scripts.${key} must not exist`);
    }
  });

  test('prepare carries the build', () => {
    assert.equal(pkg.scripts?.prepare, 'npm run build');
  });

  test('legacy install hook script is deleted', () => {
    assert.equal(fs.existsSync(path.join(root, 'scripts', 'shims-installer.mjs')), false);
  });

  test('tarball file list still includes dist/', () => {
    assert.ok((pkg.files ?? []).includes('dist/'));
  });
});

test('dist/ is ignored and untracked', () => {
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gitignore, /^dist\/$/m);
  const tracked = child_process.execFileSync('git', ['ls-files', 'dist'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(tracked, '');
});
