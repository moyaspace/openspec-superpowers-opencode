import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guard = await import(pathToFileURL(join(root, "scripts", "assert-global-bin-unchanged.mjs")).href);

function tmpDir(prefix = "guard-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

function seed(dir, name, content) {
  writeFileSync(join(dir, name), content);
}

/**
 * 这些用例会故意触发 guard 的失败/通过分支，guard 会往 stdout/stderr 打
 * 形如「✗ 全局 bin 被修改」的日志。在 gate 日志里那是误导性噪声，
 * 所以断言期间静音，只保留返回值用于断言。
 */
function quietly(fn) {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("snapshotBin()", () => {
  test("returns null for a missing directory", () => {
    assert.equal(guard.snapshotBin(join(tmpdir(), "guard-does-not-exist-xyz")), null);
  });

  test("returns null when dir is null", () => {
    assert.equal(guard.snapshotBin(null), null);
  });

  test("collects only openspec* files and hashes their content", () => {
    const dir = tmpDir();
    try {
      seed(dir, "openspec.cmd", "a");
      seed(dir, "openspec-orig.cmd", "b");
      seed(dir, "unrelated.txt", "c");
      const snap = guard.snapshotBin(dir);
      assert.deepEqual(Object.keys(snap.files).sort(), ["openspec-orig.cmd", "openspec.cmd"]);
      assert.match(snap.files["openspec.cmd"].hash, /^[0-9a-f]{64}$/);
      assert.notEqual(snap.files["openspec.cmd"].hash, snap.files["openspec-orig.cmd"].hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips a directory whose name matches the prefix", () => {
    const dir = tmpDir();
    try {
      seed(dir, "openspec.cmd", "a");
      mkdirSync(join(dir, "openspec-dir"));
      const snap = guard.snapshotBin(dir);
      assert.deepEqual(Object.keys(snap.files), ["openspec.cmd"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("diffSnapshots()", () => {
  const snap = (files) => ({
    dir: "x",
    files: Object.fromEntries(
      Object.entries(files).map(([name, hash]) => [name, { hash, symlink: false, target: null }]),
    ),
  });

  test("reports nothing when identical", () => {
    assert.deepEqual(guard.diffSnapshots(snap({ a: "1" }), snap({ a: "1" })), []);
  });

  test("reports modified when content changed", () => {
    assert.deepEqual(guard.diffSnapshots(snap({ a: "1" }), snap({ a: "2" })), [
      { kind: "modified", name: "a" },
    ]);
  });

  test("reports removed before added, in sorted name order", () => {
    assert.deepEqual(guard.diffSnapshots(snap({ a: "1" }), snap({ b: "1" })), [
      { kind: "removed", name: "a" },
      { kind: "added", name: "b" },
    ]);
  });

  test("reports retargeted when a symlink points elsewhere", () => {
    const before = { dir: "x", files: { a: { hash: "1", symlink: true, target: "/old" } } };
    const after = { dir: "x", files: { a: { hash: "1", symlink: true, target: "/new" } } };
    assert.deepEqual(guard.diffSnapshots(before, after), [
      { kind: "retargeted", name: "a", detail: "/old -> /new" },
    ]);
  });
});

describe("formatChanges()", () => {
  test("renders one line per change", () => {
    const text = guard.formatChanges([
      { kind: "modified", name: "openspec.cmd" },
      { kind: "retargeted", name: "openspec", detail: "a -> b" },
    ]);
    assert.equal(text, "  - modified: openspec.cmd\n  - retargeted: openspec (a -> b)");
  });
});

describe("main()", () => {
  test("exits 2 when the separator or command is missing", () => {
    assert.equal(quietly(() => guard.main([])), 2);
    assert.equal(quietly(() => guard.main(["node"])), 2);
    assert.equal(quietly(() => guard.main(["node", "--"])), 2);
  });

  test("passes through the child exit code when the global bin is unchanged", () => {
    const dir = tmpDir();
    const previous = process.env.OSO_GUARD_BIN_DIR;
    try {
      seed(dir, "openspec.cmd", "a");
      process.env.OSO_GUARD_BIN_DIR = dir;
      assert.equal(quietly(() => guard.main(["--", "node", "-e", "process.exit(7)"])), 7);
    } finally {
      if (previous === undefined) delete process.env.OSO_GUARD_BIN_DIR;
      else process.env.OSO_GUARD_BIN_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails when the child mutates the global bin", () => {
    const dir = tmpDir();
    const script = join(dir, "mutator.cjs");
    const previous = process.env.OSO_GUARD_BIN_DIR;
    try {
      seed(dir, "openspec.cmd", "a");
      writeFileSync(
        script,
        [
          "const fs = require('node:fs');",
          "const path = require('node:path');",
          "fs.writeFileSync(path.join(process.env.OSO_GUARD_BIN_DIR, 'openspec.cmd'), 'tampered');",
          "",
        ].join("\n"),
      );
      process.env.OSO_GUARD_BIN_DIR = dir;
      assert.equal(quietly(() => guard.main(["--", "node", script])), 1);
      assert.equal(readFileSync(join(dir, "openspec.cmd"), "utf8"), "tampered");
    } finally {
      if (previous === undefined) delete process.env.OSO_GUARD_BIN_DIR;
      else process.env.OSO_GUARD_BIN_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
