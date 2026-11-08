# 发布流程（RELEASING.md）

> 定位：**发布体系的单一事实来源**。凡「怎么发一个版本」的规则写在这里，与 [`testing.md`](testing.md)（测试体系）对称。
>
> 适用范围：本仓库（`@moyaspace/openspec-superpowers-opencode`）的所有版本发布。V1 线（`release/1.1`）与 V2 线（`main`）共用本流程，仅分支与版本号不同。
>
> 不写进本文件的内容：**某一次发布的实例数据**（版本号、CHANGELOG 条目、提交区间、验收结果）由当次 Sprint 任务的开工命令与 `openspec/changes/archive/` 提供。本文件只写「换个版本依然成立」的规则。
>
> 本文件**不进入 npm 包**（`package.json` 的 `files` 只列 `docs/QUICKSTART.md`），这是刻意的：发布流程属维护者文档，不占用户包体积。

---

## 0. 全景

```text
0 发布前核验 ──► 1 bump 版本号 ──► 2 CHANGELOG ──► 3 全量测试
                                                        │
                                                        ▼
      6 推送 tag（两远端） ◄── 5 git tag ◄── 4c 人工跨平台 ◄── 4b CI 三平台 ◄── 4a 打包
                │                              ▲
                │                              └── 未通过 → 修复 → 回到 3
                ▼
      7 npm publish + dist-tag ──► 8 发布后验证
```

**三条不可颠倒的顺序**：

1. **tag 在验证之后**，不是之前（§5）
2. **CI 与人工跨平台在 publish 之前**，不是之后（§4b / §4c）
3. **bump 提交在修复之后**——若验证期发现要修的东西，先把 bump 撤掉，修完再重新 bump，让 bump 提交成为该版本的最后一个代码提交（§1）

---

## 1. bump 版本号

**唯一正确做法**：

```bash
npm version <ver> --no-git-tag-version
```

**为什么不用手改 `package.json`**：

| 能力 | `npm version` | 手改 |
|---|---|---|
| SemVer 校验（写错会被拒） | ✅ | ❌ |
| **工作区必须干净**（脏则拒绝执行） | ✅ | ❌ 只能靠人肉看 `git status` |
| 同步 `package-lock.json` 的 `version` 与**根 `packages[""]` 字段** | ✅ | ❌ 极易漏 |
| 校验 `engines` 与当前 Node 是否兼容 | ✅（可 `--force` 跳过） | ❌ |

最后一行是真实的坑：本项目 `package-lock.json` 的根节点同时含 `version`、`bin`、`hasInstallScript`、`engines` 等字段。手改只动 `version` 时，`bin` 里指向已删除目录的死路径、已退役脚本留下的 `hasInstallScript: true` 都会静默留存，直到某次 `npm install` 才暴露成无关 diff。

**为什么必须带 `--no-git-tag-version`**：

裸 `npm version <ver>` 会自己 `git commit -m "<ver>"` 并打 tag。而本项目的发布提交要与 `CHANGELOG.md` 同一个提交、且用约定式 message（`chore(release): ...`）。用 `--no-git-tag-version` 拿到「只改文件、不提交不打 tag」，提交与 tag 由 §2 与 §5 显式控制。

**实例命令**：

```bash
# 确认当前值，避免在已 bump 过的树上重复执行
node -p "require('./package.json').version"
npm version <ver> --no-git-tag-version
```

---

## 2. 编写 CHANGELOG

