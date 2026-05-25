# openspec-superpowers-opencode 测试文档

## 设计原则

### 分层架构

```
docs/
  TESTING.md                 ← 测试计划（稳定）
  TEST_RECORDS/              ← 测试执行记录（每轮一次）
    YYYY-MM-DD.md
```

| 文件 | 内容 | 变更频率 |
|------|------|---------|
| `TESTING.md` | 测什么、怎么测、如何验证 | 低（功能变化时） |
| `TEST_RECORDS/*.md` | 执行结果、实测日志、✅/❌ 记录 | 高（每次测试） |

### 预期值从代码源提取

TESTING.md 中不硬编码以下内容：
- **commit message** — 引用 `bin/cli.js` 中 `git commit -m "..."` 的值
- **具体文件路径**（如旧版 manifest 路径）— 仅描述「应存在/不应存在」
- **git hash** — 永远不硬编码

测试时通过 grep / git 等命令从代码中提取预期值，保证文档不因代码变更而过时。

### 时效性保证

测试执行前运行以下脚本验证覆盖完整性：

```powershell
pwsh -NoProfile scripts\check-test-coverage.ps1
```

脚本功能：
- 校验所有 CLI 子命令（`init`、`reset`、`dry-run`、`ensure-worktree`）在 TESTING.md 中都有对应 Phase
- 检测 TESTING.md 中是否包含已知的过期引用（旧文件名、旧 hash 等）

exit code 0 方可开始测试。

### 执行规定

- **禁止在本项目工作目录中测试。** `init` 不带目录参数时默认使用当前目录。所有测试必须在独立临时目录执行。
- 每个 `bash` 调用是独立进程，变量不共享。建议将测试目录路径写入环境变量持久化：

```powershell
$env:OPS_TEST_DIR = "$env:TEMP\ops-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
```

- 执行 init 前确保 `<npm-package-root-path>` 已替换为包实际路径。
- Windows 上如果 `openspec` 命令不可用，通过 `npm install -g openspec` 安装。
- 如果 `git config core.autocrlf` 导致 CRLF warning，使用 `git -c core.autocrlf=false -c core.safecrlf=false` 前缀。

---

## 前置条件

| 依赖 | 最低版本 | 验证命令（Windows / Linux） |
|------|---------|---------------------------|
| Node.js | >= 16 | `node --version` |
| openspec CLI | 1.3+ | `openspec --version` |
| opencode CLI | 1.15+ | `opencode --version` |
| git | 任意 | `git --version` |
| Superpowers 插件 | 最新 | `opencode /skills` 能看到 skill 列表 |

---

## 图例

| 符号/标记 | 含义 |
|----------|------|
| 📝 | 测试步骤 |
| 🔍 | 验证步骤 |
| ✅ | 通过 |
| ❌ | 失败 |

---

## Phase 1 — init 测试

### 1.1 创建临时目录

**Windows (PowerShell):**
```powershell
$testDir = "$env:TEMP\ops-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $testDir -Force | Out-Null
$testDir
```

**Linux (bash):**
```bash
testDir=$(mktemp -d /tmp/ops-test-XXXXXX)
echo "$testDir"
```

**📝 预期结果**：输出临时目录路径。

---

### 1.2 执行 init

**Windows:**
```powershell
$pkgRoot = "<npm-package-root-path>"
node "$pkgRoot\bin\cli.js" init "$testDir"
```

**Linux:**
```bash
pkgRoot="<npm-package-root-path>"
node "$pkgRoot/bin/cli.js" init "$testDir"
```

> `<npm-package-root-path>` 替换为 `openspec-superpowers-opencode` 包的实际路径。

**📝 预期结果**：
- 输出包含 `About to commit:` + 文件清单（git diff --cached --name-status）
- 输出包含 `🎉 初始化完成`
- exit code 为 0

---

### 1.3 验证 git 提交历史

**Windows / Linux:**
```bash
cd "$testDir"
git log --oneline
```

**🔍 预期结果**：
- 一条 commit
- commit message 匹配 `bin/cli.js` 中 `git commit -m "..."` 的值

---

### 1.4 Git dirty 检查（已有 Git 仓库，有未提交文件时 init 应阻挡）

**Windows:**
```powershell
$dirtyDir = "$env:TEMP\ops-dirty-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git init "$dirtyDir"
Set-Content -Path "$dirtyDir\dirty.txt" -Value 'uncommitted' -Encoding utf8
$pkgRoot = "<npm-package-root-path>"
node "$pkgRoot\bin\cli.js" init "$dirtyDir"
```

**Linux:**
```bash
dirtyDir=$(mktemp -d /tmp/ops-dirty-XXXXXX)
git init "$dirtyDir"
echo 'uncommitted' > "$dirtyDir/dirty.txt"
pkgRoot="<npm-package-root-path>"
node "$pkgRoot/bin/cli.js" init "$dirtyDir"
```

**📝 预期结果**：
- 输出包含 `Working directory has uncommitted changes`（英文）或 `工作目录有未提交的变更`（中文）
- exit code 为 1
- 不部署任何文件（.opencode/、openspec/、AGENTS.md 等均不存在）

清理：
```bash
Remove-Item -Recurse -Force "$dirtyDir"
```

---

## Phase 2 — 项目结构验证

### 2.1 验证根文件列表

**Windows / Linux:**
```bash
cd "$testDir"
ls -la
```

**🔍 预期文件**：

| 文件/目录 | 说明 |
|-----------|------|
| `.opencode/` | 含 opencode.json、commands/、skills/ |
| `.opencode/opencode.json` | |
| `.opencode/install-manifest.json` | 安装清单 |
| `openspec/` | |
| `AGENTS.md` | |
| `.gitignore` | |
| `.gitattributes` | |
| `.editorconfig` | EditorConfig 规则 |

以下文件不应存在于根目录：
- `LICENSE`（不再部署）
- `opencode.json`（移入 `.opencode/` 内）
- `skills.lock.json`（仅包内校验）

---

### 2.2 验证 OPSX 命令

**Windows / Linux:**
```bash
ls .opencode/commands/
```

**🔍 预期结果**：12 个 opsx-* 文件：
`opsx-apply.md`, `opsx-archive.md`, `opsx-bulk-archive.md`, `opsx-continue.md`, `opsx-explore.md`, `opsx-ff.md`, `opsx-finish.md`, `opsx-new.md`, `opsx-onboard.md`, `opsx-propose.md`, `opsx-sync.md`, `opsx-verify.md`

---

### 2.3 验证 Skill 文件

