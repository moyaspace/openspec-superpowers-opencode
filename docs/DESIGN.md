# 设计决策

## 文件部署策略

### 原则

1. **不污染目标项目根目录** — 包的管理数据和实现细节不部署到目标项目根目录
2. **棕地安全** — 所有操作不覆盖目标项目已有文件
3. **精确卸载** — reset 只删除安装时实际写入的文件，不误伤用户自有文件

### 决策记录

#### ADR-1: opencode.json 的位置

- **决策**: `opencode.json` 放在 `template/.opencode/opencode.json`
- **理由**:
  - OpenCode 代码（`config.ts`）同时支持项目根目录和 `.opencode/` 内的配置
  - 放在 `.opencode/` 内与 commands/、skills/ 统一，不污染项目根目录
  - 与棕地项目可能已有的根目录 `opencode.json` 不会冲突
- **影响**: setup 脚本不需要单独处理 opencode.json，整个 `.opencode/` 统一复制

#### ADR-2: template/.opencode/ 不覆盖规则

- **决策**: `.opencode/` 下的所有文件逐文件检查，只复制目标不存在的
- **理由**: 棕地项目可能已有 `.opencode/commands/`、`.opencode/skills/` 等，覆盖会破坏用户配置
- **实现**: `Copy-Item -Recurse -Force` → 逐个文件 `Test-Path → Copy-Item`
- **影响**: manifest 只记录实际写入的文件；reset 只删 manifest 中的文件

#### ADR-3: LICENSE 不部署

- **决策**: `template/LICENSE` 不再复制到目标项目
- **理由**: 这是本包的 MIT 许可，目标项目应有自己的许可协议
- **影响**: 无，目标项目自行管理 LICENSE

#### ADR-4: skills.lock.json 仅包内使用

- **决策**: `template/skills.lock.json` 不再部署到目标项目，仅 init 时 Step 1.5 校验用
- **理由**: 锁定的 skill 哈希值是包的管理数据，不是目标项目的工作数据
- **影响**: setup 脚本从 template/ 读取校验，不再向目标项目写入

#### ADR-5: install-manifest.json 放入 .opencode/

- **决策**: 安装清单重命名为 `install-manifest.json`，放入 `.opencode/` 内
- **理由**:
  - 精确记录安装时实际写入的文件路径，确保 reset 不误伤
  - 放在 `.opencode/` 内不会污染项目根目录
- **影响**: reset 读 `.opencode/install-manifest.json` 逐文件删除

#### ADR-6: 棕地优先

- **决策**: 所有文件操作以棕地安全为前提
- **理由**: 目标项目可能有已有配置，不能破坏
- **实现**: 全流程 `Test-Path dst → 不存在才复制`
- **影响**: 绿地项目行为不变；棕地项目只补充缺失文件

#### ADR-7: 基础设施文件单独 gitignore，不排除整个 openspec/

- **决策**: 部署到用户项目后，仅 gitignore `openspec/schemas/` 和 `openspec/config.yaml`，不再 gitignore 整个 `openspec/` 目录
- **理由**:
  - `openspec/` 目录混合了基础设施文件（schemas/、config.yaml）和用户内容（changes/、specs/）
  - 整个 `openspec/` 被 gitignore 导致用户的变更和规格文档无法被 git 追踪 → v1.0.5 的 bug
  - gitignore 应只作用于非用户内容，不干扰用户工作流
- **实现**: setup 脚本 `.gitignore` 追加条目从 `openspec/` 拆分为 `openspec/schemas/` 和 `openspec/config.yaml`
- **影响**: 用户可正常提交 `openspec/changes/` 和 `openspec/specs/`；基础设施文件依然受 gitignore 保护

#### ADR-8: opencode.json 权限防御（Deny-by-Default 细化）

- **决策**: 在 `template/.opencode/opencode.json` 中将 `edit` 权限从 `"openspec/**": "allow"` 拆分为更细粒度的规则：
  - `openspec/changes/**` → `allow`（用户需要编辑自己的变更）
  - `openspec/specs/**` → `allow`（用户需要编辑规格）
  - `openspec/schemas/**` → `deny`（基础设施，禁止 OpenCode 修改）
  - `openspec/config.yaml` → `deny`（基础设施，禁止 OpenCode 修改）
- **理由**:
  - `openspec/` 同时包含用户内容和基础设施，不应一刀切允许
  - 基础设施文件（schemas、config.yaml）是工具部署的，用户不应通过 AI 修改
  - `deny` 是硬阻断，即使 AI 主动请求也无法修改（`ask` 仍可通过用户确认放行）
