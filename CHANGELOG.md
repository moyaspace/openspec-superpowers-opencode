# Changelog

本文件记录 `@moyaspace/openspec-superpowers-opencode`（`oso`）的对外变更，自 1.1.2 起维护（此前版本无 CHANGELOG）。
格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [1.1.2] - 2026-11-04

### 升级前必读

- **Node.js 要求提高到 `>= 22.9.0`**（1.1.1 为 `>= 16`）。
- **老项目重跑 `oso init` 的默认行为已改变**：OSO 自有资产（`.opencode/commands/`、`.opencode/skills/`、`openspec/schemas/`）默认**覆盖**，并逐条打印「已更新：<path>」。依赖旧默认（保留）的项目请显式设置 `BROWN_OVERRIDE_COMMANDS=no` / `BROWN_OVERRIDE_SKILLS=no`。
- **包不再有 `install` 生命周期脚本**：安装完成后不会自动写 `openspec` 垫片，改由 `oso init` 自检并安装。npm 12 用户因此不再需要 `--allow-scripts`。

### Added

- **Superpowers v7 支持**：v7 环境下 `oso init` 无 hash 警告；`/opsx-apply` 的 v6 及以上分支委托上游 `subagent-driven-development` 控制器（v7 下含 7 份 `references/`），v5 分支行为不变。
- **`oso verify` 增加 bash 可用性检查**：SDD 脚本需要 bash，缺失时给出 ⚠ 与安装提示（不判为失败）；`oso init` 也会打印该行。
- **子命令级 `--help`**：`oso <subcommand> --help` 打印说明后 `exit 0`，在产生任何副作用之前短路（例如 `oso install-shims --help` 不再真的去装垫片）。
- **多分支 base 支持**：`ensure-worktree` 把当前分支记入注册表的 `baseBranch`，`/opsx-propose`、`/opsx-finish`、`/opsx-ff`、`/opsx-new`、`/opsx-continue` 不再假设 `main`；`/opsx-finish` 优先从注册表读取基础分支，读不到时询问用户而非默认为 `main`。

### Changed

- **升级可见性**：`oso init` 覆盖已有文件时输出「已更新：<相对路径>」，内容未变则不输出；新建文件仍输出 `✓ <path>`。升级因此可审计。
- **`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` / `BROWN_OVERRIDE_OPENSPEC` 三档开关保留**，仅「未设置」这一档的默认从「保留」改为「覆盖」（显式 `no` 仍然生效）。
- **帮助与报错里的命令示例统一为 `oso ...`**：长命令 `openspec-superpowers-opencode` 继续可用，解析路径不变。
- **垫片安装失败不再中止 `oso init`**：跳过该步、走完 8/8、仍以 exit 0 结束，结尾输出独立提示块，含失败原因、实际 binDir 与按平台/权限区分的可照抄命令（Unix 系统 npm 需 `sudo oso install-shims`，nvm/用户级 prefix 无需 sudo，Windows 需管理员权限或 `gsudo`）。
- **垫片写入改为原子替换**：先写同目录临时文件再 `rename` 覆盖，避免「unlink 成功、write 失败」导致用户的 `openspec` 命令消失；权限不足时不再静默跳过。
- **`/opsx-finish` 的测试命令按项目自带入口分派**：优先 `makefile test:` → CI 显式命令 → 项目文档，候选冲突或疑似子集时询问用户；失败先甄别环境类问题，语言默认命令仅作兜底。
- **包内实现迁移为 TypeScript + ESM**（`lib/` → `dist/`，入口仍为 `oso` / `openspec-superpowers-opencode`），构建产物不再入库，改由 `prepare` 在打包前现编。
- **模板 `AGENTS.md` 的「项目文档参考」改为「文档命名与位置约定」**：明确该节只回答「这类文档该叫什么、放在哪里」，**不代表当前存在也不代表缺失**，并显式禁止因路径不存在而创建目录或报告缺口。另在托管区块（marker）之外新增「文档参考」一节，供项目登记**实际存在**的文档及其作用——新建项目时只写入空标题与表头，`oso init` 不填写任何条目，升级时也不覆盖该节。

### Removed

- `install` 生命周期脚本（`scripts/shims-installer.mjs`）——它是 npm 12 下静默失效、且迫使 `dist/` 入库的根源。
- `dist/` 的 git 跟踪（产物由 `npm run build` / `prepare` 现编，tarball 仍包含 `dist/`）。
- 文档中「需要 `--allow-scripts`」的表述。

### Fixed

- **老项目重跑 `oso init` 时 `openspec/` 产品资产被整体跳过**（BUG021）：已有 `openspec/config.yaml` 且 `openspec/schemas/` 为空的项目不再 7/8 报 `Schema not found` 并 exit 1；`openspec/changes/**` 与 `openspec/specs/**` 仍永久保护。
- **老项目升级时命令文件不更新**（BUG022）：`.opencode/commands/` 与 `.opencode/skills/` 已存在时不再默认保留，1.1.1 → 1.1.2 的命令层改动能送到存量用户；模板中不存在、manifest 未记录的用户自建命令不会被删除。
- **棕地 init 整文件覆盖受管根文件**（BUG001）：`.gitignore`、`AGENTS.md`、`.gitattributes`、`.editorconfig` 只替换 marker 区块，用户原有行零删除。
- **回答覆盖后受管区块未替换、模板占位符残留**（BUG002）：落盘文件不再包含 `{{SUPERPOWERS_BASE_PATH}}`，渲染故障会显式失败而不是静默成功。
- **`openspec/` 不存在时仍询问「覆盖」**（BUG003）：缺 `openspec/config.yaml` 且 `openspec/schemas/` 为空时不再询问，直接部署。
- **`npm 12` 跳过 install 脚本导致垫片静默失效**（BUG004）：`oso init` 自检 `openspec` 垫片并尝试自动修复。
- **二次 `oso init` 的 8/8 必然失败**（BUG005）：部署后验证会临时注册 change 并在结束时清理，注册表无残留。
- **从未用过 OSO 的棕地项目不部署 `.opencode/commands/`**（BUG006）。
- **无匹配 Superpowers 版本时静默回退到 v5 清单**（BUG012）：改为按 major 精确匹配，超出支持范围时明确报「不支持」，绝不跨 major 复用清单。
- **`skills.lock.v6.json` 只匹配 v6.1.1，v6.2+ 报假 hash 警告**（BUG013）：清单刷新到 Superpowers v6.4.2。
- **`ensure-worktree` 在 linked worktree 内不幂等，且会删除已 checkout 的分支**（BUG020）：重复执行不再报错，也不再无条件 `git branch -D`。

### Internal

- elevated 套件（含 `lifecycle-e2e`：`npm pack` → 本地安装 → `oso init` → registry → reset）在 Unix 与 CI 上真实执行，不再恒为 `SKIPPED`（GAP005）；这是发布 tarball 可装可跑的唯一自动证据。
- 删除 V2 迁移遗留的一次性验收测试 `test/imp16-tarball-equivalence.test.js`，其独有断言迁入 CI 的 tarball 内容检查。
- CI 增加两条发布守卫：`dist/` 不得被 git 跟踪、构建后工作区必须干净。