**Windows / Linux:**
```bash
ls .opencode/skills/
```

**🔍 预期结果**：11 个 openspec-* 目录，每个包含非空 `SKILD.md`。

**Windows:**
```powershell
Get-ChildItem -Recurse .opencode/skills/*/SKILL.md | ForEach-Object {
    $len = (Get-Content $_.FullName -Raw).Length
    if ($len -lt 100) { Write-Warning "$($_.Name): EMPTY ($len chars)" }
    else { Write-Host "$($_.Name): $len chars" }
}
```

**Linux:**
```bash
for f in .opencode/skills/*/SKILL.md; do
    len=$(wc -c < "$f")
    if [ "$len" -lt 100 ]; then echo "WARNING: $f EMPTY ($len chars)"; else echo "$f: $len chars"; fi
done
```

---

### 2.4 验证 schema 模板

**Windows / Linux:**
```bash
ls openspec/schemas/superpowers-bridge-opencode/
ls openspec/schemas/superpowers-bridge-opencode/templates/
```

**🔍 预期结果**：
- `schema.yaml` 存在
- `templates/` 包含 9 个模板文件：`brainstorm.md`, `design.md`, `plan.md`, `proposal.md`, `retrospective.md`, `spec.md`, `tasks.md`, `verify.md` + `adopters/CLAUDE.md.fragment.md`

---

### 2.5 验证 opencode.json 权限格式与入审规则

**Windows / Linux:**
```bash
cat .opencode/opencode.json
```

**🔍 预期结果**：

1. **格式**：
   - 简单权限（`read`/`glob`/`grep`/`webfetch`/`question`/`skill`/`task`）值为 `"allow"` 字符串
   - 带路径控制的权限（`edit`）使用对象格式 `{".worktrees/**": "allow", ...}`
   - `bash` 同理使用对象格式 `{"*": "allow", ...}`

2. **入审规则（Deny-by-Default）**：
   - `edit` 中不存在 `"openspec/**": "allow"`（不允许整个 openspec/）
   - `edit` 中存在 `"openspec/schemas/**": "deny"`（基础设施，禁止 AI 修改）
   - `edit` 中存在 `"openspec/config.yaml": "deny"`（基础设施，禁止 AI 修改）
   - `edit` 中存在 `"openspec/changes/**": "allow"`（用户内容，允许 AI 修改）
   - `edit` 中存在 `"openspec/specs/**": "allow"`（用户内容，允许 AI 修改）

**Windows:**
```powershell
$ocJson = Get-Content .opencode/opencode.json -Raw | ConvertFrom-Json
$edit = $ocJson.permission.edit

# 验证基础设施 deny
if ($edit.'openspec/schemas/**' -eq 'deny') { Write-Host '✅ schemas/** deny' } else { Write-Host '❌ schemas/** not deny' }
if ($edit.'openspec/config.yaml' -eq 'deny') { Write-Host '✅ config.yaml deny' } else { Write-Host '❌ config.yaml not deny' }

# 验证不存在 blanket allow
if ($edit.'openspec/**') { Write-Host '❌ openspec/** allow still exists' } else { Write-Host '✅ openspec/** blanket removed' }
```

**Linux:**
```bash
# 验证基础设施 deny
grep -q '"openspec/schemas/\*\*": "deny"' .opencode/opencode.json && echo "✅ schemas deny" || echo "❌ schemas not deny"
grep -q '"openspec/config.yaml": "deny"' .opencode/opencode.json && echo "✅ config.yaml deny" || echo "❌ config.yaml not deny"

# 验证不存在 blanket allow
grep -q '"openspec/\*\*": "allow"' .opencode/opencode.json && echo "❌ openspec/** still exists" || echo "✅ openspec/** blanket removed"
```

---

### 2.6 验证 Superpowers 路径替换

**Windows / Linux:**
```bash
grep -n "SUPERPOWERS_BASE_PATH" AGENTS.md
grep -n "SUPERPOWERS_BASE_PATH" openspec/schemas/superpowers-bridge-opencode/schema.yaml
```

**🔍 预期结果**：两条命令均无输出（`{{SUPERPOWERS_BASE_PATH}}` 已被替换为实际路径）。

验证实际路径已注入：

**Windows:**
```powershell
Select-String -Path AGENTS.md -Pattern "superpowers" -SimpleMatch
```

**Linux:**
```bash
grep "superpowers" AGENTS.md | head -3
```

**🔍 预期结果**：AGENTS.md 包含类似 `C:\Users\<用户名>\.cache\opencode\...`（Windows）或 `/root/.cache/opencode/...`（Linux）的实际路径。

---

### 2.7 验证安装清单

**Windows / Linux:**
```bash
cat .opencode/install-manifest.json
```

**🔍 预期结果**：
- `files` 数组长度 ≥ 25
- `language` 为 `"en"`（默认，`--lang` 指定其他语言时对应变化）
- `installedAt` 不为空
- `overwriteDecisions` 根据需要存在或不存在

---

### 2.8 验证 git 工作树干净

**Windows / Linux:**
```bash
cd "$testDir" && git status --short
```

**🔍 预期结果**：无输出（工作树干净）。

---

### 2.9 验证 .gitignore 粒度

> 验证部署后基础设施文件被 gitignore，但用户内容目录可被 git 追踪。

**Windows / Linux:**
```bash
cd "$testDir"
```

**🔍 验证基础设施已被排除：**
```bash
# openspec/schemas/ 应在 .gitignore 中
grep -q "openspec/schemas/" .gitignore && echo "✅ schemas/ gitignored" || echo "❌ schemas/ not gitignored"

# openspec/config.yaml 应在 .gitignore 中
grep -q "openspec/config.yaml" .gitignore && echo "✅ config.yaml gitignored" || echo "❌ config.yaml not gitignored"
```

**🔍 验证用户内容未被排除：**
```bash
# openspec/changes/ 不应在 .gitignore 中
grep -q "openspec/changes/" .gitignore && echo "❌ changes/ should NOT be gitignored" || echo "✅ changes/ NOT gitignored"

# openspec/specs/ 不应在 .gitignore 中
grep -q "openspec/specs/" .gitignore && echo "❌ specs/ should NOT be gitignored" || echo "✅ specs/ NOT gitignored"
```

**🔍 验证用户可在 changes/ 中提交文件：**
```bash
mkdir -p openspec/changes/my-feature
echo "test" > openspec/changes/my-feature/user-note.md
git add openspec/changes/my-feature/user-note.md
git status --short
```

