# Tasks

> 具体要干的活。每条包含标签、优先级、状态、预估工作量。

## 任务总览

> 按编号索引，含标签和依赖关系。

| 编号 | 任务 | 标签 | 依赖 | 优先级 | 状态 | 预估 |
|:----:|------|:----:|:----:|:----:|:----:|:----:|
| T1 | 活动变更注册表初始化 | Registry/Init | | 中 | 🔲 | 中 |
| T2 | 注册表功能模块 | Registry/核心 | T1 | 高 | 🔲 | 中 |
| T3 | 注册表子命令 | Registry/CLI | T2 | 高 | 🔲 | 中 |
| T4 | 注册表与opsx命令集成 | Registry/Opsx | T3 | 中 | 🔲 | 中 |
| T5 | openspec list 占位脚本 | Registry/占位脚本 | T1+T3 | 低 | 🔲 | 大 |
| T6 | 安装程序 | Registry/安装器 | T5 | 中 | 🔲 | 中 |

---

## Sprint 1

| 编号 | 任务 | 标签 | 优先级 | 预估 | 状态 |
|:----:|------|:----:|:----:|:----:|:----:|
| T1 | 活动变更注册表初始化 | Registry/Init | 中 | 中 | 🔲 |
| T2 | 注册表功能模块 | Registry/核心 | 高 | 中 | 🔲 |
| T3 | 注册表子命令 | Registry/CLI | 高 | 中 | 🔲 |
| T4 | 注册表与opsx命令集成 | Registry/Opsx | 中 | 中 | 🔲 |
| T5 | openspec list 占位脚本 | Registry/占位脚本 | 低 | 大 | 🔲 |

### 任务卡片

#### T1: 活动变更注册表初始化

**WHY**：openspec/changes.json 是所有活跃变更的注册表。包装脚本通过它感知 worktree 中的活跃变更，从而在 `openspec list` 中跨 worktree 展示。同时它也被 findProjectRoot 用作项目根标记文件。init 时预置是最佳时机，确保项目从一开始就有注册表。

**WHAT**：在 cli.js 的 runInit() 中，setup 脚本执行后、git add 前，创建 openspec/changes.json。仅不存在时创建，存在则跳过。不修改 setup 脚本。

**HOW**：检查 path.join(targetDir, 'openspec/changes.json') → mkdirSync（如父目录不存在）→ writeFileSync → 内容 {"changes":[]}。约 5 行 JS。

**验收标准**：
- [ ] init 新项目后 openspec/changes.json 存在，内容为 {"changes":[]}
- [ ] 已有 changes.json 时 init 不修改内容
- [ ] git status 包含该文件，随首次提交入库

#### T2: 注册表功能模块

**WHY**：所有注册表操作（增删改查）需要集中管理。直接读写 JSON 文件看似简单，但要处理文件不存在的空注册表、JSON 损坏、同名覆盖、保留空文件等边界。抽成独立模块后 CLI 子命令和未来的其他消费者都能复用。

**WHAT**：创建 `scripts/registry.js`，CommonJS 模块，导出 6 个函数：
- `read(path)` — 读 openspec/changes.json，文件不存在或损坏时返回 `{changes:[]}`，不抛异常
- `write(path, data)` — 写回文件，确保 `openspec/` 目录存在
- `add(path, name, status, worktree)` — 同名覆盖写入，自动设置 `createdAt` 时间戳
- `remove(path, name)` — 按 name 删除条目，保留空文件（不 unlink）
- `updateStatus(path, name, status)` — 更新指定条目的 status 字段
- `list(path)` — 格式化输出所有活跃变更

**HOW**：纯 CommonJS（`require` / `module.exports`）。每条变更记录格式 `{name, status, worktree, createdAt}`。`createdAt` 为 ISO 8601 字符串。`list()` 输出格式参考原生 openspec list 风格。TDD 先行。

**验收标准**：
- [ ] `read()` 文件不存在时返回 `{changes:[]}`，不抛异常
- [ ] `read()` JSON 损坏时返回 `{changes:[]}`，不抛异常
- [ ] `add()` 写入新条目，同名调用覆盖旧条目
- [ ] `add()` 自动写入 `createdAt` ISO 时间戳
- [ ] `remove()` 删除条目，文件保留不删除
- [ ] `updateStatus()` 仅更新指定条目的 status
- [ ] `list()` 格式化输出所有条目
- [ ] `lsp_diagnostics` 无报错

#### T3: 注册表子命令

**WHY**：opsx 命令和用户需要 CLI 入口来操控注册表。`bin/cli.js` 需要新增 `registry` 子命令，通过 `findProjectRoot` 从任意子目录定位项目根，加载 registry.js 分发操作。

**WHAT**：在 `bin/cli.js` 中：
1. 实现 `findProjectRoot(dir)` — 从给定目录向上逐级查找 `openspec/changes.json`，找到返回该目录路径，未找到返回 null
2. 新增 `registry` 子命令处理分支，解析 `add/remove/update-status/list/verify` 五个子操作
3. 加载 `<tool-dir>/scripts/registry.js`（通过 `path.dirname(__dirname)` 定位）
4. 调用对应函数，传入项目根下的 `openspec/changes.json` 路径
5. 非项目目录下 registry 命令报友好错误

