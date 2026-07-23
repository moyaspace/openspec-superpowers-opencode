# Tasks

> 具体要干的活。每条包含标签、优先级、状态、预估工作量。

## 任务总览

> 按编号索引，含标签和依赖关系。

| 编号 | 任务                      |       标签        |   依赖   | 优先级 | 状态 | 预估 |
| :--: | ------------------------- | :---------------: | :------: | :----: | :--: | :--: |
|  T1  | 活跃变更注册表初始化      |   Registry/Init   |          |   中   |  ✅  |  中  |
|  T2  | 注册表功能模块            |   Registry/核心   |    T1    |   高   |  ✅  |  中  |
|  T3  | 注册表子命令              |   Registry/CLI    |    T2    |   高   |  ✅  |  中  |
|  T4  | 注册表与opsx命令集成      |   Registry/Opsx   | T3+T7+T8 |   中   |  ✅  |  中  |
|  T5  | openspec list 占位脚本    | Registry/占位脚本 |  T1+T3   |   低   |  ✅  |  大  |
|  T6  | 安装程序                  |  Registry/安装器  |  T5+T7   |   中   |  ✅  |  中  |
|  T7  | install-shims 命令        |  Verify/垫片脚本  |    T5    |   高   |  ✅  |  小  |
|  T8  | verify 顶层命令           |    Verify/核心    |    T2    |   高   |  ✅  |  中  |
|  T9  | registry reset 子命令     |   Registry/CLI    |    T2    |   低   |  ✅  |  小  |
| T10  | opsx 命令 verify 引用统一 |    Verify/Opsx    |  T4+T8   |   中   |  ✅  |  中  |
| T11  | /opsx-finish PR 感知与自动清理 |    Opsx/PR   |   T4    |   低   |  🔲  |  中  |
| T12  | CLI 增强 + remove-worktree + /opsx-remove | CLI/核心 | | 中 | 🔲 | 小 |

---

## Sprint 1

| 编号 | 任务                      |       标签        | 优先级 | 预估 | 状态 |
| :--: | ------------------------- | :---------------: | :----: | :--: | :--: |
|  T1  | 活跃变更注册表初始化      |   Registry/Init   |   中   |  中  |  ✅  |
|  T2  | 注册表功能模块            |   Registry/核心   |   高   |  中  |  ✅  |
|  T3  | 注册表子命令              |   Registry/CLI    |   高   |  中  |  ✅  |
|  T4  | 注册表与opsx命令集成      |   Registry/Opsx   |   中   |  中  |  ✅  |
|  T5  | openspec list 占位脚本    | Registry/占位脚本 |   低   |  大  |  ✅  |
|  T6  | 安装程序                  |  Registry/安装器  |   中   |  中  |  ✅  |
|  T7  | install-shims 命令      |  Verify/垫片脚本  |   高   |  小  |  ✅  |
|  T8  | verify 顶层命令           |    Verify/核心    |   高   |  中  |  ✅  |
|  T9  | registry reset 子命令     |   Registry/CLI    |   低   |  小  |  ✅  |
| T10  | opsx 命令 verify 引用统一 |    Verify/Opsx    |   中   |  中  |  ✅  |
| T11  | /opsx-finish PR 感知与自动清理 |    Opsx/PR    |   低   |  中  |  🔲  |

### 任务卡片

#### T1: 活跃变更注册表初始化

**WHY**：openspec/oso-change-registry.json 是所有活跃变更的注册表。垫片脚本通过它感知 worktree 中的活跃变更，从而在 `openspec list` 中跨 worktree 展示。同时它也被 findProjectRoot 用作项目根标记文件。init 时预置是最佳时机，确保项目从一开始就有注册表。

**WHAT**：在 cli.js 的 runInit() 中，setup 脚本执行后、git add 前，创建 openspec/oso-change-registry.json。仅不存在时创建，存在则跳过。不修改 setup 脚本。