**🔍 预期结果**：
- 文件 `openspec/changes/my-feature/user-note.md` 被成功 staging（`A  ...` 或 `?? ...` 转为 `A  ...`）
- 基础设施文件（schemas/、config.yaml）不会被意外 git add

**清理：**
```bash
git reset HEAD openspec/changes/my-feature/user-note.md
rm -rf openspec/changes/my-feature
```

---

## Phase 3 — openspec CLI 集成测试

### 3.1 Schema 验证

**Windows / Linux:**
```bash
cd "$testDir"
openspec schema validate superpowers-bridge-opencode
```

**📝 预期结果**：
```
Note: Schema commands are experimental and may change.
✓ Schema 'superpowers-bridge-opencode' is valid
```

---

### 3.2 列出可用 Schema

**Windows / Linux:**
```bash
openspec schemas
```

**🔍 预期结果**：列表包含 `superpowers-bridge-opencode (project)`。

---

### 3.3 初始变更列表（空）

**Windows / Linux:**
```bash
openspec list --json
```

**🔍 预期结果**：`{"changes":[]}`

---

### 3.4 创建变更

**Windows / Linux:**
```bash
openspec new change "test-change"
```

**📝 预期结果**：
```
✔ Created change 'test-change' at openspec/changes/test-change/ (schema: superpowers-bridge-opencode)
```

---

### 3.5 验证 Artifact 依赖链

**Windows / Linux:**
```bash
openspec status --change "test-change" --json
```

**🔍 预期结果**：8 个 artifact 按以下依赖链排列：
```
brainstorm (ready)
  ├── design (blocked, depends: brainstorm)
  └── proposal (blocked, depends: brainstorm)
        └── specs (blocked, depends: proposal)
              └── tasks (blocked, depends: specs)
                    └── plan (blocked, depends: tasks)
                          └── verify (blocked, depends: plan)
                                └── retrospective (blocked, depends: verify)
```

`applyRequires` 应为 `["plan"]`。

---

### 3.6 Artifact 指令生成

**Windows / Linux:**
```bash
openspec instructions brainstorm --change "test-change"
```

**🔍 预期结果**：输出包含以下字段：
- `<artifact id="brainstorm">`
- PRECHECK 指令（Read Superpowers skill 文件）
- `<instruction>` 块
- `<template>` 块
- `<unlocks>` 块

---

### 3.7 Apply 指令（应返回 blocked）

**Windows / Linux:**
```bash
openspec instructions apply --change "test-change" --json
```

**🔍 预期结果**：
```json
{
  "state": "blocked",
  "missingArtifacts": ["plan"]
}
```

---

### 3.8 归档变更

**Windows / Linux:**
```bash
openspec archive test-change -y
```

**📝 预期结果**：
```
Task status: No tasks
Change 'test-change' archived as 'YYYY-MM-DD-test-change'.
```

---

### 3.9 验证归档目录

**Windows / Linux:**
```bash
ls openspec/changes/archive/
ls openspec/changes/
```

**🔍 预期结果**：
- `openspec/changes/archive/YYYY-MM-DD-test-change/` 存在且包含 `.openspec.yaml`
- `openspec/changes/` 下只有 `archive/` 目录

---

## Phase 4 — Git Worktree 模拟 opsx-ff

### 4.1 创建 Worktree

**Windows / Linux:**
```bash
cd "$testDir"
git worktree add .worktrees/test-feature -b feature/test-feature
```

**📝 预期结果**：
```
Preparing worktree (new branch 'feature/test-feature')
```
HEAD 指向主分支的 commit。

---

### 4.2 验证当前分支

**Windows / Linux:**
```bash
cd "$testDir/.worktrees/test-feature"
git branch --show-current
```

**🔍 预期结果**：`feature/test-feature`

---

### 4.3 在 Worktree 内创建变更

**Windows / Linux:**
```bash
openspec new change "test-feature"
openspec status --change "test-feature"
```

**📝 预期结果**：变更创建成功，进度 0/8。

---

### 4.4 模拟生成 Artifact

**Windows / Linux:**
```bash
cat > openspec/changes/test-feature/brainstorm.md << 'EOF'
## Design Summary

Test feature for workflow validation.

## Agreed Approach

One-shot init with language selection.

## Key Decisions

- Use --lang flag
- Default to English

## Open Questions

None.
EOF
```

**📝 预期结果**：文件写入成功。

验证 openspec 自动检测：

```bash
openspec status --change "test-feature"
```

**🔍 预期结果**：`[x] brainstorm` 标记为完成，进度 1/8。

---

### 4.5 在 Worktree 内提交

**Windows / Linux:**
```bash
git add -A
git commit -m "change: test-feature (brainstorm)"
```

**📝 预期结果**：提交成功，包含 `.openspec.yaml` 和 `brainstorm.md`。

---

### 4.6 返回 Main 并验证隔离

**Windows / Linux:**
```bash
cd "$testDir"
git log --oneline main
```

**🔍 预期结果**：main 分支只有原始 commit，不含 `change: test-feature` 提交。

---

### 4.7 合并回 Main

**Windows / Linux:**
```bash
git merge feature/test-feature --ff-only
```

**📝 预期结果**：Fast-forward 合并成功。

```bash
git log --oneline
```

**🔍 预期结果**：main 现在包含 `change: test-feature (brainstorm)`。

---

### 4.8 清理 Worktree 和分支

**Windows / Linux:**
```bash
git worktree remove .worktrees/test-feature
git branch -d feature/test-feature
git worktree list
```

**🔍 预期结果**：worktree 列表只显示主仓库，无 test-feature 分支。

---

### 4.9 并行 Worktree — 两个变更同时处理

**Windows / Linux:**
```bash
cd "$testDir"
```

**📝 创建两个 worktree（模拟同时 `/opsx-ff` 两个变更）：**

```bash
git worktree add .worktrees/feature-a -b feature/feature-a
git worktree add .worktrees/feature-b -b feature/feature-b
```

**🔍 预期结果**：两个 worktree 都创建成功。

---

**📝 分别在各自的 worktree 中创建变更并生成 artifact：**

```bash
# Worktree A
cd .worktrees/feature-a
openspec new change "feature-a"
cat > openspec/changes/feature-a/brainstorm.md << 'EOF'
## Design Summary
Feature A — first parallel change.

## Agreed Approach
Simplicity first.

## Key Decisions
- Isolated in worktree A

## Open Questions
None.
EOF
git add -A && git commit -m "change: feature-a (brainstorm)"

# Worktree B
cd "$testDir/.worktrees/feature-b"
openspec new change "feature-b"
cat > openspec/changes/feature-b/brainstorm.md << 'EOF'
## Design Summary
Feature B — second parallel change, independent from A.

## Agreed Approach
Keep it independent.

## Key Decisions
- Isolated in worktree B

## Open Questions
None.
EOF
git add -A && git commit -m "change: feature-b (brainstorm)"
```