`verify` 子操作检查四项：① `openspec-orig` 是否存在（which/where 查 openspec 所在目录）② `openspec` 是否是包装脚本（读取首行特征标记）③ `changes.json` 是否合法 JSON ④ 注册表每条记录的 worktree 目录是否存在。前三项在 `registry add` 时也自动触发检查，有问题给用户提示。

如果 ①② 显示包装脚本缺失（openspec-orig 存在但 openspec 不是包装脚本），询问用户"openspec 占位脚本缺失，是否自动修复？[Y/n]"，同意则调用 `node <tool-dir>/scripts/installer.js --repair` 自动安装。

**`verify` 执行时机**：

| 场景 | 失败时行为 |
|------|------------|
| 用户手动运行 `registry verify` | 输出报告，不修改 |
| `registry add` 自动触发 | 发现问题 → 询问是否修复 → 修复后继续 / 否则停止 |
| opsx 命令中原 `openspec list` 替换为 `registry verify` + `openspec list` 占位脚本 | 同上 |

**HOW**：`openspec` 包装脚本检测方式——读取 openspec 文件的前几行找特征标记（如 `# openspec wrapper for oso registry`）。`openspec-orig` 检测——`which openspec` 拿到路径 → `dirname` 目录下找 `openspec-orig`。更新 help 文本。

**验收标准**：
- [ ] `registry add` 在项目内写入注册表
- [ ] `registry remove` 删除条目保留空文件
- [ ] `registry update-status` 更新状态
- [ ] `registry list` 打印格式化列表
- [ ] `registry verify` 在项目内报告注册表健康状况（有效条目 + 失联条目）
- [ ] `registry verify` 在非项目中提示无法验证
- [ ] 在项目子目录运行也能找到项目根
- [ ] 在非项目中运行提示错误
- [ ] help 文本包含 registry 用法
- [ ] `lsp_diagnostics` 无报错

#### T4: 注册表与 opsx 命令集成

**WHY**：注册表只在 opsx 命令执行时同步才有意义。创建变更时 add 条目，开始/完成实现时 update-status，归档清理时 remove 条目。同时，opsx 命令中所有调用 `openspec list` 的地方（共 7 个文件），需要在前面加一道 verify 检查，确保包装环境和注册表状态正常。

**WHAT**：分两类修改：

① **生命周期注册表同步** — 6 个命令插入 registry 调用：

| 命令 | 插入位置 | 操作 |
|------|----------|------|
| `opsx-new.md` | Step 4（创建 artifacts 后） | `registry add <name> created .worktrees/<name>` |
| `opsx-propose.md` | Step 4（创建 artifacts 后） | `registry add <name> proposed .worktrees/<name>` |
| `opsx-ff.md` | Step 4（scaffold 创建后） | `registry add <name> created .worktrees/<name>` |
| `opsx-continue.md` | Step 4 开始（创建 artifact 前） | `registry update-status <name> in-progress` |
| `opsx-apply.md` | Step 3（开始实现前）+ Step 8（提交后） | `update-status implementing` / `implemented` |
| `opsx-finish.md` | Step 3（归档后） | `registry remove <name>` |

② **verify + 占位脚本 openspec list 替换** — 7 个命令中原本调用原生 `openspec list` 的地方，替换为先 `registry verify` 再通过占位脚本 `openspec list`（此时 list 已由 T5 包装脚本接管，自动合并注册表输出）：

| 命令 | 替换 |
|------|------|
| `opsx-apply.md` | `openspec-superpowers-opencode registry verify` → `openspec list --json` |
| `opsx-archive.md` | 同上 |
| `opsx-bulk-archive.md` | 同上 |
| `opsx-continue.md` | 同上 |
| `opsx-explore.md` | 同上 |
| `opsx-sync.md` | 同上 |
| `opsx-verify.md` | 同上 |

**HOW**：`registry add` / `update-status` / `remove` 放在生命周期对应步骤。`verify` 放在 `openspec list` 之前 1-2 行，使用独立 ```bash 代码块。所有调用通过 ```bash 代码块插入。

**验收标准**：
- [ ] 6 个 opsx 命令文件均新增了 registry 生命周期调用
- [ ] 7 个 opsx 命令文件中的 `openspec list` 调用前均插入了 `registry verify`
- [ ] `opsx-new.md` — add 在 artifacts 创建完成后
- [ ] `opsx-propose.md` — add 在 artifacts 创建完成后
- [ ] `opsx-ff.md` — add 在 scaffold 创建后（Step 4）
- [ ] `opsx-continue.md` — update-status in-progress 在 Step 4 开始处
- [ ] `opsx-apply.md` — 开始处 update-status implementing，提交后 update-status implemented
- [ ] `opsx-finish.md` — remove 在 openspec archive 之后
- [ ] 所有调用格式统一为 `openspec-superpowers-opencode registry ...`
- [ ] 不影响 opsx 命令原有流程逻辑

