# 垫片符号链接事故复盘

## 第一层：技术根因

### 问题现象

`install-shims` 安装垫片后，`openspec` 命令坏了：

```
$ openspec --version
file:///usr/local/dist/cli/index.js  not found
```

### 符号链接从哪来

`openspec` 通过 `npm install -g @fission-ai/openspec` 安装。npm 在 `/usr/local/bin/` 下创建的是**符号链接**，指向真正的文件：

```
/usr/local/bin/openspec → ../lib/node_modules/@fission-ai/openspec/bin/openspec.js
```

`openspec.js` 的内容只有一行：

```js
import '../dist/cli/index.js'
```

这个 `../dist/cli/index.js` 是**相对路径**，从 `openspec.js` 所在目录（`.../openspec/bin/`）解析是正确的。

### 垫片安装时发生了什么

`copyOpenspecToOrig()` 用 `fs.copyFileSync()` 备份 `openspec` 为 `openspec-orig`。但 `copyFileSync` 会**跟随符号链接**——它把 `openspec.js` 的**文件内容**复制到了 `/usr/local/bin/openspec-orig`。

现在 `openspec-orig` 在 `/usr/local/bin/` 下，相对路径 `../dist/cli/index.js` 解析成了 `/usr/local/dist/cli/index.js`——这个路径不存在。

```
/usr/local/bin/openspec → ../lib/node_modules/@fission-ai/openspec/bin/openspec.js
                                                                    ↓ copyFileSync 跟随链接
/usr/local/bin/openspec-orig  ← 内容: import '../dist/cli/index.js'
                                    ↑ 从 /usr/local/bin/ 解析 → /usr/local/dist/cli/index.js ❌
```

### 为什么测试没测出来

测试只覆盖了**常规文件**场景，没覆盖 npm -g 安装的**符号链接**场景。

### 修复一：备份时保留符号链接

检测源文件是否为符号链接，如果是则创建 `openspec-orig` 为指向同一目标的符号链接，而不是跟随链接复制文件内容。

### 还有一个坑：写入垫片时覆盖了 openspec.js

`copyOpenspecToOrig()` 修复后，`installShimScripts()` 用 `fs.writeFileSync()` 把垫片脚本写入 `/usr/local/bin/openspec`。但此时 `openspec` 还是**符号链接**（上一步只备份了它，没有删除它），`writeFileSync` 跟随链接直接覆盖了 `openspec.js` 目标文件。

```
/usr/local/bin/openspec → ../lib/node_modules/@fission-ai/openspec/bin/openspec.js
                                                                ↓ writeFileSync 跟随链接
openspec.js 被垫片内容覆盖！
```

**修复二**：`installShimScripts()` 写入前先 `unlinkSync` 删除已有文件/符号链接。

### 平台测试分离

3 个 Windows 专属测试在 Linux/macOS 上会失败。加 `process.platform` 守卫跳过：

```js
if (process.platform !== 'win32') return t.skip('Windows only');
```

### 还有一个坑：旧 openspec-orig 残留

修复后的代码有能力正确处理符号链接，但 `installShims()` 中有一个「存在就跳过」的优化：

```js
if (!origExists) {
    copyOpenspecToOrig(binDir, isWin); // 修复后的代码
} else {
    // 旧版本留下的损坏 openspec-orig 永远没机会被修理
}
```

旧版本已经把 `openspec-orig` 写坏了（普通文件而非符号链接），修复后的代码虽然有能力正确处理，但因为「存在就跳过」的逻辑，永远不会执行。

**修复二**：`installShims()` 中始终调用 `copyOpenspecToOrig()`，不再跳过。

### 还有一个坑：垫片备份垫片

`npm install -g` 的 `install` 脚本会在安装时自动运行 `install-shims`。如果在垫片**已安装**的状态下再次运行 `install-shims`，`copyOpenspecToOrig()` 会把垫片脚本本身当做 openspec 的原版备份——结果 `openspec-orig` 还是一个垫片。

**修复三**：`copyOpenspecToOrig()` 检测源文件内容是否包含 `openspec shim for oso registry` 标记。如果是垫片，保留现有 `openspec-orig` 不动。
```