**HOW**：检查 path.join(targetDir, 'openspec/oso-change-registry.json') → mkdirSync（如父目录不存在）→ writeFileSync → 内容 {"changes":[]}。约 5 行 JS。

**验收标准**：

- [ ] init 新项目后 openspec/oso-change-registry.json 存在，内容为 {"changes":[]}
- [ ] 已有 oso-change-registry.json 时 init 不修改内容
- [ ] git status 包含该文件，随首次提交入库

#### T2: 注册表功能模块

**WHY**：所有注册表操作（增删改查）需要集中管理。直接读写 JSON 文件看似简单，但要处理文件不存在的空注册表、JSON 损坏、同名覆盖、保留空文件等边界。抽成独立模块后 CLI 子命令和未来的其他消费者都能复用。

**WHAT**：创建 `scripts/registry.js`，CommonJS 模块，导出 6 个函数：

- `read(path)` — 读 openspec/oso-change-registry.json，文件不存在或损坏时返回 `{changes:[]}`，不抛异常
- `write(path, data)` — 写回文件，确保 `openspec/` 目录存在
- `add(path, name, worktree)` — 同名覆盖写入，自动设置 `createdAt` 时间戳
- `remove(path, name)` — 按 name 删除条目，保留空文件（不 unlink）
- `list(path)` — 格式化输出所有活跃变更

**HOW**：纯 CommonJS（`require` / `module.exports`）。每条变更记录格式 `{name, worktree, createdAt}`。`createdAt` 为 ISO 8601 字符串。`list()` 输出变更名 + worktree 路径 + 创建时间。TDD 先行。

**验收标准**：

- [ ] `read()` 文件不存在时返回 `{changes:[]}`，不抛异常
- [ ] `read()` JSON 损坏时返回 `{changes:[]}`，不抛异常
- [ ] `add()` 写入新条目，同名调用覆盖旧条目
- [ ] `add()` 自动写入 `createdAt` ISO 时间戳
- [ ] `remove()` 删除条目，文件保留不删除
- [ ] `list()` 格式化输出所有条目
- [ ] `lsp_diagnostics` 无报错

#### T3: 注册表子命令

**WHY**：opsx 命令和用户需要 CLI 入口来操控注册表。`bin/cli.js` 需要新增 `registry` 子命令，通过 `findProjectRoot` 从任意子目录定位项目根，加载 registry.js 分发操作。

**WHAT**：在 `bin/cli.js` 中：

1. `findProjectRoot` 从 `lib/registry-utils.js` 引入，git-based（`git rev-parse --git-common-dir`），在任何 checkout 中都返回同一项目根
2. 新增 `registry` 子命令处理分支，解析 `add/remove/list/verify` 五个子操作
3. 加载 `<tool-dir>/lib/registry.js`，通过 `findProjectRoot` + `getChangeRegistryPath` 定位注册表
4. 调用对应函数
5. 非项目目录下 registry 命令报友好错误

`registry verify` 为轻量版本，只检查两项：① `oso-change-registry.json` 是否合法 JSON ② 注册表每条记录的 worktree 目录是否存在。
顶层验证（openspec 安装状态、包装脚本完整性）由 T8 `verify` 命令负责。

**重要：registry 命令被 AI agent 调用，不做终端交互式提示。** 所有 registry 命令输出结构化文本 + exit code（0=正常，非0=有问题），由 AI agent 读取输出后自行决定是否向用户询问修复。

`verify` 和 `add` 是分步执行的独立命令，add 内部不调 verify。

**HOW**：更新 help 文本。

**验收标准**：

- [ ] `registry add` 在项目内写入注册表
- [ ] `registry remove` 删除条目保留空文件
- [ ] `registry list` 打印格式化列表
- [ ] `registry verify` 只检查 oso-change-registry.json + worktree 目录（轻量）
- [ ] 在项目子目录运行也能找到项目根
- [ ] 在非项目中运行提示错误
- [ ] help 文本包含 registry 用法
- [ ] `lsp_diagnostics` 无报错

#### T4: 注册表与 opsx 命令集成

