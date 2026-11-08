# OSO 升级指南

> 版本特定的升级注意事项。README 保持常青；只适用于某个版本区间的内容写在这里。

---

## 从 1.1.1 升级：重建 `openspec` 垫片

1.1.2 把实现从 `lib/` 迁到了 `dist/`，而垫片的健康检查键绑在这个目录上。升级后旧垫片会在首次调用时发现 `lib/` 不存在，自动把原始 `openspec` CLI 还原并删除自己——所以 `openspec` 本身仍可用，但「`openspec list` 跨 worktree 拦截」会一直失效，直到重建垫片：

```bash
oso install-shims     # 或直接跑 `oso init`，它会自动修复
```

验证：

```bash
oso --version         # 1.1.2
openspec --version    # 真正的 openspec CLI 版本，如 1.3.1
oso verify            # openspec (shim) 一项必须通过
```

---

## 多个 Node 安装（nvm、Volta、系统 npm）

垫片记录的是**绝对路径**。如果你切换过 Node 版本，或同时装了系统 Node 与 nvm 管的 Node，`npm i -g` 可能装进一个 prefix，而 PATH 上的 `openspec` 指向另一个。先比对：

```bash
npm root -g           # 包实际装到了哪
which openspec        # macOS / Linux
where openspec        # Windows
```

不一致时，用拥有该 bin 目录的那个 npm 重新安装，或跑 `oso install-shims` 把垫片重新指向当前包。

---

## 安全移除垫片

`oso uninstall-shims` 会从 `openspec-orig` 备份还原 `openspec` 并删除垫片文件。**必须在卸载包之前运行**，因为该命令本身在包里：

```bash
oso uninstall-shims
openspec --version                                  # 此时应是真正的 CLI
npm uninstall -g @moyaspace/openspec-superpowers-opencode
```

**`openspec-orig` 缺失时不要先删包**：1.1.x 的垫片在备份不存在时会回落到调用自身，可能让 `openspec` 无法使用。先检查：

```bash
ls "$(dirname "$(which openspec)")/openspec-orig"
```

1.1.2 同样有自愈（它的垫片检查 `dist/registry-utils.js`），所以只要 `openspec-orig` 在，跳过 `oso uninstall-shims` 直接删包也是安全的。
