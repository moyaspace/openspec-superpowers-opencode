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

### 文件分类

| 文件 | 属于目标项目？ | 行为 | 部署方式 |
|------|:------------:|------|---------|
| `.opencode/commands/` | ✅ | 需要，工作流入口 | 不覆盖，不存在才复制 |
| `.opencode/skills/` | ✅ | 需要，OPSX skill 定义 | 不覆盖，不存在才复制 |
| `.opencode/opencode.json` | ✅ | 需要，AI 权限规则 | 不覆盖，不存在才复制 |
| `.opencode/install-manifest.json` | ❌ 包管理数据 | 仅 reset 用，对项目透明 | 总是写入（记录实际安装文件） |
| `openspec/` | ✅ | 需要，OpenSpec 工作流 | 覆盖（schema 更新） |
| `AGENTS.md` | ✅ | 需要，AI 指导 | 不覆盖已有 bridge 内容 |
| `.gitignore` | ✅ | 需要，排除 .worktrees/ | 不存在才创建；已存在只追加 .worktrees/ |
| `.gitattributes` | ✅ | 需要，行尾规范化 | 不存在才创建 |
| `LICENSE` | ❌ | 包的许可，非项目许可 | 不部署 |
| `skills.lock.json` | ❌ | 包校验数据 | 不部署 |