#### T5: openspec list 占位脚本

**WHY**：包装脚本是用户无感获得合并注册表能力的关键。通过拦截 PATH 中的 `openspec` 命令，在项目目录内执行 `openspec list` 时自动合并所有 worktree 活跃变更的展示。需要三个平台各一份脚本，行为一致。

**WHAT**：创建三类包装脚本文件（不含安装程序逻辑）：
- `scripts/wrapper/openspec` — Unix/macOS shell 脚本
- `scripts/wrapper/openspec.cmd` — Windows CMD 批处理
- `scripts/wrapper/openspec.ps1` — Windows PowerShell 脚本

每份脚本逻辑：
1. 从 CWD 向上查找 `openspec/changes.json`（findProjectRoot）
2. 如果 `$args[0] == "list"` 且在项目内 → 调用 `openspec-orig list` + 读注册表 → 合并输出
3. 否则 → `exec openspec-orig $args` 透传
4. 边界处理：JSON 损坏 → 打印警告 + 回退到原生 list；worktree 目录不存在 → 跳过但保留注册表记录

合并输出策略：先调用 `openspec-orig list` 获取原生列表 → 读注册表追加工 worktree path 列 → 同名条目以注册表为准 → 排序输出。

**HOW**：T5 只产生脚本源文件（存在 `scripts/wrapper/` 下），不含安装/部署逻辑。安装程序是后续独立任务。三种脚本从同一逻辑翻译为各自语法。注意 `openspec` 文件名不带后缀应放在 Unix 脚本中。

**验收标准**：
- [ ] `scripts/wrapper/openspec`（Unix shell）脚本完成
- [ ] `scripts/wrapper/openspec.cmd`（Windows CMD）脚本完成
- [ ] `scripts/wrapper/openspec.ps1`（PowerShell）脚本完成
- [ ] 在项目内执行 openspec list 时调用 findProjectRoot 并合并注册表
- [ ] 在项目外执行 openspec list 时透传 openspec-orig list
- [ ] 非 list 命令始终透传
- [ ] JSON 损坏时打印警告 "⚠ registry corrupted, falling back to native list" 并回退
- [ ] `lsp_diagnostics` 无报错

#### T6: 安装程序

**WHY**：包装脚本必须部署到 PATH 中才能拦截 `openspec` 命令。安装程序负责检测用户环境、找到原版 `openspec` CLI、重命名为 `openspec-orig`、在同目录写入包装脚本。独立程序，不依赖 npm postinstall，可反复执行。

**WHAT**：创建安装脚本，执行：
1. 检测平台（Win CMD / Win PS / Unix），确定入口文件后缀
2. 定位原版 `openspec` CLI 所在目录（`npm root -g` 的上级 `bin/` 目录，或 `where`/`which` 路径）
3. 将该目录下的 `openspec`、`openspec.cmd`、`openspec.ps1` 全部重命名为 `openspec-orig.*`
4. 从 `<tool-dir>/scripts/wrapper/` 读取对应平台的包装脚本，写入同目录（同名）
5. `chmod +x` 设置可执行权限（Unix）
6. 重新执行时：跳过 rename 步骤（`openspec-orig` 已存在），只覆盖包装脚本

**HOW**：Node.js 脚本（`scripts/installer.js`），由用户运行 `node <tool-dir>/scripts/installer.js`。通过 `npm root -g` 或 `which openspec` / `where openspec` 定位。需要管理员/root 权限写入系统 PATH 目录时提示用户自行提权。

`--repair` 模式：检测 `openspec-orig` 是否存在，存在则跳过 rename 直接覆盖包装脚本。用于 npm update 后恢复。

**验收标准**：
- [ ] 安装后 `openspec` 指向包装脚本，`openspec-orig` 指向原版
- [ ] 三种平台入口均正确处理
- [ ] 重新执行安装检测 `openspec-orig` 已存在，跳过 rename 只覆盖包装脚本
- [ ] `--repair` 模式：openspec-orig 存在时只覆盖包装脚本，不存在时报错
- [ ] 包装脚本正确拦截 openspec list 并合并注册表
- [ ] 非 list 命令透传到 openspec-orig
- [ ] `lsp_diagnostics` 无报错

## Sprint 2

| 编号 | 任务 | 标签 | 优先级 | 预估 | 状态 |
|:----:|------|:----:|:----:|:----:|:----:|
| T5 | openspec list 占位脚本 | Registry/占位脚本 | 低 | 大 | 🔲 |
| T6 | 安装程序 | Registry/安装器 | 中 | 中 | 🔲 |

---

## 待办

> 高优先级待处理任务速查（自动从任务总览提取）。

| 优先级 | 任务 | 说明 |
|:------:|------|------|

## 约束

> 跨任务的通用规则和限制。

| 约束 | 说明 |
|------|------|

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
