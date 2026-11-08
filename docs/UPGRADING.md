# Upgrading OSO

> Version-specific upgrade notes. The README stays evergreen; anything that only applies to a particular version range lives here.

---

## Upgrading from 1.1.1: rebuild the `openspec` shim

1.1.2 moves the implementation from `lib/` to `dist/`, and the shim's health check is tied to that directory. After upgrading, the old shim detects the missing `lib/` on its first invocation, restores the original `openspec` CLI, and removes itself — so `openspec` keeps working, but the registry-aware `openspec list` interception stays off until the shim is rebuilt:

```bash
oso install-shims     # or just run `oso init`, which repairs it automatically
```

Verify:

```bash
oso --version         # 1.1.2
openspec --version    # your real openspec CLI version, e.g. 1.3.1
oso verify            # the openspec (shim) item must pass
```

---

## Multiple Node installations (nvm, Volta, system npm)

The shim stores an **absolute** path to the installed package. If you switch Node versions, or have both a system Node and an nvm-managed one, `npm i -g` may install into one prefix while the `openspec` on your PATH lives in another. Compare:

```bash
npm root -g           # where the package actually landed
which openspec        # macOS / Linux
where openspec        # Windows
```

If they disagree, install with the npm that owns that bin directory, or run `oso install-shims` to re-point the shim at the current package.

---

## Removing the shim safely

`oso uninstall-shims` restores `openspec` from the `openspec-orig` backup and deletes the shim files. Run it **before** uninstalling the package, because the command itself lives in the package:

```bash
oso uninstall-shims
openspec --version                                  # should be the real CLI now
npm uninstall -g @moyaspace/openspec-superpowers-opencode
```

Do not remove the package while `openspec-orig` is missing: the 1.1.x shim falls back to invoking itself when its backup is absent, which can leave `openspec` unusable. Check first:

```bash
ls "$(dirname "$(which openspec)")/openspec-orig"
```

The same self-heal applies to 1.1.2 (its shim checks `dist/registry-utils.js`), so deleting the package without running `oso uninstall-shims` is also safe — as long as `openspec-orig` exists.
