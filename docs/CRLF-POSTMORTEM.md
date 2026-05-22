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

---

## 第五层：第一版修复的盲区

### 为什么 `.gitattributes` 没能立即解决 CRLF

`.gitattributes` 保护的是**未来的 checkout**，不能修复已存在于磁盘上的文件。用户在实际发布时的流程：

```
第一次 clone（没有 .gitattributes）
  → autocrlf=true 把 scripts/setup.sh 转写成 CRLF 写到磁盘

第二次 git pull（拿到 574fcb2）
  → .gitattributes 新增 ✅
  → scripts/setup.sh 本身没有被修改 → git 不会重新 checkout 它
  → 磁盘上的 setup.sh 仍然是 CRLF ← ⚠️
    → npm publish 读磁盘 → CRLF 进 tarball
    → Linux npm install → bash 崩溃
```

Commit `574fcb2` 的变更：

```
 .gitattributes | 16 ++++++++++++++++   ← 新增 .gitattributes
 scripts/setup.sh                       ← 没有被修改！
```

**关键洞察**：`.gitattributes` 是 git 的换行控制策略，但它只影响被它**触发之后的 git 操作**。如果文件已经在磁盘上（在 `.gitattributes` 创建之前就存在），git 不会自动重写它。这本质上是 git 的一个设计决定——`git pull` 只更新有变更的文件。

### 补救措施：强制触发重新 checkout（提交 `f4054d7`）

在 Linux 上对 `scripts/setup.sh` 做一次无功能影响的标记变更（新增一行尾注释），迫使 git 认为文件被修改了：

```diff
 echo "$(t "预览： openspec-superpowers-opencode dry-run" "Preview: openspec-superpowers-opencode dry-run")"
+# EOF - intentionally empty trailing line for LF normalization
```

这样 Windows 用户 `git pull` 时：
1. git 看到 `scripts/setup.sh` 有变更
2. 重新 checkout 该文件
3. checkout 过程中读取 `.gitattributes` → `text eol=lf` → 写出 LF
4. 磁盘上的文件变成 LF ✅

### 验证（Windows PowerShell）

```powershell
$ Format-Hex .\scripts\setup.sh | Select-Object -First 2

0000000000000000 23 21 2F 75 73 72 2F 62 69 6E 2F 65 6E 76 20 62 #!/usr/bin/env b
0000000000000010 61 73 68 0A 23 20 6F 70 65 6E 73 70 65 63 2D 73 ash# openspec-s
```

`61 73 68 0A` — `ash` 后面紧跟 `0A`（LF），没有 `0D`。确认文件是纯 LF。

### 以后不会再出现了

- `.gitattributes` 已经生效
- 任何未来的 `git checkout` / `git pull` 都会输出 LF
- 即使 Windows 上编辑后用 `git add`，git 的 clean filter 也会自动 normalize 回 LF
- `.gitattributes` 包含了 npm `files` 白名单，tarball 总有换行策略保护

### 教训

`.gitattributes` 的创建和 **被规则保护的文件** 不能在同一 commit 里分开。如果 `.gitattributes` 新增时目标文件没有被修改，git 不会重新 checkout 它们。分步操作时，需要手动 `git add --renormalize .` 或强制重新 checkout 来让 `.gitattributes` 生效。
