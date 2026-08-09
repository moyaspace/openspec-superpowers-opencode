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
| `openspec/config.yaml` | ❌ 工具基础设施 | 只读，AI 不可修改 | 覆盖部署 |
| `openspec/oso-change-registry.json` | ❌ 本地开发状态 | 记录活跃 worktree，非项目历史。clone 新机器的人不需要知道别人本地开了哪些 worktree。 | 存在时询问用户 |
| `AGENTS.md` | ✅ | 需要，AI 指导 | 不覆盖已有 bridge 内容 |
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

##### DDR-2: Template 点文件使用 `_` 前缀

- **背景**: `template/` 目录存放部署到目标项目的原料文件。其中点前缀文件（`.editorconfig`、`.gitattributes`、`.gitignore`、`AGENTS.md`）在包仓库中会被 git、编辑器、OpenCode 自动识别为"生效配置"，而非"模板原料"：

  | 文件 | 谁会被影响 | 影响 |
  |------|-----------|------|
  | `.gitignore` | git | 规则可能意外排除包仓库自身的文件 |
  | `.editorconfig` | 编辑器 | 影响当前仓库的编辑行为 |
  | `.gitattributes` | git | 影响当前仓库的 git 行为 |
  | `AGENTS.md` | OpenCode | 被自动加载为 AI 指令，模板占位符 `{{SUPERPOWERS_BASE_PATH}}` 未替换 |

- **决策**: template 根级所有点文件统一使用 `_` 前缀替代 `.`：
  - `_gitignore`（原 `.gitignore`，由 npm 11.x bug 触发）
  - `_gitattributes`（原 `.gitattributes`）
  - `_editorconfig`（原 `.editorconfig`）
  - `_AGENTS.md`（原 `AGENTS.md`）

  setup 脚本在部署时复制 `_xxx` → `.xxx`，目标项目得到的是正常点文件。

- **理由**:
  - `_gitignore` 由 npm 11.x bug（自动重命名 `.gitignore` → `.npmignore`）发起，但 `_` 前缀实际更合理——语义准确：**"这是模板原料，不是生效配置"**
  - 名为 `.gitignore` 时会影响 git 对其所在目录的行为，`_gitignore` 避免了这种副作用
  - `AGENTS.md`（无 `.` 前缀）同样被 OpenCode 自动发现加载，改为 `_AGENTS.md` 后逃脱文件名自动发现机制，消除未替换占位符的副作用
  - 文件名自动发现通常按精确文件名匹配，`_` 前缀是有效的逃脱手段
  - 语义一致：template/ 下的点文件全部带 `_` 前缀，一目了然

- **影响**: 无功能影响。setup 脚本部署路径和测试文件路径同步更新即可。新贡献者看到 `_gitignore` 第一反应是"模板原料，不是生效的 `.gitignore`"。

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

#### ADR-11: 统一 setup 实现——从双脚本迁移到单一 JavaScript

- **决策**: 删除 `scripts/setup.ps1`（PowerShell）和 `scripts/setup.sh`（Bash），统一为 `lib/setup/` 下的纯 JavaScript 模块化实现。
- **背景**: 自项目创建以来，`oso init`、`oso reset` 和 `oso dry-run` 一直由两套独立的 shell 脚本驱动。一开始是对称实现，随着迭代出现行为分叉：

  | 差异 | PowerShell | Bash |
  |------|-----------|------|
  | `BROWN_OVERRIDE_OCODEJSON` | ✅ 支持 | ❌ 不存在 |
  | Schema 验证失败处理 | ✅ 正确上报 | ❌ 可能输出"验证通过" |
  | 无效 `BROWN_OVERRIDE_*` 值 | 回退交互 | 静默跳过 |
  | 字符串转义、路径拼接、JSON 解析 | 各自实现 | 各自实现 |

  每个命令执行时 `bin/cli.js` 先检测操作系统，再 `execSync` 启动对应的 shell 脚本。测试也在复制脚本逻辑——没有直接测试生产实现的模块。

- **方案比较**:

  | 方案 | 做法 | 成本 | 收益 |
  |------|------|------|------|
  | A. 单文件 `scripts/setup.js` | 直译双脚本为 1 个千行 JS | 低 | 最低：进程转发仍在，模块边界差 |
  | **B. 模块化 `lib/setup/` ⬅ 已实施** | **拆分为 context/discovery/planner/deploy/merge/manifest/verify/prompt/reset 模块** | **中** | **测试直接覆盖生产代码，跨平台统一，隔离跨平台差异** |
  | C. 声明式引擎 | 操作描述 → 通用引擎解释执行 | 高 | 扩展性最好，但当前只有一套安装模板 |

- **决策理由**:
  1. **消除行为漂移** — 一套实现，一个行为，不再有平台条件编译式的 if-OS-then 脚本选择
  2. **测试直接覆盖生产代码** — 导入 `lib/setup/*` 即可测试，不再复制脚本逻辑或在 CI 跨平台验证行为一致性
  3. **跨平台差异隔离到单模块** — 路径分隔、外部进程调用、npm `.cmd` shim 适配统一收在 `process-runner.js`，业务模块不感知平台
  4. **结构化操作计划** — 部署不再拼接 shell 命令字符串，改用 `{ type, source, target, content }` 对象；dry-run 与真实部署共享同一份计划生成代码
  5. **原子写入** — 通过同目录临时文件 + `rename` 实现逐文件原子写入，避免 I/O 中断留下截断文件
- **结构**: `bin/cli.js` 只做参数解析与结果映射，不承载 setup 业务逻辑，也不在内部模块中调用 `process.exit()`。

  ```
  bin/cli.js                  参数解析、用户输出、退出码
  lib/setup/
    index.js                  initProject/resetProject/dryRunProject（编排）
    context.js                目标目录、模板目录、语言、模式判定
    discovery.js              外部 CLI 与 Superpowers 发现
    planner.js                生成结构化安装/删除操作计划
    deploy.js                 执行目录和文件操作（原子写入）
    merge.js                  JSON 与 marker 文件合并
    manifest.js               manifest 生成、兼容读取、根目录逃逸校验
    reset.js                  按 manifest 生成并执行删除计划
    verify.js                 schema、模板和 workflow 验证
    prompt.js                 交互询问与环境变量覆盖（`resolveDecision`）
    process-runner.js         跨平台外部命令执行（统一 shell 转义）
    cli-adapter.js            CLI 与 API 的适配层
    console-reporter.js       控制台输出格式化
  ```

- **保留的 CLI 契约**: `oso init [dir] [--lang zh-CN|zh-TW|en]`、`oso reset [dir]`、`oso dry-run [dir] [--lang ...]`、`create-openspec-superpowers-opencode [dir]`——所有公开入口行为不变。
- **影响**:
  - `scripts/setup.ps1` 和 `scripts/setup.sh` 从仓库和 npm tarball 中删除
  - 不再有操作系统条件分发——`bin/cli.js` 直接 `require('lib/setup')`
  - `dry-run` 与 `init` 共享同一份 `createInitPlan()`，不维护两份部署逻辑
  - `.gitattributes` 中为两个 shell 脚本保留的 CRLF 约束一并删除
  - 测试可以注入 fake prompt、fake process runner、fake filesystem 来确定性验证棕地决策路径
- **详细设计**: `docs/designs/unify-setup-scripts.md`