- **实现**: `template/.opencode/opencode.json` 的 `edit` 权限对象中替换 `"openspec/**": "allow"` 为具体规则
- **影响**:
  - AI 对 `openspec/schemas/**` 和 `openspec/config.yaml` 的任何编辑操作被静默拒绝
  - 用户仍然可以在文件系统中直接编辑这些文件
  - 绿地项目直接使用新模板；棕地项目 merge 时 deny 规则由 ADR-9 机制强制注入

#### ADR-9: 棕地合并强制注入 deny 规则

- **决策**: Brownfield merge 时，除 required allow 路径外，同时向 `write` 和 `edit` 权限对象强制注入 deny 规则
  - `openspec/schemas/**` → `deny`
  - `openspec/config.yaml` → `deny`
- **理由**:
  - ADR-8 的 deny 规则在绿地项目直接生效，但棕地合并时未被携带到用户已有的 `opencode.json` 中
  - `"*": "ask"` 虽提供兜底保护，但 deny 是更强的安全语义——任何 allow 规则都无法覆盖 deny
  - 基础设施文件的不可修改性是不可协商的安全底线，同 required allow 路径一样必须强制注入
- **实现**: `setup.ps1`（PowerShell）和 `setup.sh`（Python3）的 union merge 逻辑中新增 `$denyPaths` / `deny_paths` 数组，在 required paths 注入后追加 deny 规则写入
- **影响**:
  - 棕地项目 merge 后 `opencode.json` 的 `edit`/`write` 中自动包含 schemas/config.yaml 的 deny 规则
  - 用户原有权限结构不受影响（deny 是追加，不覆盖已有条目）
  - 与 ADR-8 一致，用户仍可文件系统直接编辑基础设施文件
  - 需要记录到测试文档 Phase 6.3 的验证预期中

### 概念解释：办公室与仓库

理解本项目的工作区隔离（worktree）和权限设计，可以用一个比喻：

> **`main` 目录是仓库，`.worktrees/<name>/` 是 AI 的办公室。**

| 概念                      | 比喻           | 说明                                                       |
| ------------------------- | -------------- | ---------------------------------------------------------- |
| `main` 目录               | 仓库           | 存放所有基础设施（schema、config、模板）。不在此处写代码。 |
| `.worktrees/<name>/`      | AI 的办公室    | 实际工作区。只放需要的东西（`changes/`、`specs/`）。       |
| `openspec/schemas/`       | 工具柜的说明书 | 仓库里有，办公室**不复制**。                               |
| `.gitignore`              | 仓库门口的告示 | 说「说明书别装进快递箱（git commit）」。                   |
| `opencode.json` deny 规则 | 仓库的安全门禁 | AI 回仓库拿资料时不能乱翻工具柜。                          |

**为什么两个机制缺一不可：**

1. **`.gitignore`**：确保 schemas 不进版本控制，worktree 基于 commit 创建，自然也不会有 schemas。解决了「别让每个工作区都背着一套说明书」的问题。
2. **`opencode.json` deny 规则**：AI 虽然大多数时间在办公室（worktree）工作，但有时会回仓库（main）操作——`openspec status`、`opsx-archive`、查看配置等。此时 schemas **就在磁盘上**，deny 规则阻止 AI 误改。

```
main 目录（仓库）                 worktree（AI 办公室）
├── .gitignore                    ├── .gitignore
├── opencode.json                 ├── opencode.json
│   └── edit: schemas → deny      │   └── edit: schemas → deny
├── openspec/                     └── openspec/
│   ├── schemas/  ← 存在 + 受保护   只复制 changes/ 和 specs/
│   ├── changes/
│   └── specs/
└── .worktrees/
    └── feature-a/  ← 实际工作区
```

两者针对同一批文件，但解决的问题不同，是**互补防御**而非重复。

### 文件分类