**WHY**：注册表只在 opsx 命令执行时同步才有意义。创建变更时 add 条目，归档清理时 remove 条目。

**WHAT**：分两类修改：

① **生命周期注册表同步** — 4 个命令插入 registry 调用：

| 命令               | 插入位置                        | 操作                                                                                 |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------ |
| `opsx-new.md`      | Step 5a（创建变更后）           | `registry add <name> .worktrees/<name>`                                              |
|                    | 失败处理                        | exit 1 → verify 输出修复命令 → `question` 工具询问修复/停止 → 修复后重试 / 停止中断 |
| `opsx-propose.md`  | Step 4a（创建变更后）           | `registry add <name> .worktrees/<name>`                                              |
|                    | 失败处理                        | 同上                                                                                 |
| `opsx-ff.md`       | Step 4a（创建变更后）           | `registry add <name> .worktrees/<name>`                                              |
|                    | 失败处理                        | 同上                                                                                 |
| `opsx-finish.md`   | 选项 1（merge）和选项 4（discard）末尾 | `registry remove <name>`                                                   |
|                    | 失败处理                        | 同上                                                                                 |

② **verify + openspec list** — 7 个命令中调用 `openspec list` 的地方，替换为先运行 `openspec-superpowers-opencode verify` 再运行 `openspec list --json`（T10 统一）。

**额外说明**：
- `opsx-continue.md` 初始版本无 `update-status` 步骤，无需改动
- `opsx-finish.md` 的 `registry remove` 仅放在 merge 和 discard 选项内（完整清理场景），PR 和保留选项不做自动 remove

