# 棕地初始化设计

> OpenSpec `lib/setup/` 棕地（brownfield）流程的设计记录。

## 棕地判断

判断代码在 `lib/setup/context.js:13`。

| 条件 | 判定 |
|------|------|
| 目录不存在 | greenfield |
| 目录存在但为空 | greenfield |
| 目录存在且有任意内容 | brownfield |

当前实现比较宽泛：不检查 Git，也不要求存在 `openspec/config.yaml`。因此只有一个 `.git/`、README 或任意隐藏文件，也会被判为棕地。

如果目录已有 `.git`，初始化前还会执行 `git status --porcelain`。工作区不干净则立即终止，不进入覆盖询问。

## 棕地决策

决策逻辑在 `lib/setup/index.js:88`。

首先询问：

```
BROWN_OVERRIDE_INIT
Brownfield project. Continue with full init?
```

不是 `yes` 就取消，不写文件。

继续后依次处理：

| 范围 | 环境变量 | 当前行为 |
|------|----------|----------|
| 整个 `openspec/` | `BROWN_OVERRIDE_OPENSPEC` | `yes` 部署并覆盖；否则全部跳过 |
| `.opencode/opencode.json` | `BROWN_OVERRIDE_OCODEJSON` | 文件存在时询问；`yes` 合并，否则保留 |
| `.opencode/commands/` | `BROWN_OVERRIDE_COMMANDS` | `yes`/`no`/`ask`，`ask` 时逐个冲突文件询问 |
| `.opencode/skills/` | `BROWN_OVERRIDE_SKILLS` | 同上 |
| `AGENTS.md` 托管区块 | `BROWN_OVERRIDE_AGENTS` | 已有完整 marker 时询问是否替换 |
| `.gitignore` 托管区块 | `BROWN_OVERRIDE_GITIGNORE` | 同上 |
| `.gitattributes` 托管区块 | `BROWN_OVERRIDE_GITATTR` | 同上 |
| `.editorconfig` 托管区块 | `BROWN_OVERRIDE_EDITORCONFIG` | 同上 |

没有环境变量且没有 prompt 时，默认决策是 `no`，见 `lib/setup/prompt.js:20`。

> **注意：** 即使非空目录里根本没有 `openspec/`，它仍被判为棕地，并要求允许覆盖 OpenSpec。选择 `no` 会导致整个 `openspec/` 不部署，后续验证通常会失败。

## 文件部署规则

计划生成在 `lib/setup/planner.js:52`。

- `skills.lock.json`：棕地也会直接覆盖，没有单独询问。
- `openspec/**`：只有 `BROWN_OVERRIDE_OPENSPEC=yes` 才部署；否则包括不存在的目标文件在内全部跳过。
- `.opencode/opencode.json`：
  - 原文件不存在：直接创建。
  - 原文件存在且选择 `no`：保留。
  - 选择 `yes`：结构化合并，用户非空值优先，但强制维护必要的 `allow`/`deny` 权限。
- `.opencode/commands/**` 和 `.opencode/skills/**`：
  - 只对已经存在的同名文件应用覆盖决策。
  - 模板中新增、目标中不存在的文件会直接部署。
- 其他 `.opencode/**` 模板文件：没有独立棕地保护，存在时直接覆盖。
- `AGENTS.md`、`.gitignore`、`.gitattributes`、`.editorconfig`：
  - 文件不存在：创建。
  - 文件存在但没有 marker：自动追加托管区块，不询问。
  - 正好有一对 marker：`yes` 替换托管区块，`no` 保留。
  - marker 不完整或数量异常：抛错终止。

## 实际写入

写入逻辑在 `lib/setup/deploy.js:21`。

1. 在写入任何文件前，先校验所有目标路径。
2. 拒绝项目目录外路径。
3. 拒绝经过符号链接或 Windows junction 的路径。
4. `preserve` 操作不做任何写入。
5. `copy`/`write` 先写同目录临时文件，再用 `rename` 原子替换目标文件。

这是逐文件原子写入，不是整个部署事务。如果后面的文件发生 I/O 错误，前面已经成功写入的文件不会自动回滚。

## 部署后流程

在 `lib/setup/index.js:223`：

```
执行部署
→ 写 verification=pending 的 manifest
→ 执行 OpenSpec 完整验证
→ 更新 manifest 为 passed/failed
→ 验证成功后创建 registry
→ git init（如需要）
→ git add
→ 有变更时自动 commit
```

验证失败不会回滚已经部署的文件，也不会创建 registry 或提交 Git。

## changes/specs 保护

当前版本中，现有的 `openspec/changes/` 和 `openspec/specs/` 不会被删除或替换，因为：

- 模板中没有这两个目录下的文件。
- 部署器没有目录删除或目录替换操作。
- 棕地模式不会创建这两个目录，创建逻辑只用于绿地项目（`lib/setup/planner.js:70`）。

但原先的保护规则没有被明确保留下来。目前只是"碰巧不会修改"。如果将来模板增加了 `openspec/changes/**` 或 `openspec/specs/**` 文件，并且 `BROWN_OVERRIDE_OPENSPEC=yes`，同名文件就会被覆盖。

| 场景 | 当前状态 |
|------|----------|
| 现有 changes/specs 内容 | 当前不会修改 |
| 明确的 brownfield skip 规则 | 缺失 |
| 未来模板添加同名文件 | 存在覆盖风险 |

建议在通用 `openspec/**` 判断之前明确加：

```
brownfield + openspec/changes/** → 永远 preserve
brownfield + openspec/specs/**   → 永远 preserve
```

即使用户选择覆盖 OpenSpec 配置和 schema，也不应覆盖这两个数据目录。