| 文件                              | 属于目标项目？  | 行为                      | 部署方式                               |
| --------------------------------- | :-------------: | ------------------------- | -------------------------------------- |
| `.opencode/commands/`             |       ✅        | 需要，工作流入口          | 不覆盖，不存在才复制                   |
| `.opencode/skills/`               |       ✅        | 需要，OPSX skill 定义     | 不覆盖，不存在才复制                   |
| `.opencode/opencode.json`         |       ✅        | 需要，AI 权限规则         | 不覆盖，不存在才复制                   |
| `.opencode/install-manifest.json` |  ❌ 包管理数据  | 仅 reset 用，对项目透明   | 总是写入（记录实际安装文件）           |
| `openspec/changes/`               |       ✅        | 需要，用户变更数据        | 不存在才创建空目录                     |
| `openspec/specs/`                 |       ✅        | 需要，用户规格文档        | 不存在才创建空目录                     |
| `openspec/schemas/`               | ❌ 工具基础设施 | 只读，AI 不可修改         | 覆盖部署                               |
| `openspec/config.yaml`            | ❌ 工具基础设施 | 只读，AI 不可修改         | 覆盖部署                               |
| `AGENTS.md`                       |       ✅        | 需要，AI 指导             | 不覆盖已有 bridge 内容                 |
| `.gitignore`                      |       ✅        | 需要，排除 .worktrees/ 等 | 不存在才创建；已存在只追加基础设施排除 |
| `.gitattributes`                  |       ✅        | 需要，行尾规范化          | 不存在才创建                           |
| `LICENSE`                         |       ❌        | 包的许可，非项目许可      | 不部署                                 |
| `skills.lock.json`                |       ❌        | 包校验数据                | 不部署                                 |

### gitignore 跟踪策略

#### 原则

```
项目约定的配置    → 跟踪
项目的产物        → 跟踪
工具生成的产物    → 不跟踪
```

- **项目约定的配置** — "项目应该怎么干活"的配置（`.editorconfig`、`.gitattributes`、`.gitignore`、`AGENTS.md`、`.opencode/opencode.json` 等）
- **项目的产物** — 用户写的代码、specs、变更记录等
- **工具生成的产物** — CLI 生成/可重建的文件（`commands/`、`skills/`、`schemas/`、`config.yaml` 等）

#### 决策记录

##### DDR-1: 工具制品不跟踪

- **决策**: `template/_gitignore` 中追加以下忽略规则：

  ```gitignore
  .opencode/
  !.opencode/opencode.json
  skills.lock.json
  ```

  - `.opencode/`（含 `commands/`、`skills/` 等）— 整个忽略，只放行 `opencode.json`
  - `skills.lock.json` — 锁全局 Superpowers 版本，非项目依赖

- **理由**: `.opencode/` 目录由 `openspec init` / `openspec update` 批量生成，版本绑定 CLI 而非项目代码。整体忽略 + 显式放行 `opencode.json` 比逐一列出更简洁，且未来新增的工具目录自动被覆盖。`skills.lock.json` 是全局锁定数据，同不跟踪。

- **不影响跟踪的配置**:
  - `.editorconfig` — 项目约定，跟踪
  - `.gitattributes` — 项目约定，跟踪
  - `.gitignore` — 项目约定，跟踪
  - `AGENTS.md` — 项目约定，跟踪
  - `.opencode/opencode.json` — 项目级工具配置，跟踪

#### ADR-10: npm 11.x `.gitignore` → `.npmignore` 重命名 Bug

- **背景**: `npm install <tarball>`（如 `npm install -g ./tgz` 或发布后 `npm install -g`）在 npm 11.x 中会将包内的 `.gitignore` 文件自动重命名为 `.npmignore`。确认复现：npm 11.9.0，Windows 和 Linux 均触发。
- **影响**: 包内 `template/.gitignore` 在安装时变成 `template/.npmignore`，setup 脚本按 `.gitignore` 文件名读取失败，导致 init 后的项目缺少 `.gitignore`。
- **排除其他原因**:
  - 不是 `.npmignore` 文件模式导致（删除 `/.gitignore` 后问题依旧）
  - 不是 package.json `files` 字段配置错误（显式列入 `template/.gitignore` 仍被重命名）
  - 不影响 `.editorconfig`、`.gitattributes`、`_gitignore` 等其他点前缀文件
- **决策**: 将 `template/.gitignore` 重命名为 `template/_gitignore`，setup 脚本读取 `_gitignore` 后在目标写入 `.gitignore`。
- **额外防御**: setup 脚本添加 fallback 逻辑，如果源文件复制失败则直接通过 echo/Set-Content 创建 `.gitignore`，不依赖 npm 版本行为。
- **验证**: test Phase 13 覆盖文件存在性、grep 模式匹配、以及 `git diff --cached` 确认基础设施文件不被 stage。
- **参考**: 无官方 issue — 此为经验发现。当前 npm 11.9.0 行为，未来版本可能修复。重新启用 `template/.gitignore` 前需验证目标 npm 版本无此 bug。
