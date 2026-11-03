# 快速开始

## 安装

### 从 npm 安装

```bash
npm install -g @moyaspace/openspec-superpowers-opencode
```

### 从本地 tgz 安装（离线/预览）

```bash
# 在项目根目录（或用绝对路径）
npm install -g ./<name>-<version>.tgz
```

### 权限说明

`oso init` 会自动检查并安装 `openspec` 垫片。垫片写在 **`openspec` 命令所在的 bin 目录**，
所以需不需要提权，取决于 `openspec` 是怎么装的：

- **系统 npm**（`npm i -g` 装到 `/usr/local/bin` 等系统前缀）：该目录通常属于 root，需要 `sudo oso install-shims`。
- **nvm / 用户级 prefix**（如 `npm config set prefix ~/.npm-global`）：目录属于当前用户，**无需 sudo**。
- **Windows**：以管理员身份打开 PowerShell，然后运行 `oso install-shims`；若装了 gsudo，可用 `gsudo oso install-shims` 代替。

怎么确认：`which openspec`（Windows 用 `where openspec`）看它落在哪个目录，再用 `ls -ld <目录>` 判断当前用户是否可写。

### 验证安装

```bash
oso --help                                  # 或: openspec-superpowers-opencode --help
```

依赖：`openspec` CLI v1.3+、`opencode` CLI、`git`、Superpowers 插件。
安装后 setup 脚本会自动检测这些工具是否可用。

`oso init` 会自动检查并安装 `openspec` 垫片；装不上**不会中止 init**，而是继续完成初始化，
并在结尾提示该运行哪条命令（见上面的「权限说明」）。装好后无需重跑 init。

## 初始化项目

```bash
# 新项目
mkdir my-project && cd my-project
oso init                                    # 或: openspec-superpowers-opencode init

# 或指定目录
oso init my-project                         # 或: openspec-superpowers-opencode init my-project
```

`init` 自动完成：git init → 复制模板 → 安装配置 → 验证 schema → 首次提交。

## 在 OpenCode 中工作

项目根目录下直接运行以下命令（OpenCode 会自动处理目录切换，用户无感）：

```bash
/opsx-ff <功能名>     # 创建变更 → 生成全部 artifacts（brainstorm → plan）
/opsx-apply           # 开始实现 → 子 Agent TDD 编码 → 审查 → 提交
/opsx-finish          # 收尾 → 测试 → retrospective → 归档 → 合并/PR
/opsx-verify          # 验证实现 vs 规格
/opsx-archive         # 归档变更
```

### 完整工作流示例

```bash
/opsx-ff add-user-auth          # 创建变更，自动生成 worktree + artifacts
/opsx-apply add-user-auth       # 进入 worktree 开始编码
# ... 在编辑器中写代码（AI 辅助）...
/opsx-finish add-user-auth      # 测试 → 回顾 → 合并到 main → 清理 worktree
```

### 并行处理多个变更

```bash
/opsx-ff feature-a
/opsx-ff feature-b

/opsx-apply feature-a            # 实现 feature-a
/opsx-apply feature-b            # 实现 feature-b（互不影响）

/opsx-finish feature-a
/opsx-finish feature-b
```

每个变更在独立的 git worktree（`.worktrees/<name>/` + `feature/<name>` 分支）中隔离，
main 分支始终保持干净。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `oso`（别名） | 等价于 `openspec-superpowers-opencode`，所有子命令通用 |
| `oso init [目录]` | 初始化项目 |
| `oso --version` / `-v` | 显示版本号 |
| `oso reset` | 还原到未初始化状态 |
| `oso dry-run` | 预览变更 |
| `oso ensure-worktree <name>` | 确保 worktree 已创建 |
| `oso remove-worktree <name>` | 删除 worktree 和分支 |
| `oso registry remove <name>` | 从注册表删除变更 |
| `oso registry list` | 列出所有活跃变更 |

## 更新

```bash
npm update -g @moyaspace/openspec-superpowers-opencode
oso reset                                    # 或: openspec-superpowers-opencode reset
oso init                                     # 或: openspec-superpowers-opencode init
```