**HOW**：生命周期调用直接插入 bash 代码块。`verify` 放在 `openspec list` 之前。所有调用通过 ```bash 代码块直接执行。

**验收标准**：

- [ ] 4 个 opsx 命令文件均新增了 registry 生命周期调用
- [ ] `opsx-new.md` — add 在 Step 5a（创建变更后）
- [ ] `opsx-propose.md` — add 在 Step 4a（创建变更后）
- [ ] `opsx-ff.md` — add 在 Step 4a（创建变更后）
- [ ] `opsx-finish.md` — remove 在选项 1（merge）和选项 4（discard）末尾
- [ ] 所有调用格式统一为 `openspec-superpowers-opencode registry ...`
- [ ] 不影响 opsx 命令原有流程逻辑

#### T5: openspec list 占位脚本

**WHY**：垫片脚本是用户无感获得合并注册表能力的关键。通过拦截 PATH 中的 `openspec` 命令，在项目目录内执行 `openspec list` 时自动合并所有 worktree 活跃变更的展示。需要三个平台各一份脚本，行为一致。

**WHAT**：创建三类垫片脚本文件（不含安装程序逻辑）：

- `lib/shims/openspec` — Unix/macOS shell 脚本
- `lib/shims/openspec.cmd` — Windows CMD 批处理
- `lib/shims/openspec.ps1` — Windows PowerShell 脚本

每份脚本逻辑：

1. 拦截 `openspec list` 调用，全部委托给 `<tool-dir>/lib/registry-utils.js list`
2. registry-utils 内部通过 git 定位项目根、读取注册表、遍历 worktree 合并输出
3. 非 list 命令 → `exec openspec-orig $args` 透传
4. 边界处理（JSON 损坏、worktree 目录不存在等）由 registry-utils.js 统一负责

**合并输出策略**：registry-utils.js 调用 `openspec-orig list` 获取各 worktree 的原生列表 → 去重（同名 first wins）→ 拼接输出。

**HOW**：T5 只产生脚本源文件（存在 `lib/shims/` 下），不含安装/部署逻辑。安装程序是后续独立任务。三种脚本从同一逻辑翻译为各自语法。注意 `openspec` 文件名不带后缀应放在 Unix 脚本中。

**验收标准**：

- [ ] `lib/shims/openspec`（Unix shell）脚本完成
- [ ] `lib/shims/openspec.cmd`（Windows CMD）脚本完成
- [ ] `lib/shims/openspec.ps1`（PowerShell）脚本完成
- [ ] 拦截条件：TOOL_DIR 有效 && 参数[0] == "list"，其他全部透传
- [ ] `registry-utils.js list` 在注册表不存在时透传 `openspec-orig list`（不是我们的项目）
- [ ] `registry-utils.js list` 在非 git 项目时透传 `openspec-orig list`
- [ ] `registry-utils.js list` 在注册表存在时正常合并
- [ ] 非 list 命令始终透传
- [ ] JSON 损坏时 `readRegistry()` 返回 `{changes:[]}`，不降级透传（`registry verify` 可检测）
- [ ] `lsp_diagnostics` 无报错

#### T6: 安装程序

**WHY**：oso 实现了自己的 `openspec list`，支持跨 worktree 合并展示活跃变更。为了让用户无感使用这个能力，安装程序需要用 oso 的垫片脚本替换系统全局的 `openspec`，对 PATH 中的 openspec 命令进行拦截，在需要 worktree 支持时执行 oso 逻辑，其他情况透传给原版 openspec。安装程序负责安装时的替换和卸除时的恢复。

**WHAT**：安装程序的核心原理是「狸猫换太子」——将系统 PATH 中的原版 `openspec` 替换为 oso 的垫片脚本。垫片在收到 `openspec list` 命令且当前在项目目录内时执行 oso 合并逻辑，其他情况透传原版 openspec。安装程序只负责安装和卸除时的替换与恢复。执行：

1. 检测平台（Win CMD / Win PS / Unix），确定入口文件后缀
2. 定位原版 `openspec` CLI 所在目录（`npm root -g` 的上级 `bin/` 目录，或 `where`/`which` 路径）
3. 将该目录下的 `openspec`、`openspec.cmd`、`openspec.ps1` 全部重命名为 `openspec-orig.*`
4. 从 `<tool-dir>/lib/shims/` 读取对应平台的垫片脚本，写入同目录（同名）
5. `chmod +x` 设置可执行权限（Unix）
6. 提供两条触发入口——npm lifecycle（`npm install -g` / `npm uninstall -g` 自动执行）和 CLI 命令（`install-shims` / `uninstall-shims` 手动执行）
7. 卸除时反向操作——删除垫片脚本，将 `openspec-orig.*` 恢复为 `openspec.*`。`openspec-orig` 不存在时不做处理
8. 找不到 openspec 时，lifecycle 入口打印提示后 exit 0 不阻塞 npm；CLI 入口 exit 1

**HOW**：

- **模块**：安装和卸除逻辑放在同一模块，`installShims()` 复用现有逻辑，`uninstallShims()` 做对称反向操作。两条路径：

  |      | 入口                  | 调用链                                                                |
  | ---- | --------------------- | --------------------------------------------------------------------- |
  | 安装 | npm lifecycle         | `scripts/shims-installer.js` → `lib/shims-installer.installShims()`   |
  | 安装 | CLI `install-shims`   | `bin/cli.js` → `lib/shims-installer.installShims()`                   |
  | 卸除 | npm lifecycle         | `scripts/shims-installer.js` → `lib/shims-installer.uninstallShims()` |
  | 卸除 | CLI `uninstall-shims` | `bin/cli.js` → `lib/shims-installer.uninstallShims()`                 |

- **lifecycle 入口**（`scripts/shims-installer.js`）：通过 `npm_lifecycle_event` 区分 install/uninstall。找不到 openspec 时打印警告 + exit 0，不阻塞 npm
- **CLI 入口**（`bin/cli.js`）：提供 `install-shims` 和 `uninstall-shims` 两个子命令，分别调 `installShims()` / `uninstallShims()`。找不到 openspec 时 exit 1
- **接线**：`package.json` 新增：
  ```json
  "scripts": {
    "install": "node scripts/shims-installer.js",
    "uninstall": "node scripts/shims-installer.js"
  }
  ```
- **测试**：覆盖安装和卸除两条路径

**验收标准**：

- [ ] 安装和卸除逻辑在同一模块，双函数导出
- [ ] `npm install -g` 自动安装垫片，找不到 openspec 时打印提示并 exit 0
- [ ] `npm uninstall -g` 自动卸除垫片，恢复 openspec-orig → openspec
- [ ] `openspec-superpowers-opencode install-shims` 正常工作
- [ ] `openspec-superpowers-opencode uninstall-shims` 正常工作
- [ ] 测试覆盖安装和卸除两条路径
- [ ] `lsp_diagnostics` 无报错

#### T7: install-shims 命令

**WHY**：当 `verify` 检测到垫片脚本有问题（openspec-orig 不存在、openspec 不是垫片脚本）时，需要一个专门的命令来修复。这个命令只做一件事：在 openspec 已安装的前提下，安装/覆盖垫片脚本。

**WHAT**：创建 `scripts/shims-installer.js` 和 `lib/shims-installer.js`，在 `bin/cli.js` 中新增顶层 `install-shims` 命令。

功能：

1. 定位 openspec CLI 所在目录（`which openspec` / `where openspec`）
2. 检查 openspec-orig 是否已存在，不存在则复制 openspec → openspec-orig
3. 从 `<tool-dir>/lib/shims/` 读取对应平台的垫片模板，替换 `{{TOOL_DIR}}` 后写入同名文件
4. 设置可执行权限（Unix `chmod +x`）
5. 输出操作结果（成功/失败详情）

提供两条触发入口——npm lifecycle（`npm install -g` / `npm uninstall -g` 自动执行）和 CLI 命令（`install-shims` / `uninstall-shims` 手动执行）。

**验收标准**：

- [ ] `install-shims` 在 openspec 已安装时成功安装垫片脚本
- [ ] openspec-orig 不存在时自动创建
- [ ] openspec-orig 已存在时跳过复制，只覆盖垫片脚本
- [ ] 输出操作结果供 AI agent 读取
- [ ] `lsp_diagnostics` 无报错

#### T8: verify 顶层命令

**WHY**：`registry verify` 语义太窄，只检查注册表相关的 items。完整检查涉及 openspec 安装、垫片脚本、oso-change-registry.json、worktree 目录等系统级问题。需要一个顶层 `verify` 命令，输出结构化结果+每项的修复建议。

**WHAT**：

- 创建 `scripts/verify.js`，实现 5 项检查
- 在 `bin/cli.js` 中新增顶层 `verify` 命令
- `registry verify` 降级为轻量版本（只查 oso-change-registry.json + worktree 目录）

5 项检查 + 修复建议：

| #   | 检查                | 失败输出                       | 修复建议                                                            |
| --- | ------------------- | ------------------------------ | ------------------------------------------------------------------- |
| 1   | openspec 存在       | `⚠ openspec: not found`        | `请确保 openspec CLI 已安装（npm install -g @fission-ai/openspec）` |
| 2   | openspec-orig 存在  | `⚠ openspec-orig: not found`   | `openspec-superpowers-opencode install-shims`                       |
| 3   | openspec 是垫片脚本 | `⚠ openspec (shim): not shim script` | `openspec-superpowers-opencode install-shims`                       |
| 4   | oso-change-registry.json 有效   | `⚠ oso-change-registry.json: parse error`  | `openspec-superpowers-opencode registry reset`                      |
| 5   | worktree 目录存在   | `⚠ worktree <name>: not found` | `openspec-superpowers-opencode registry remove <name>`              |

输出格式示例：

```
✓ openspec: installed at C:\Users\...\openspec.cmd
⚠ openspec-orig: not found
  修复：openspec-superpowers-opencode install-shims
