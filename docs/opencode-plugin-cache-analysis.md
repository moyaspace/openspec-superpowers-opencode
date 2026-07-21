# OpenCode Plugin Cache 路径分析

> 结论：OpenCode 运行时从 **`~/.cache/opencode/packages/`** 加载 plugin，**不是** `node_modules/`。

---

## 问题

OpenCode 的 superpowers 插件在缓存目录中有两套安装：

```
~/.cache/opencode/
├── node_modules/
│   └── superpowers/                      ← A
└── packages/
    └── superpowers@git+https_/
        └── github.com/obra/superpowers.git/
            └── node_modules/
                └── superpowers/          ← B
```

两者版本可能不同（如 A=v5.1.0, B=v6.1.1）。运行时到底用哪个？

## 答案

**OpenCode plugin loader 使用 B 路径**（`packages/superpowers@git+https_/...`），`node_modules/` 下的 A 不被 plugin loader 使用。

## 证据

### 1. 文件修改时间

| 文件 | 修改时间 | 进程启动 |
|------|---------|---------|
| `packages/.../superpowers.js` | **9:37:38** | OpenCode 进程 9:37:16 启动，几乎同时 |
| `node_modules/superpowers.js` | 2026/5/12 | 5 月的旧文件 |

B 路径下 `superpowers.js` 的修改时间和 OpenCode 进程启动几乎同时，说明被 plugin loader 访问。

### 2. skill 文件路径

`superpowers.js` 源码第 13、51、93 行：

```js
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const superpowersSkillsDir = path.resolve(__dirname, '../../skills');
config.skills.paths.push(superpowersSkillsDir);
```

当前运行时 `brainstorming` skill 的实际路径为：

```
C:\Users\rloessplateau\.cache\opencode\packages\superpowers@git+https_\
  github.com\obra\superpowers.git\node_modules\superpowers\skills\
  brainstorming\SKILL.md
```

如果 `superpowers.js` 是从 `node_modules/` 加载的，路径应为 `node_modules/superpowers/skills/...`，但实际指向 `packages/` 路径。这是被加载的 `superpowers.js` 根据自身 `__dirname` 算出的结果，**确凿证明加载的是 B**。

### 3. 实验验证

将 `packages/superpowers@git+https_/` 目录改名后重启 OpenCode，该目录**自动重新创建**，且版本变为最新。说明 OpenCode 依赖此路径，启动时动态重建。

### 4. 源码确认

OpenCode 源码中（`oh-my-openagent` 的 `packages/opencode/src/plugin/shared.ts`）：

```typescript
export async function resolvePluginTarget(spec: string) {
  if (isPathPluginSpec(spec)) return resolvePathPluginTarget(spec)
  const hit = parse(spec)
  const pkg = hit?.name && hit.raw === hit.name ? `${hit.name}@latest` : spec
  const result = await Npm.add(pkg)     // ← 创建/使用 packages/ 缓存
  return result.directory               // ← 返回 packages/ 下路径
}
```

`Npm.add()` 创建/使用 `packages/` 下的 specifier 缓存目录，plugin loader 从该路径解析 entry point。

### 5. 官方文档不一致

OpenCode 官方文档（https://opencode.ai/docs/plugins/）写道：

> npm plugins are cached in `~/.cache/opencode/node_modules/`

但实际路径为 `~/.cache/opencode/packages/`。此为**已知文档 bug**，详见 GitHub issue [#32421](https://github.com/anomalyco/opencode/issues/32421)（「Plugin cache directory naming/path inconsistency」），已有 PR #32434 修正。

## `packages/` 结构说明

```
packages/
├── package.json           ← bun workspace（仅 oh-my-openagent / oh-my-opencode）
├── bun.lock
├── node_modules/          ← bun 安装的共享依赖
├── oh-my-openagent@latest/   ← npm registry 插件缓存
│   ├── package.json       → {"dependencies": {"oh-my-openagent": "x.y.z"}}
│   └── node_modules/oh-my-openagent/
├── superpowers@git+https_/   ← git+https plugin 缓存
│   └── github.com/obra/superpowers.git/
│       ├── package.json   → {"dependencies": {"superpowers": "github:obra/superpowers"}}
│       └── node_modules/superpowers/
├── @rehydra/opencode@latest/ ← scoped npm 插件缓存
└── ...
```

每个 plugin spec 在 `packages/` 下有一个编码后的子目录，包含一个 wrapper `package.json` 和 `node_modules/<实际包>/`。

## 已知问题

- **#25293**：`@latest` 版本缓存永不更新，首次安装后锁死在旧版本
- **#24828**：`git+https://` 和 `github:` 等非 registry specifier 的 cache hit 路径解析错误，首次安装正常，重启后 ENOENT
- **#32421**：文档中 `node_modules/` 与实际 `packages/` 路径不一致

## 总结

| 路径 | 角色 | 运行时加载 |
|------|------|-----------|
| `packages/.../superpowers/` | **plugin loader 的安装缓存** | **✅ 是** |
| `node_modules/superpowers/` | npm dependencies 独立安装 | ❌ 否 |
