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

### 修复

检测源文件是否为符号链接，如果是则创建 `openspec-orig` 为指向同一目标的符号链接，而不是跟随链接复制文件内容。

### 平台测试分离

3 个 Windows 专属测试在 Linux/macOS 上会失败。加 `process.platform` 守卫跳过：

```js
if (process.platform !== 'win32') return t.skip('Windows only');
```