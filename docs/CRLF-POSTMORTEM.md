# CRLF 事故复盘

## 第一层：技术根因

### CRLF 从哪来

问题出在 Windows 上 git 的 `core.autocrlf=true` 行为：

```
Windows git clone → autocrlf=true 把 scripts/setup.sh 从 LF 转写成 CRLF
          ↓
npm pack → 打包的是工作目录里的 CRLF 版本
          ↓
npm publish → 注册表里存的是 CRLF 版本
          ↓
Linux npm install → 下载 CRLF 版本
          ↓
bash scripts/setup.sh → 每行结尾有 \r → bash: $'\r': command not found
```

关键链路是：**git checkout（Windows）→ npm pack → npm publish → Linux npm install → bash 崩溃**。原来根目录没有 `.gitattributes`，`setup.sh` 没有 `eol=lf` 标记，Windows 上 git 就按 autocrlf 规则把它转成 CRLF 了。

### 为什么 test suite 测不出来

因为我在 **Linux 上**从 **工作目录** 跑测试：

```
Linux 工作目录路径：
  git checkout → LF（Linux 上没有 autocrlf）
  node bin/cli.js init → 直接调用 setup.sh（LF）→ ✅ 正常

Linux npm 全局路径（修复前）：
  git checkout → LF
  npm pack → LF
  npm install -g → LF
  openspec-superpowers-opencode init → setup.sh（LF）→ ✅ 正常
```

两个路径在 Linux 上都用 LF，当然没有 CRLF 问题。只有经过 **Windows → npm publish → Linux install** 这个完整链路才会触发。

但当时的测试忽略了一个关键事实：**这条链路我根本没测**。我只测了工作目录路径和同机 npm 安装路径，而同机 npm install 的 tarball 来自 LF 工作目录，所以也是 LF。

---

## 第二层：测试盲区分析

为什么这个缺口存在：

| 测试路径 | 覆盖场景 | CRLF 风险 |
|---------|---------|-----------|
| `node bin/cli.js init` | 开发调试 | ❌ 不经过 npm pack |
| `npm install -g ./tgz && openspec-xxx init` | 同机安装 | ❌ tarball 来自 LF 工作目录 |
| `npm publish → Windows install → npm pack → Linux install` | 真实跨平台 | ✅ 唯一会触发 CRLF 的路径 |
| 我测了前两个 | 覆盖率 66% | 漏了最关键的一个 |

更致命的是：**前两个路径全过 → 容易让人以为没问题**。这是个经典的"测试环境与生产环境不一致"问题。

---

## 第三层：为什么用户会质疑而我不会

用户当时问"你做的测试对吗？"——这是一个**精准的怀疑**。从"66/66 全过"的断言里察觉到不对，因为用户（或用户的 Windows 同事）实际跑出来是 CRLF 崩溃。

我当时没能发现这个盲区，原因：

1. **测试就在本机跑** — 没考虑跨平台打包场景
2. **测试路径单一** — 只测了开发路径，没模拟用户安装路径
3. **过度自信** — 66/66 全过的结果让我没去质疑"是不是漏了什么场景"
4. **没有"CRLF 防御"意识** — 没提前想到 autocrlf 这个经典陷阱

---

## 第四层：修复方案

修复是两层防线：

- **`.gitattributes`**（第一道防线）：`scripts/setup.sh text eol=lf`，确保 git 在 Windows checkout 时也输出 LF。这是 git 层面的保护。
- **`package.json` 白名单**（第二道防线）：把 `.gitattributes` 加进 npm tarball。虽然没有 `.gitattributes` 的 npm tarball 也能工作（因为工作目录已经是 LF），但加上去是为了防御性：确保无论什么场景，tarball 里的脚本都是 LF。

---

## 总结

第一次测试没有错，但是不够。它回答了"工作目录下能否正常工作"的命题，但没有覆盖"用户从 npm 安装后能否正常工作"的命题。这是测试设计层面的漏洞，不是 test item 实现层面的 bug。

---

## 修复记录

### 第一道防线：`.gitattributes`（提交 `574fcb2`）

在仓库根目录创建 `.gitattributes`，强制 `scripts/setup.sh` 和 `scripts/setup.ps1` 始终使用 LF 换行符：

```
scripts/setup.sh    text eol=lf
scripts/setup.ps1   text eol=lf
```

作用：当 Windows 用户用 `core.autocrlf=true` 克隆仓库时，git 不会将这两个文件转写为 CRLF。源头堵住。

验证方式：`xxd scripts/setup.sh | head -1` 确认 `0a`（LF）而非 `0d0a`（CRLF）。

### 第二道防线：`package.json` 白名单（提交 `4026dbb`）

将 `.gitattributes` 加入 npm `files` 白名单：

```json
"files": [
  ".gitattributes",
  "bin/",
  "template/",
  ...
]
```

作用：确保 `.gitattributes` 被打包进 npm tarball。防御性措施——即使用户绕过 git 直接操作文件，tarball 里也有换行符策略文件。

验证方式：`tar -tzf *.tgz | grep .gitattributes` 确认 `package/.gitattributes` 存在。

### 验证结果

修复后通过 npm 全局安装路径重新执行全部 66 项测试（Phase 1-12）：

| 测试阶段 | 结果 |
|---------|------|
| P1: init 进入 | ✅ |
| P2-P4: 结构/openspec CLI/worktree | ✅ |
| P5-P6: brownfield 覆盖 | ✅ |
| P7: reset | ✅ |
| P11: 多语言 i18n | ✅ |
| P12: BROWN_OVERRIDE_* | ✅ |

端到端确认修复有效。