**🔍 预期结果**：
- 两个 worktree 各自有独立的 `openspec/changes/` 目录
- 各自的 commit 只包含自己变更的文件
- 分支之间互不交叉

---

**🔍 验证 main 分支仍然干净：**

```bash
cd "$testDir"
git log --oneline main
```

**🔍 预期结果**：main 只有原始 commit，不含 feature-a/feature-b 提交。

---

**🔍 验证两个 feature 分支互不干扰：**

```bash
git log --oneline feature/feature-a
echo "---"
git log --oneline feature/feature-b
```

**🔍 预期结果**：
- `feature/feature-a` 包含 `change: feature-a (brainstorm)`
- `feature/feature-b` 包含 `change: feature-b (brainstorm)`
- 两个分支的 commit 不同（hash 不同）

---

**📝 分别合并到 main（模拟 `/opsx-finish` 顺序处理）：**

```bash
# feature-a 可以直接 ff
git merge feature/feature-a --ff-only

# feature-b 的 base 落后于 feature-a 合并后的 main，直接 merge 即可（ort 策略自动处理）
git merge feature/feature-b
git log --oneline
```

**🔍 预期结果**：第一次 ff 成功。第二次直接 merge（git 自动使用 ort 策略创建 merge commit）。不需要手动 rebase。最终 main 包含原始 + feature-a + feature-b 的提交。

---

**📝 清理两个 worktree 和分支：**

```bash
git worktree remove .worktrees/feature-a
git worktree remove .worktrees/feature-b
git branch -d feature/feature-a
git branch -d feature/feature-b
git worktree list
```

**🔍 预期结果**：worktree 列表只显示主仓库，无残留。

---

## Phase 5 — 棕地维度 1（openspec/）门控测试

### 5.1 创建带预置 openspec/ 的测试目录

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $brownDir -Force | Out-Null
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
Write-Host "BrownDir: $brownDir"
```

**Linux:**
```bash
brownDir=$(mktemp -d /tmp/ops-brown-XXXXXX)
mkdir -p "$brownDir/openspec"
echo 'schema: spec-driven' > "$brownDir/openspec/config.yaml"
echo "$brownDir"
```

**📝 预期结果**：目录和预置文件创建成功。

---

### 5.2 门控测试 A — openspec/ 无预置（Greenfield）

**Windows:**
```powershell
$greenDir = "$env:TEMP\ops-green-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $greenDir -Force | Out-Null
$pkgRoot = "<npm-package-root-path>"
node "$pkgRoot\bin\cli.js" init "$greenDir"
```

**Linux:**
```bash
greenDir=$(mktemp -d /tmp/ops-green-XXXXXX)
node "$pkgRoot/bin/cli.js" init "$greenDir"
```

**🔍 预期结果**：
- 正常部署：config.yaml + schemas/* 被创建
- `openspec/config.yaml` 存在且 schema = `superpowers-bridge-opencode`
- `openspec/schemas/superpowers-bridge-opencode/schema.yaml` 存在
- 无询问提示

清理：
```bash
Remove-Item -Recurse -Force "$greenDir"
```

---

### 5.3 门控测试 B — openspec/ 已存在，用户选择 YES

**Windows:**
```powershell
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
node "$pkgRoot\bin\cli.js" init "$brownDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**Linux:**
```bash
BROWN_OVERRIDE_OPENSPEC=yes node "$pkgRoot/bin/cli.js" init "$brownDir"
```