✓ openspec (shim): is shim script
✓ oso-change-registry.json: valid (2 changes)
⚠ worktree feature-b: not found at .worktrees/feature-b
  修复：openspec-superpowers-opencode registry remove feature-b
```

exit code：全 ✓ → 0，有 ⚠ → 1。

**验收标准**：

- [ ] `verify` 顶层命令完成 5 项检查
- [ ] 每项检查输出状态 + 修复建议
- [ ] exit code 0（全通过）/ 1（有问题）正确
- [ ] `registry verify` 降级为轻量版（只查 4+5）
- [ ] `lsp_diagnostics` 无报错

#### T9: registry reset 子命令

**WHY**：当 `oso-change-registry.json` 损坏时，`verify` 会建议 `registry reset` 来重置。需要一个轻量子命令处理这个场景。

**WHAT**：在 `scripts/registry.js` 中新增 `reset(path)` 函数，在 `bin/cli.js` 的 `registry` 子命令中新增 `reset` 子操作。

功能：

- 将 `openspec/oso-change-registry.json` 重置为 `{"changes":[]}`
- 可选备份原文件为 `oso-change-registry.json.bak`
- 输出操作结果

**验收标准**：

- [ ] `registry reset` 将 oso-change-registry.json 重置为空注册表
- [ ] 原文件备份为 oso-change-registry.json.bak（可选）
- [ ] `lsp_diagnostics` 无报错

#### T10: opsx 命令 verify 引用统一

**WHY**：T4 的 opsx 文件集成中，`registry verify` 的引用需要统一改为顶层 `verify`，并适配 T8 的新输出格式。T4 只做了生命周期注册表同步部分，verify 部分待 T8 完成后统一处理。

**WHAT**：在 7 个 opsx 命令文件中，将 `openspec list --json` 前的步骤统一为 `openspec-superpowers-opencode verify`。包含的 7 个文件：

| 命令                   | 改动                                           |
| ---------------------- | ---------------------------------------------- |
| `opsx-apply.md`        | Step 1 的 `openspec list --json` 前插 `verify` |
| `opsx-archive.md`      | 同上                                           |
| `opsx-bulk-archive.md` | 同上                                           |
| `opsx-continue.md`     | 同上                                           |
| `opsx-explore.md`      | 同上                                           |
| `opsx-sync.md`         | 同上                                           |
| `opsx-verify.md`       | 同上                                           |

**HOW**：在 `openspec list --json` 对应的 `bash 代码块之前，新增 `bash 代码块运行 `openspec-superpowers-opencode verify`。格式统一为：

```bash
openspec-superpowers-opencode verify
```

exit 0 → 执行 `openspec list --json` 继续
exit 1 → 向用户展示诊断报告，按各检查项的修复建议执行

**验收标准**：

- [ ] 7 个 opsx 命令文件中的 `openspec list` 调用前均插入了 `openspec-superpowers-opencode verify`
- [ ] 命令名统一为 `verify`（无 `registry` 前缀）
- [ ] 不影响 opsx 命令原有流程逻辑

#### T11: /opsx-finish PR 感知与自动清理

**WHY**：Option 2（推送并创建 PR）目前没有收尾流程。PR 合入后 worktree 和 registry entry 残留在本地。同时 merge 和 discard 的 `registry remove` 目前统一在 Step 4 执行，应移到各选项分支内部，按用户选择精确执行。

**WHAT**：
1. `opsx-finish.md` Option 2：PR 创建后追加提示"合入后运行 `/opsx-finish <name>` 清理"
2. Step 0 加入 PR 合入检测——`gh pr view` 检查 PR 状态
3. PR 已 MERGED → 自动进入 cleanup 模式：`registry remove` → `git worktree remove` → `git branch -d`
4. PR 仍 OPEN → 提示用户等待合入
5. 将 merge（选项 1）和 discard（选项 4）的 `registry remove` 从 Step 4 移入各自的选项分支
6. 无 `gh` CLI 时降级为原选项菜单，不报错

**HOW**：
- 检测逻辑：`gh pr view --json state,headRefName --jq 'select(.headRefName == "<feature-branch>") | .state'`
- 状态 = "MERGED" → 自动清理
- 状态 = "OPEN" → 提示后跳过
- gh CLI 不存在时跳过检测，走原选项菜单

**验收标准**：
- [ ] Option 2 创建 PR 后提示"合入后运行 `/opsx-finish <name>` 清理"
- [ ] PR 已合入时运行 `/opsx-finish` 自动清理（registry + worktree + branch）
- [ ] PR 仍 open 时跳过，提示"PR #N 仍在 review"
- [ ] merge 和 discard 分支各自执行 `registry remove`
- [ ] 无 gh CLI 时降级，不报错

---

## Sprint 2

| 编号 | 任务 | 标签 | 优先级 | 预估 | 状态 |
|:----:|------|:----:|:----:|:----:|:----:|
| T12  | CLI 增强 + remove-worktree + /opsx-remove | CLI/核心 | 中 | 小 | 🔲 |

### 任务卡片

#### T12: CLI 增强 + remove-worktree + /opsx-remove

**WHY**：`oso` 长名不便记忆；`--version` 是 CLI 基本能力缺失；已有 `ensure-worktree` 缺少反向操作；已有 `new`/`ff`/`propose` 缺少对称的废弃命令。

**WHAT**：
- `package.json` `bin` 加 `"oso": "bin/cli.js"`
- `cli.js` `isHelp` 前加 `--version`/`-v` 检测，输出版本号后 exit(0)
- `cli.js` 新增 `remove-worktree <name>` 子命令 + `runRemoveWorktree()`
- `remove-worktree` 执行：`git worktree remove --force .worktrees/<name>` → `git branch -D feature/<name>`，失败不阻塞
- 新建 `template/.opencode/commands/opsx-remove.md`，执行：`registry remove <name>` → `remove-worktree <name>`

**HOW**：不依赖外部工具。`git worktree remove --force` + `git branch -D` 组合，无需 gh CLI。

**验收标准**：
- [ ] `oso --version` 输出 `1.0.9`
- [ ] `oso init` 正常工作
- [ ] `remove-worktree <name>` 删除 worktree 元数据 + 目录 + 分支，目录删除失败不阻塞
- [ ] `remove-worktree` 输出三行格式：`✓/✗ worktree 元数据` `✓/✗ worktree 目录` `✓/✗ 分支`
- [ ] `/opsx-remove <name>` 依次调用 `registry remove` + `remove-worktree`
- [ ] `/opsx-remove` 不需要用户确认，直接执行

## 待办

> 高优先级待处理任务速查（自动从任务总览提取）。

| 优先级 | 任务 | 说明 |
| :----: | ---- | ---- |
| 中 | T12: CLI 增强 + remove-worktree + /opsx-remove | 别名 oso、--version、remove-worktree 命令、/opsx-remove 命令 |

## 约束

> 跨任务的通用规则和限制。

| 约束                          | 说明                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **registry 命令不做终端交互** | registry 命令（add/remove/list/verify）直接在 opsx 命令的 bash 代码块中调用。输出结构化文本 + exit code，不做 readline/promptYesNo。AI agent 读取输出后自行决定是否向用户询问。 |
| **CommonJS**                  | registry.js 用 require/module.exports，不用 import                                                                                                                                            |
| **node:test**                 | 测试用内置 node:test，零依赖                                                                                                                                                                  |
| **opsx 命令文件位置**         | 模板文件在 `template/.opencode/commands/opsx-*.md`（12 个）。部署到项目后位于 `.opencode/commands/opsx-*.md`。AI agent 的 `opsx-*.md` 技能文件路径一律从 `template/.opencode/commands/` 下读取。 |

---

## Change Context

> 承上启下的工作记忆。记录当前状态，归档时更新，供下一个 change 接力。
>
> **流转**：新 change 从 main 继承 → worktree 中更新 → 合并回 main。

### ✅ 刚完成

最近归档的 change 做了什么。

### ✅ {change name} 接手须知

**遗留问题**：交付物中的已知缺口——做了但不完善。

无

**外溢发现**：过程中的额外发现——需要做但不适合在当前 change 完成。

无

**依赖内容**：后续工作必须知道的前提——本 change 建立的事实。

无