- 文件：仓库根 `CHANGELOG.md`；格式用 [Keep a Changelog](https://keepachangelog.com/)，标题形如 `## [<ver>] - YYYY-MM-DD`。
- 素材三处：**上一个 tag 到 HEAD 的全部提交**、`openspec/changes/archive/` 里本次涉及的 `proposal.md`、以及当次 Sprint 任务列出的必写条目。
- **提交范围以 bump 当刻的 HEAD 为准**，不要写死提交区间：

  ```bash
  git log <上一个tag>^{commit}..HEAD --oneline
  ```

- **行为变更必须显式成节**，不能只混在 `Fixed` 里。典型需要单列的三类：
  - **运行时要求提高**（如 `engines.node` 从 `>=16` 改成 `>=22.9.0`）——升级用户会直接装不上
  - **默认值翻转**（如环境变量开关「未设置」时的默认行为从保留改为覆盖）——存量用户不设变量就会受影响
  - **机制退役**（如生命周期脚本删除、构建产物移出版本控制）——文档与使用姿势都要跟着变
- 开发过程产物不写：重建构建产物、修测试夹具、CI 自纠、内部重构中的中间提交。
- **纯内部清理**（用户不可感知的测试删除之类）不写进 CHANGELOG，只在 `Internal` 或干脆不写。

---

## 3. 全量测试

```bash
npm test
```

- 退出码必须为 `0`；主套件与 elevated 套件都全绿。
- 本项目 `npm test` = `typecheck` → `build` → 主套件 → elevated，任一环节失败即停，且**结束时无论成败都会把全局 `openspec` 垫片恢复为正式安装版本**（见 `scripts/run-tests.mjs`）。
- 若出现 `9009`（Windows `cmd` spawn 环境类失败，非断言失败），改用等价全量入口并**在验收记录里写明偏差**：

  ```bash
  node --test --test-concurrency=1 "test/*.test.js"
  ```

- 记录当次的 `tests` / `pass` / `fail` 三个数，验收时要用。

---

## 4. 打包与验证

### 4a. 打包

```bash
npm pack
```

- 本包有 `"prepack": "npm run build"`，所以 `npm pack` 会**自动现编一次** `dist/`；打完必须复核 `git status --porcelain` 仍为空（产物由源码生成，不应产生 diff）。用 `prepack` 而非 `prepare` 是为了让包在 npm >= 11.16 上安装时零 `allowScripts` 告警（见 `openspec/specs/package-lifecycle/spec.md`）。
- 打出 `moyaspace-openspec-superpowers-opencode-<ver>.tgz`，**这是后续所有平台验证的唯一安装源**：本地 Windows、Ubuntu、macOS、以及 CI 之外的验收，全部装同一个文件，不得各平台自行构建。
- 按 `.github/workflows/ci.yml` 的 `Verify tarball contents` 清单本地核对一遍（关键文件齐全、已删文件不在包内、`package/src/` 与 `package/tsconfig.json` 不得出现）。
- `.tgz` 已被 `.gitignore` 的 `*.tgz` 排除，**不要**提交它。

### 4b. CI 三平台

- CI 触发条件：`push` / `pull_request` 到 `main` 或 `release/**`，另支持 `workflow_dispatch`；矩阵为 `ubuntu-latest` / `windows-latest` / `macos-latest`，`fail-fast: false`。
- **CI 只在 GitHub 上跑**。内网 `origin` 不触发任何 CI，所以「只推 origin」拿不到任何 CI 证据。
- 跟踪与等待：

  ```bash
  gh run list --branch <branch> --limit 1
  gh run watch <run-id>
  ```

- **三个平台必须全部 success 才能继续**，任一失败先修再重跑。
- elevated 套件的日志形态（GAP005 修复后）：
  - **ubuntu / macos**：必须是 `ELEVATED: running N elevated test file(s) ...`（不带 `via gsudo`），且不是 `SKIPPED`——这是 Unix 上真实执行过的唯一证据
  - **windows**：`... via gsudo ...`；runner 无 gsudo 时打印 `SKIPPED` 并 `exit 0` 属允许行为

### 4c. 人工跨平台验证

CI 不装 `-g`、不跑真实 OpenCode、不执行 Unix shell 垫片，所以以下必须真机跑同一份 tgz：

| 平台 | 必验项 |
|---|---|
| **Windows** | `npm i -g ./<tgz>` → `oso --version` → `oso init` 端到端；`openspec list` 垫片拦截；**棕地升级**（已装旧版的项目重跑 init）；确认安装过程**无 `install scripts blocked` 警告** |
| **Ubuntu**（真机 / VM / 容器，**不得用 WSL 替代**） | `sudo npm i -g ./<tgz>` 的权限路径；系统 npm 下无法写系统 bin 目录时**必须明确提示 `sudo oso install-shims`，不得静默失效**；shell 垫片真实执行与 `openspec list` 合并输出；端到端；棕地升级 |
| **macOS** | 同 Ubuntu，另加 BSD 工具链差异（`sed` / `tar` / `grep`） |

- **最小可接受：Windows + Ubuntu 真机通过**。macOS 无环境时，必须以 CI 的 `macos-latest` 全绿 + **显式记录「未真机验证」** 作为已知缺口，**不得默认视为通过**。
- **棕地升级验证不可省略**：只验「全新环境」是 greenfield，正好绕开升级路径上的缺陷（BUG021 / BUG022 就是这么漏掉的）。

---

## 5. 打 git tag

**位置：必须在 §4b 与 §4c 全部通过之后。** tag 的语义是「这个提交已验证、就是 `<ver>`」，打在未验证的快照上等于造假。

```bash
git tag -a v<ver> -m "<ver>"
```

- **必须用 annotated tag（`-a`）**。本仓库从 `v1.0.6` 起全部是 annotated；更早的 `v1.0.1`–`v1.0.5` 是 lightweight，属历史遗留，不要沿用。
- **tag 必须打在 bump 提交上**（即该版本的最后一个代码提交）。若 §4 期间发现要修的问题，先撤销 bump、修完、重新 bump，让 bump 提交重新成为 HEAD（见 §9 的重做流程）。
- 确认 tag 指向正确：

  ```bash
  git show --stat v<ver>     # 应只含 package.json / package-lock.json / CHANGELOG.md
  git describe --tags --exact-match HEAD
  ```

- **本地打错可以重来**（`git tag -d v<ver>`）；**一旦推送，回收代价极高**（见附 A）。

---

## 6. 提交并推送分支

```bash
git add package.json package-lock.json CHANGELOG.md
git status --porcelain                    # 只应有这三项
git commit -m "chore(release): bump to <ver> and add CHANGELOG"
```

推送**两个远端**，顺序与参数：

```bash
git push -u origin <branch>      # 首次推送该分支时 -u 建立 upstream
git push github <branch>
```

- **两个都推**：内网 `origin` 保有分支，GitHub 触发 CI。只推其一都会让某条验收无从取证。
- 推送后核对三处指向同一提交：

  ```bash
  git rev-parse HEAD
  git rev-parse origin/<branch>
  git rev-parse github/<branch>
  ```

- 若分支已有 upstream，`-u` 可省；但内网仓库是主仓，保留 upstream 有意义。

---

## 7. npm publish 与 dist-tag

```bash
npm publish
npm dist-tag add @moyaspace/openspec-superpowers-opencode@<ver> v1
npm view @moyaspace/openspec-superpowers-opencode dist-tags
```

- **`npm dist-tag` 与 `git tag` 是两回事**，两者都要做，不能互相替代：

  | | git tag | npm dist-tag |
  |---|---|---|
  | 位置 | git 仓库 | npm registry |
  | 决定 | 源码快照 | `npm i pkg@v1` 装哪个版本 |

- 本项目的 dist-tag 约定：`latest` 跟随当前发布版本；`v1` 固定指向最新的 1.x。将来 2.0.0 发布用 `npm publish --tag latest`，`v1` 保持指向最后一个 1.x。
- **发布前最后一道自检**（版本号、分支、tag 三者一致）：

  ```bash
  node -p "require('./package.json').version"
  git rev-parse --abbrev-ref HEAD
  git describe --tags --exact-match HEAD
  ```

- 含凭据与发布动作的步骤**由仓库所有者执行**，不由 AI 代做。

---

## 8. 推送 tag

```bash
git push origin v<ver>
git push github v<ver>
```

- **两个远端都要推**。本仓库既有惯例：`v1.0.1`–`v1.1.1` 的全部 tag 在 `origin` 与 `github` 上都存在。
- 校验：

  ```bash
  git ls-remote --tags origin v<ver>
  git ls-remote --tags github v<ver>
  ```

  输出应包含两行——`refs/tags/v<ver>`（tag 对象本身）与 `refs/tags/v<ver>^{}`（tag 指向的提交）。**只出现一行说明是 lightweight tag，打错了。**

---

## 9. 发布后验证

- **全新环境**：干净目录 `npm i -g @moyaspace/openspec-superpowers-opencode@<ver>` → `oso --version` → `oso init` 端到端可用。
- **棕地升级**：构造「已装上一个版本」的项目（旧命令文件 + `openspec/config.yaml` + `.opencode/install-manifest.json`），重跑 `oso init` → 变更的命令与模板逐字一致、部署后验证通过、exit 0。
- **版本写入正确**：`oso init` 落盘的版本是 `<ver>`，模板中不含 `@latest` 之类浮动引用。
- **dist-tag 正确**：`npm view ... dist-tags` 中 `latest` 与 `v1` 均指向 `<ver>`。
- 发布后若发现缺陷：**不要试图用同一个版本号重发**（见附 A）。

---

## 附 A. 失败与回滚

| 场景 | 做法 | 注意 |
|---|---|---|
| tag 打错（还在本地） | `git tag -d v<ver>` 后重打 | 成本≈0 |
| tag 已推送 | `git push origin :refs/tags/v<ver>` 两个远端都删 | **别人 fetch 过就会留下悬空引用**；宁可发补丁版本 |
| 分支推错（推到了错误的远端/分支） | 先确认没有 CI 消费方，再删远端分支 | 已触发的 CI run 无法撤销记录 |
| npm 已 publish 但发现严重问题 | **72 小时内**可 `npm unpublish <pkg>@<ver>`；超过 72 小时只能 `npm deprecate` 并尽快发补丁版本 | **同一个版本号不可复用**：unpublish 之后重新 publish 同号在多数配置下被拒 |
| dist-tag 指错 | `npm dist-tag add <pkg>@<旧版本> v1` 指回去 | dist-tag 可反复覆盖，无副作用 |
| 发布后发现只是文档错 | 发补丁版本修；**不要**为了改 README 而 unpublish | npm 页面渲染的是 tarball 内的 README |

**紧急路径**（凭据泄露 / 账号被接管）：轮换 npm token、检查 `npm owner ls`、对受影响版本 `npm deprecate` 并在 GitHub 发安全公告。凭据本身**绝不写进本文件或任何仓库文件**。

---

## 附 B. 常见陷阱

1. **手改 `package.json` 的 version** → SemVer 未校验、worktree 未校验、lockfile 根字段不同步。改完 `git diff` 看着很干净，问题留到下一次 `npm install` 才炸。
2. **提前打 tag** → tag 语义是「已验证」。提前打，等于用一个不可回收的标记担保一件还没发生的事。
3. **只推 `origin`** → 拿不到 CI 证据；只推 `github` → 内网主仓缺分支。两个都要推。
4. **把 tarball 内 README 忘掉** → npm 页面渲染的是包内 README，不是仓库 README。文档修正必须在 `npm pack` **之前**完成，否则发出去就是错的，只能靠发补丁版本修。
5. **认为 `npm dist-tag` 等于 `git tag`** → 前者决定安装解析，后者定位源码；缺任一个都会让「这次发布了什么」无法追溯。
6. **把实例数据写进本文件** → 版本号、提交区间、当次验收结论属于 Sprint 任务；写进来就会与文档一起漂移。
7. **改了发布流水线却不更新本文件** → 描述去年流程的 runbook 比没有更糟（它会误导）。每次改 `ci.yml` 的发布相关步骤、改 `package.json` 的 `scripts`/`files`/`bin`、改远端布局时，**同步改这里**。

---

> 变更记录：本文件由 1.1.2 发布期补齐（此前发布流程只存在于 Sprint 任务与执行者记忆中，5 个历史 tag 均无成文依据）。