**📝 预期结果**：
- 自动应答 YES（不阻塞）
- config.yaml 被覆盖为模板版本（`schema: superpowers-bridge-opencode`）
- schemas/* 被部署
- 后续部署正常进行（.opencode/、AGENTS.md 等）

---

### 5.3b 验证 config.yaml + schemas 被覆盖

```bash
grep "schema:" "$brownDir/openspec/config.yaml"
ls "$brownDir/openspec/schemas/superpowers-bridge-opencode/schema.yaml"
```

**🔍 预期结果**：
- `config.yaml` → `schema: superpowers-bridge-opencode`（已覆盖）
- `schemas/superpowers-bridge-opencode/schema.yaml` → 存在

---

### 5.4 门控测试 C — openspec/ 已存在，用户选择 NO

**Windows:**
```powershell
$brownNoDir = "$env:TEMP\ops-brown-no-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $brownNoDir -Force | Out-Null
New-Item -ItemType Directory -Path "$brownNoDir\openspec" -Force | Out-Null
Set-Content -Path "$brownNoDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "no"
node "$pkgRoot\bin\cli.js" init "$brownNoDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**Linux:**
```bash
brownNoDir=$(mktemp -d /tmp/ops-brown-no-XXXXXX)
mkdir -p "$brownNoDir/openspec"
echo 'schema: spec-driven' > "$brownNoDir/openspec/config.yaml"
BROWN_OVERRIDE_OPENSPEC=no node "$pkgRoot/bin/cli.js" init "$brownNoDir"
```

**📝 预期结果**：
- 自动应答 NO（不阻塞）
- **退出**，不部署任何其他文件
- `.opencode/`、`AGENTS.md` 等文件不存在

清理：
```bash
Remove-Item -Recurse -Force "$brownNoDir"
```

---

## Phase 6 — 棕地维度 2（.opencode/）合并测试

### 6.1 创建带预置 .opencode/ 的测试目录

**Windows:**
```powershell
$mergeDir = "$env:TEMP\ops-merge-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $mergeDir -Force | Out-Null
New-Item -ItemType Directory -Path "$mergeDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$mergeDir\.opencode" -Force | Out-Null

$userOcJson = @'
{
  "permission": {
    "read": "allow",
    "write": { "src/**": "allow", "*": "ask" },
    "edit": { "src/**": "allow", "*": "ask" },
    "bash": { "*": "ask" }
  }
}
'@
Set-Content -Path "$mergeDir\.opencode\opencode.json" -Value $userOcJson -Encoding utf8
New-Item -ItemType Directory -Path "$mergeDir\.opencode\commands" -Force | Out-Null
Set-Content -Path "$mergeDir\.opencode\commands\opsx-ff.md" -Value '# user version' -Encoding utf8
New-Item -ItemType Directory -Path "$mergeDir\.opencode\skills\openspec-apply-change" -Force | Out-Null
Set-Content -Path "$mergeDir\.opencode\skills\openspec-apply-change\SKILL.md" -Value '# user skill' -Encoding utf8
Set-Content -Path "$mergeDir\AGENTS.md" -Value '# User AGENTS.md' -Encoding utf8
Write-Host "MergeDir: $mergeDir"
```

**Linux:**
```bash
mergeDir=$(mktemp -d /tmp/ops-merge-XXXXXX)
mkdir -p "$mergeDir/openspec" "$mergeDir/.opencode/commands" "$mergeDir/.opencode/skills/openspec-apply-change"
cat > "$mergeDir/.opencode/opencode.json" << 'EOF'
{
  "permission": {
    "read": "allow",
    "write": { "src/**": "allow", "*": "ask" },
    "edit": { "src/**": "allow", "*": "ask" },
    "bash": { "*": "ask" }
  }
}
EOF
echo '# user version' > "$mergeDir/.opencode/commands/opsx-ff.md"
echo '# user skill' > "$mergeDir/.opencode/skills/openspec-apply-change/SKILL.md"
echo '# User AGENTS.md' > "$mergeDir/AGENTS.md"
echo "$mergeDir"
```

**📝 预期结果**：目录和预置文件创建成功。

---

### 6.2 执行 init（自动应答 openspec=YES, commands=YES, skills=NO）

**Windows:**
```powershell
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "yes"
$env:BROWN_OVERRIDE_SKILLS = "no"
node "$pkgRoot\bin\cli.js" init "$mergeDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_COMMANDS, BROWN_OVERRIDE_SKILLS -ErrorAction SilentlyContinue
```

**Linux:**
```bash
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_COMMANDS=yes BROWN_OVERRIDE_SKILLS=no \
  node "$pkgRoot/bin/cli.js" init "$mergeDir"
```

**📝 预期结果**：
- openspec/ 门控通过
- commands/ 全部覆盖
- skills/ 全部跳过

---

### 6.3 验证 opencode.json 合并结果

```bash
cat "$mergeDir/.opencode/opencode.json"
```

**🔍 预期结果**：
- `write` 包含：`src/**`: `allow`（用户原有）+ `.worktrees/**`、`openspec/changes/**`、`openspec/specs/**`、`.opencode/**`（required 强制 allow）+ `openspec/schemas/**` 和 `openspec/config.yaml`（ADR-9 deny 规则强制注入）+ `*`: `ask`（用户原有）
- `edit` 同理，且 `openspec/schemas/**` 和 `openspec/config.yaml` 为 `deny`（模板 deny 规则经由 ADR-9 强制注入）
- `bash` 包含：`*`: `ask`（用户原有）+ `git *`、`npm test*` 等（模板补入）
- `read` = `allow`

---

### 6.4 验证 commands/ 覆盖结果

```bash
cat "$mergeDir/.opencode/commands/opsx-ff.md"
```

**🔍 预期结果**：内容为模板版本（已被覆盖），不以 `# user version` 开头。

---

### 6.5 验证 skills/ 跳过结果

```bash
cat "$mergeDir/.opencode/skills/openspec-apply-change/SKILL.md"
```

**🔍 预期结果**：内容保持 `# user skill`（未被覆盖）。

---

### 6.6 验证 overwriteDecisions 记录

```bash
cat "$mergeDir/.opencode/install-manifest.json" | grep -A10 "overwriteDecisions"
```

**🔍 预期结果**：
```json
"overwriteDecisions": {
  ".opencode/commands/opsx-ff.md": "overwrite",
  ".opencode/skills/openspec-apply-change/SKILL.md": "skip"
}
```

---

### 6.7 验证幂等性 — 再次执行 init 不再询问

**Windows:**
```powershell
node "$pkgRoot\bin\cli.js" init "$mergeDir"
```

**Linux:**
```bash
node "$pkgRoot/bin/cli.js" init "$mergeDir"
```

**📝 预期结果**：无询问提示，按已有 overwriteDecisions 执行。

---

### 6.8 验证 AGENTS.md 追加

```bash
grep "Superpowers Skill 载入规则" "$mergeDir/AGENTS.md"
```

**🔍 预期结果**：存在（bridge 内容已追加到用户原有内容后）。

---

### 6.9 验证 manifest 不含 AGENTS.md

```bash
cat "$mergeDir/.opencode/install-manifest.json" | grep "AGENTS.md" || echo "✅ AGENTS.md 不在 manifest 中"
```

**🔍 预期结果**：AGENTS.md 不在 manifest files 数组中。

---

## Phase 7 — Reset 测试

### 7.1 执行 reset

**Windows:**
```powershell
node "$pkgRoot\bin\cli.js" reset "$mergeDir"
```

**Linux:**
```bash
node "$pkgRoot/bin/cli.js" reset "$mergeDir"
```

**📝 预期结果**：
- 清理 openspec/ 部署的文件（config.yaml + schemas/）
- 清理 commands/ 中 decision=overwrite 的文件
- 不碰 skills/ 中 decision=skip 的文件
- 不碰 AGENTS.md
- 不碰 opencode.json
- 不碰 .gitignore、.gitattributes
- 删除 install-manifest.json 自身
- 输出提示：`AGENTS.md 和 opencode.json 未重置，请自行处理`

---

### 7.2 验证 reset 后文件状态

```bash
# 以下应存在（未碰）
test -f "$mergeDir/.opencode/opencode.json" && echo "✅ opencode.json 保留"
test -f "$mergeDir/AGENTS.md" && echo "✅ AGENTS.md 保留"

# 以下应不存在（被清理）
test -d "$mergeDir/openspec/schemas" && echo "❌ schemas/ 应被删除" || echo "✅ schemas/ 已清理"
test -f "$mergeDir/.opencode/install-manifest.json" && echo "❌ manifest 应被删除" || echo "✅ manifest 已清理"
```

**🔍 预期结果**：
- `opencode.json` → ✅ 保留
- `AGENTS.md` → ✅ 保留
- `openspec/schemas/` → ✅ 已清理
- `install-manifest.json` → ✅ 已清理
- decision=overwrite 的文件已清理
- decision=skip 的文件保留

---

## Phase 8 — 棕地维度 3/4（git + 已部署内容）验证

### 8.1 .gitignore 规则验证

```bash
cd "$mergeDir"
```

**🔍 验证基础设施排除规则完整：**
```bash
grep -q "\.worktrees/" .gitignore && echo "✅ .worktrees/" || echo "❌ .worktrees/ missing"
grep -q "openspec/schemas/" .gitignore && echo "✅ openspec/schemas/" || echo "❌ openspec/schemas/ missing"
grep -q "openspec/config.yaml" .gitignore && echo "✅ openspec/config.yaml" || echo "❌ openspec/config.yaml missing"
```

**🔍 验证未误伤用户内容目录：**
```bash
grep -q "^openspec/$" .gitignore && echo "❌ openspec/ (whole dir) still in gitignore" || echo "✅ openspec/ whole dir NOT gitignored"
```

---

### 8.2 棕地 .gitignore 追加验证

**Windows:**
```powershell
$gitDir = "$env:TEMP\ops-git-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $gitDir -Force | Out-Null
New-Item -ItemType Directory -Path "$gitDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$gitDir\.opencode" -Force | Out-Null
Set-Content -Path "$gitDir\.gitignore" -Value "node_modules/`n.env" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "y"
$env:BROWN_OVERRIDE_SKILLS = "y"
node "$pkgRoot\bin\cli.js" init "$gitDir"
Remove-Item Env:\* -ErrorAction SilentlyContinue
```

**Linux:**
```bash
gitDir=$(mktemp -d /tmp/ops-git-XXXXXX)
mkdir -p "$gitDir/openspec" "$gitDir/.opencode"
echo -e "node_modules/\n.env" > "$gitDir/.gitignore"
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_COMMANDS=y BROWN_OVERRIDE_SKILLS=y \
  node "$pkgRoot/bin/cli.js" init "$gitDir"
```

**🔍 预期结果**：
- `.gitignore` 包含原始内容 + 追加的 `.worktrees/` 规则
- `.gitattributes` 存在

清理：
```bash
Remove-Item -Recurse -Force "$gitDir"
```

---

## Phase 9 — Skill / 命令定义验证

### 9.1 Skill 文件非空检查

**Windows:**
```powershell
Get-ChildItem -Recurse .opencode/skills/*/SKILL.md | ForEach-Object {
    $len = (Get-Content $_.FullName -Raw).Length;
    if ($len -lt 100) { "❌ $($_.Name): $len chars" } else { "✅ $($_.Name): $len chars" }
}
```

**Linux:**
```bash
for f in .opencode/skills/*/SKILL.md; do
    len=$(wc -c < "$f");
    if [ "$len" -lt 100 ]; then echo "❌ $f: $len chars"; else echo "✅ $f: $len chars"; fi
done
```

**🔍 预期结果**：11 个 SKILL.md 全部 ✅，每文件 > 100 字符。

---

### 9.2 命令文件存在性

**Windows / Linux:**
```bash
ls .opencode/commands/ | wc -l
```

**🔍 预期结果**：12

---

## Phase 10 — 清理

### 10.1 删除测试目录

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:TEMP\ops-*"
```

**Linux:**
```bash
rm -rf /tmp/ops-*
```

### 10.2 确认删除

**Windows:**
```powershell
Get-ChildItem "$env:TEMP\ops-*" -ErrorAction SilentlyContinue | ForEach-Object { "❌ 残留: $($_.FullName)" }
if (-not (Get-ChildItem "$env:TEMP\ops-*" -ErrorAction SilentlyContinue)) { "✅ 已清空" }
```

**Linux:**
```bash
ls -d /tmp/ops-* 2>/dev/null && echo "❌ 仍有残留" || echo "✅ 已清空"
```

**🔍 预期结果**：目录已不存在。

---

## Phase 11 — 多语言 (--lang) 测试

### 11.1 --help 默认英文

**Windows / Linux:**
```bash
cd "$testDir"
node <npm-package-root-path>/bin/cli.js --help
```

**🔍 预期结果**：输出英文，包含 `Usage:`、`Init project`、`Ensure worktree exists` 等。

---

### 11.2 --help --lang zh-CN

```bash
node <npm-package-root-path>/bin/cli.js --lang zh-CN --help
```

**🔍 预期结果**：输出中文，包含 `用法:`、`初始化项目`、`确保 worktree 已创建` 等。

---

### 11.3 --help --lang en

```bash
node <npm-package-root-path>/bin/cli.js --lang en --help
```

**🔍 预期结果**：同 11.1，输出英文。

---

### 11.4 --help --lang zh-TW

```bash
node <npm-package-root-path>/bin/cli.js --lang zh-TW --help
```

**🔍 预期结果**：同 11.2，输出中文。

---

### 11.5 init --lang zh-CN 输出中文

```bash
$testDirZh = "$env:TEMP\ops-i18n-zh-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
node <npm-package-root-path>/bin/cli.js init "$testDirZh" --lang zh-CN
```

**Linux:**
```bash
testDirZh=$(mktemp -d /tmp/ops-i18n-zh-XXXXXX)
node <npm-package-root-path>/bin/cli.js init "$testDirZh" --lang zh-CN
```

**📝 预期结果**：
- 输出包含 `Git 初始化`、`安装配置`、`提交`、`初始化完成` 等中文
- exit code 为 0

---

### 11.6 init --lang en 输出英文

```bash
node <npm-package-root-path>/bin/cli.js init "$testDirZh" --lang en
```

**📝 预期结果**：
- 跳过已初始化提示为 `Project already initialized, skipping`
- exit code 为 0

清理：
```bash
# Windows
Remove-Item -Recurse -Force "$env:TEMP\ops-i18n-zh-*"
# Linux
rm -rf /tmp/ops-i18n-zh-*
```

---

### 11.7 未知子命令错误信息

```bash
node <npm-package-root-path>/bin/cli.js blah
```

**🔍 预期结果**：
```
Unknown subcommand: blah
Available commands: init, reset, dry-run, ensure-worktree
```

---

### 11.8 未知子命令 --lang zh-CN

```bash
node <npm-package-root-path>/bin/cli.js --lang zh-CN blah
```

**🔍 预期结果**：
```
未知子命令: blah
可用命令: init, reset, dry-run, ensure-worktree
```

---

### 11.9 ensure-worktree 无参数错误

```bash
node <npm-package-root-path>/bin/cli.js ensure-worktree
```

**🔍 预期结果**：
```
Usage: openspec-superpowers-opencode ensure-worktree <name>
```

---

### 11.10 ensure-worktree 无参数 --lang zh-CN

```bash
node <npm-package-root-path>/bin/cli.js --lang zh-CN ensure-worktree
```

**🔍 预期结果**：
```
用法: openspec-superpowers-opencode ensure-worktree <name>
```

---

### 11.11 create-project.js --help 默认英文

```bash
node <npm-package-root-path>/bin/create-project.js --help
```

**🔍 预期结果**：输出英文帮助文本（Usage: / Equivalent to: / Example:）。

---

### 11.12 create-project.js --help --lang zh-CN

```bash
node <npm-package-root-path>/bin/create-project.js --help --lang zh-CN
```

**🔍 预期结果**：输出中文帮助文本（用法: / 等同于: / 示例:）。

---

### 11.13 setup.ps1 -Help 语法验证

```powershell
pwsh -NoProfile -Command "& { . 'C:\path\to\scripts\setup.ps1' -DryRun; Write-Host '✅ setup.ps1 loaded OK' -ForegroundColor Green }"
```

**🔍 预期结果**：无语法错误，`t()` 函数正确初始化，DryRun 模式正常。

---

### 11.14 setup.sh --help 语法验证（Linux）

```bash
bash /path/to/scripts/setup.sh --help
```

**🔍 预期结果**：显示用法信息。`t()` 函数在脚本中正确定义。

---

## Phase 12 — BROWN_OVERRIDE_* 环境变量测试

> 本 Phase 所有测试都需要先在带有预置内容的棕地目录执行，以验证环境变量能正确跳过交互提示。

### 12.1 BROWN_OVERRIDE_OPENSPEC=no（非交互拒绝）

**Windows:**
```powershell
$env:BROWN_OVERRIDE_OPENSPEC = "no"
& "<npm-package-root-path>\bin\cli.js" init "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
```
**Linux:**
```bash
BROWN_OVERRIDE_OPENSPEC=no openspec-superpowers-opencode init /tmp/ops-brown-env-$$
```

**🔍 预期结果**：
- 脚本输出 "User chose not to overwrite openspec/. Exiting." 或中文对应提示
- exit code 0（用户选择跳过，不是错误）
- `.opencode/` 和 `AGENTS.md` 等后续内容不会被部署

---

### 12.2 BROWN_OVERRIDE_OPENSPEC=yes（非交互接受）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
```
**Linux:**
```bash
mkdir -p /tmp/ops-brown-env-$$/openspec
echo 'schema: spec-driven' > /tmp/ops-brown-env-$$/openspec/config.yaml
BROWN_OVERRIDE_OPENSPEC=yes openspec-superpowers-opencode init /tmp/ops-brown-env-$$
```

**🔍 预期结果**：
- 脚本不阻塞询问，自动继续
- `openspec/config.yaml` 被覆盖为新模板内容
- 脚本继续部署 `.opencode/`

---

### 12.3 BROWN_OVERRIDE_COMMANDS=yes（非交互全部覆盖）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
New-Item -ItemType Directory -Path "$brownDir\.opencode\commands" -Force | Out-Null
Set-Content -Path "$brownDir\.opencode\commands\test-cmd.md" -Value '# user command' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "yes"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
Get-Content "$brownDir\.opencode\commands\opsx-apply.md"
```

**🔍 预期结果**：
- 三个 env var 均不需交互
- `opsx-apply.md` 被覆盖为模板内容（不是 `# user command`）

---

### 12.4 BROWN_OVERRIDE_COMMANDS=no（非交互跳过已有）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
New-Item -ItemType Directory -Path "$brownDir\.opencode\commands" -Force | Out-Null
Set-Content -Path "$brownDir\.opencode\commands\opsx-apply.md" -Value '# user kept' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "no"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
$content = Get-Content "$brownDir\.opencode\commands\opsx-apply.md" -Raw
Write-Host "opsx-apply.md content: $content"
```

**🔍 预期结果**：
- `opsx-apply.md` 的内容保持为 `# user kept`（未被覆盖）
- 其他不存在的模板命令文件被正常复制

---

### 12.5 BROWN_OVERRIDE_SKILLS=yes（非交互全部覆盖）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
New-Item -ItemType Directory -Path "$brownDir\.opencode\commands" -Force | Out-Null
New-Item -ItemType Directory -Path "$brownDir\.opencode\skills\old-skill" -Force | Out-Null
Set-Content -Path "$brownDir\.opencode\skills\old-skill\SKILL.md" -Value '# old' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "yes"
$env:BROWN_OVERRIDE_SKILLS = "yes"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
```

**🔍 预期结果**：
- 全程无需任何交互输入
- openspec/commands/skills 全部覆盖为新模板内容
- 脚本成功完成安装

---

### 12.6 BROWN_OVERRIDE_SKILLS=no（非交互跳过已有）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
New-Item -ItemType Directory -Path "$brownDir\.opencode" -Force | Out-Null
New-Item -ItemType Directory -Path "$brownDir\.opencode\skills\old-custom" -Force | Out-Null
Set-Content -Path "$brownDir\.opencode\skills\old-custom\SKILL.md" -Value '# old custom skill' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "yes"
$env:BROWN_OVERRIDE_SKILLS = "no"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
$content = Get-Content "$brownDir\.opencode\skills\old-custom\SKILL.md" -Raw
Write-Host "old-custom SKILL.md: $content"
```

**🔍 预期结果**：
- `old-custom/SKILL.md` 保持为 `# old custom skill`（未被覆盖）
- 清单中 `old-custom/SKILL.md` 的 decision 为 `skip`

---

### 12.7 非法环境变量值回退到交互

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
New-Item -ItemType Directory -Path "$brownDir\.opencode\commands" -Force | Out-Null
Set-Content -Path "$brownDir\.opencode\commands\opsx-apply.md" -Value '# kept' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "invalid"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
```

**🔍 预期结果**：
- openspec/ 门控通过（env var yes 生效）
- 脚本在 commands 询问处等待用户输入 —— 不会因无效值崩溃
- 输入 `no` 后，已有命令文件被跳过

---

### 12.8 空环境变量（未设置）= 正常交互

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
# 不设置任何 BROWN_OVERRIDE_*
& "<npm-package-root-path>\bin\cli.js" init $brownDir
```

**🔍 预期结果**：
- 正常提示 openspec/ 覆盖（`y/N`）
- 选择后继续进入 commands 和 skills 交互

---

### 12.9 组合：openspec=no + commands=yes（门控优先）

**Windows:**
```powershell
$brownDir = "$env:TEMP\ops-brown-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$brownDir\openspec" -Force | Out-Null
Set-Content -Path "$brownDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$env:BROWN_OVERRIDE_OPENSPEC = "no"
$env:BROWN_OVERRIDE_COMMANDS = "yes"
& "<npm-package-root-path>\bin\cli.js" init $brownDir
```

**🔍 预期结果**：
- 脚本在 openspec 门控处退出
- `.opencode/` 未被创建（commands 的 yes 未生效）

---

### 12.10 首次部署 + env var 验证（绿地+非交互）

**Windows:**
```powershell
$greenDir = "$env:TEMP\ops-green-env-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
& "<npm-package-root-path>\bin\cli.js" init $greenDir
```

**🔍 预期结果**：
- 绿地部署正常完成（env var 仅在棕地分支被使用）
- 不需要设置 commands/skills 的 env var（绿地默认全覆盖）

---

## Phase 13 — npm 包发布前测试

> **目的**：验证 npm 打包和全局安装路径能正常工作。此 Phase 模拟用户从 npm 安装后的体验，与 Phase 1-12（均直接从工作目录执行）互补。
>
> **执行时机**：在 `npm publish` 前执行一次即可。日常开发迭代不需要每次运行。

### 13.1 创建临时测试目录

**Windows (PowerShell):**
```powershell
$phase13Dir = "$env:TEMP\ops-p13-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $phase13Dir -Force | Out-Null
$phase13Dir
```

**Linux (bash):**
```bash
phase13Dir=$(mktemp -d /tmp/ops-p13-XXXXXX)
echo "$phase13Dir"
```

**📝 预期结果**：输出临时目录路径。

---

### 13.2 npm pack 生成 tarball

```bash
cd <package-root-dir>
npm pack 2>&1 | tail -1
```

**🔍 预期结果**：输出 `*.tgz` 文件名，exit code 0。

---

### 13.3 验证 tarball 包含 .gitattributes

```bash
tar -tzf *.tgz | grep ".gitattributes"
```

**🔍 预期结果**：
```
package/.gitattributes
```

---

### 13.4 验证 tarball 内 setup.sh 是 LF 结尾

```bash
tar -xzf *.tgz -C "$phase13Dir" package/scripts/setup.sh
xxd "$phase13Dir/package/scripts/setup.sh" | head -1
```

**🔍 预期结果**：首位字节不是 `0d`。应当看到 `23 0a`（`#\n`，无 `\r`）。

---

### 13.5 验证 tarball 包含关键模板文件

```bash
tar -tzf *.tgz | grep -E "(AGENTS\.md|schema\.yaml|skills\.lock\.json|template/\.opencode/opencode\.json)"
```

**🔍 预期结果**：以下文件均存在：
- `package/template/AGENTS.md`
- `package/template/openspec/schemas/superpowers-bridge-opencode/schema.yaml`
- `package/template/skills.lock.json`
- `package/template/.opencode/opencode.json`

---

### 13.6 从 tarball 安装到隔离目录

> ⚠️ 采用 `--prefix` 隔离安装，不碰全局。如果测试目标就是验证全局安装路径，可改用 `npm install -g`，需管理员权限。

**Windows / Linux:**
```bash
cd "$pkgRoot"
npm pack 2>&1 | tail -1
```

**🔍 预期结果**：输出 `moyaspace-openspec-superpowers-opencode-<version>.tgz`，exit code 0。

---

**Windows:**
```powershell
mkdir "$phase13Dir\isolated"
npm install --prefix "$phase13Dir\isolated" "$pkgRoot\moyaspace-openspec-superpowers-opencode-*.tgz" 2>&1 | tail -3
```

**Linux:**
```bash
mkdir -p "$phase13Dir/isolated"
npm install --prefix "$phase13Dir/isolated" ./moyaspace-openspec-superpowers-opencode-*.tgz 2>&1 | tail -3
```

**📝 预期结果**：`added 1 package`，exit code 0。不修改全局 node_modules。

---

### 13.7 验证隔离环境命令可用

**Windows:**
```powershell
& "$phase13Dir\isolated\node_modules\.bin\openspec-superpowers-opencode.cmd" --help
```

**Linux:**
```bash
"$phase13Dir/isolated/node_modules/.bin/openspec-superpowers-opencode" --help
```

**🔍 预期结果**：输出帮助文本，包含 `Usage:`、`init`、`reset`、`dry-run`、`ensure-worktree`。

---

### 13.8 从隔离环境执行 init

**Windows:**
```powershell
$testDir13 = "$env:TEMP\ops-p13-run-$(Get-Date -Format 'HHmmss')"
& "$phase13Dir\isolated\node_modules\.bin\openspec-superpowers-opencode.cmd" init "$testDir13"
```

**Linux:**
```bash
testDir13=$(mktemp -d /tmp/ops-p13-run-XXXXXX)
"$phase13Dir/isolated/node_modules/.bin/openspec-superpowers-opencode" init "$testDir13"
```

**📝 预期结果**：
- 输出包含 `🎉 Init complete`
- exit code 为 0

---

### 13.9 验证生成的项目结构完整

```bash
ls "$testDir13/.opencode/opencode.json" "$testDir13/.opencode/install-manifest.json" "$testDir13/openspec/config.yaml" "$testDir13/AGENTS.md" "$testDir13/.gitignore"
```

**🔍 预期结果**：5 个文件全部存在。

---

### 13.10 在隔离项目内执行 openspec 工作流

```bash
cd "$testDir13"
openspec new change "p13-test"
openspec status --change "p13-test"
```

**🔍 预期结果**：
- 变更创建成功
- 输出进度 0/8

---

### 13.11 验证 tarball 内 setup.sh 无 CRLF（关键回归测试）

**Linux:**
```bash
tar -xzf "$pkgRoot/moyaspace-openspec-superpowers-opencode-*.tgz" -C "$phase13Dir" package/scripts/setup.sh
xxd "$phase13Dir/package/scripts/setup.sh" | head -1
```

**🔍 预期结果**：首位字节不是 `0d`。应当看到 `23 0a`（`#\n`，无 `\r`）。

---

### 13.12 清理

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:TEMP\ops-p13-*"
Remove-Item -Recurse -Force "$phase13Dir"
```

**Linux:**
```bash
rm -rf /tmp/ops-p13-*
rm -rf "$phase13Dir"
```

**📝 预期结果**：目录已不存在。全局安装不受影响。

---

## 执行记录指引

测试完成后，将结果记录到 `docs/TEST_RECORDS/`：

1. 复制 `docs/TEST_RECORDS/_template.md`（如不存在则创建新文件）
2. 填写：测试日期、平台、测试人员
3. 逐项记录 ✅/❌
4. 附上异常情况的实测日志
