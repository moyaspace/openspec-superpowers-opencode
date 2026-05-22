# 快速开始

## 安装

### 从 npm 安装

```bash
npm install -g @moyaspace/openspec-superpowers-opencode
```

### 从本地 tgz 安装（离线/预览）

```bash
# 在项目根目录（或用绝对路径）
npm install -g ./moyaspace-openspec-superpowers-opencode-1.0.1.tgz
```

### 验证安装

```bash
openspec-superpowers-opencode --help
```

依赖：`openspec` CLI v1.3+、`opencode` CLI、`git`、Superpowers 插件。
安装后 setup 脚本会自动检测这些工具是否可用。

## 初始化项目

```bash
# 新项目
mkdir my-project && cd my-project
openspec-superpowers-opencode init

# 或指定目录
openspec-superpowers-opencode init my-project
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
| `openspec-superpowers-opencode init [目录]` | 初始化项目 |
| `openspec-superpowers-opencode reset` | 还原到未初始化状态 |
| `openspec-superpowers-opencode dry-run` | 预览变更 |
| `openspec-superpowers-opencode ensure-worktree <name>` | 确保 worktree 已创建 |

## 更新

```bash
npm update -g openspec-superpowers-opencode
openspec-superpowers-opencode reset
openspec-superpowers-opencode init
```
