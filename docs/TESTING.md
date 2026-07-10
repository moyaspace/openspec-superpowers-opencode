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

### 1.5 验证逻辑单元测试

> 测试 `test/setup-verify.test.js`，覆盖 setup.ps1 验证子步骤（step 8）中三个辅助函数的解析逻辑，共 **15 个单元测试**。

#### 1.5.1 `parseTemplateOutput()` — 模板输出解析

解析 `openspec templates --json` 的对象格式输出（`{ artifactName: { path, source } }`），统计 `source === 'project'` 的模板数。

| 测试 | 输入 | 预期 |
|------|------|------|
| 成功解析 8+ 个 project 源模板 | 10 个模板（8 project + 2 builtin） | `ok=true`, `count=8` |
| 不足 8 个 project 源模板时报错 | 3 个 project 源模板 | `ok=false`, `count=3` |
| 无效 JSON 时报错 | `'not json'` | `ok=false`, `count=0` |
| 空数组返回 count=0 | `'[]'` | `ok=false`, `count=0` |

#### 1.5.2 `changeListed()` — 变更列表解析

解析 `openspec list --json` 的变更列表，在数组中查找指定变更名。支持 `{changes: [...]}` 对象格式、裸数组格式、以及 JSON 解析失败的字符串回退。

| 测试 | 输入 | 预期 |
|------|------|------|
| 在 changes 数组中找到变更 | `{changes:[{name:"verify-deploy"}]}` | `true` |
| 多个变更中找到目标 | 含 3 个变更的数组 | `true` |
| 变更不存在时返回 false | 单变更数组，目标不同 | `false` |
| 空 changes 列表返回 false | `{changes:[]}` | `false` |
| 直接数组格式也能处理 | `['verify-deploy','feature-a']` | `true` |
| 无效 JSON 回退字符串匹配 | `'verify-deploy'` | `true`（匹配） |
| 字符串回退不匹配 | `'no-match'` | `false` |

#### 1.5.3 `parseStatusOutput()` — 状态输出解析

解析 `openspec status --change` 的输出，统计以 `[` 开头的 artifact 行。

| 测试 | 输入 | 预期 |
|------|------|------|
| 统计 [ 开头的 artifact 行 | 8 artifact 行 + 其他文本 | `ok=true`, `count=8` |
| artifact 不足时报错 | 2 行 artifact | `ok=false`, `count=2` |
| 空输出 count=0 | `''` | `ok=false`, `count=0` |

#### 1.5.4 运行

```bash
node --test test/setup-verify.test.js
```

筛选仅运行单元测试：
```bash
node --test --test-name-pattern="验证逻辑" test/setup-verify.test.js
```

**🔍 预期结果**：15 个单元测试全部通过 ✓。

---

### 1.6 openspec CLI 集成测试

> 与 1.5 同文件 `test/setup-verify.test.js`，在临时目录中实际调用 openspec CLI，共 **3 个集成测试**。
>
> **前置条件**：`openspec` CLI 已安装且可用。
>
> **自动跳过**：如果 `openspec --version` 不可用，整个 describe 块跳过（`skip`）。

**📝 流程**：
1. `before()` 创建临时目录，复制 `template/` 中的 `openspec/` 和 `.opencode/` 结构
2. 切换到临时目录（模拟 init 后的项目环境）
3. 每个测试分别在临时目录中执行 openspec CLI 命令
4. `after()` 切换回原目录并递归删除临时目录

| 测试 | 执行命令 | 验证点 |
|------|---------|--------|
| `openspec templates --json` 返回 8+ 个 project 源 | `openspec templates --json --schema superpowers-bridge-opencode` | `parseTemplateOutput(out).ok === true` |
| `openspec new change + list` 创建并列出变更 | `openspec new change test-verify-integration` → `openspec list --json` | `changeListed(listOut, 'test-verify-integration') === true` |
| `openspec status --change` 返回 8+ 个 artifact | `openspec new change test-verify-artifacts` → `openspec status --change test-verify-artifacts` | `parseStatusOutput(statusOut).ok === true` |

**运行全部测试（含集成测试）：**
```bash
node --test test/setup-verify.test.js
```

**筛选仅运行集成测试：**
```bash
node --test --test-name-pattern="openspec" test/setup-verify.test.js
```

**🔍 预期结果**：
- openspec CLI 可用时：3 个集成测试全部通过 ✓（+ 15 个单元测试 = 共 18 个 ✓）
- openspec CLI 不可用时：集成测试跳过（显示 `# skip`），单元测试 15 个 ✓

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

### 6.10 AGENTS.md 棕地有标记 — 替换（BROWN_OVERRIDE_AGENTS=yes）

> 验证棕地已有完整 bridge 标记（≥2 个 `<!-- openspec-superpowers-opencode_instructions -->`）时，BROWN_OVERRIDE_AGENTS=yes 走替换分支。

**Windows:**
```powershell
$agentsDir = "$env:TEMP\ops-agents-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
# 创建带旧 bridge 标记的 AGENTS.md
$marker = '<!-- openspec-superpowers-opencode_instructions -->'
$oldBridge = "$marker`n旧 bridge 内容`n$marker"
Set-Content -Path "$agentsDir\AGENTS.md" -Value "# 用户内容`n`n$oldBridge" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_AGENTS = "yes"
node "$pkgRoot\bin\cli.js" init "$agentsDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_AGENTS -ErrorAction SilentlyContinue
```

**Linux:**
```bash
agentsDir=$(mktemp -d /tmp/ops-agents-XXXXXX)
mkdir -p "$agentsDir/openspec" "$agentsDir/.opencode"
echo 'schema: spec-driven' > "$agentsDir/openspec/config.yaml"
marker='<!-- openspec-superpowers-opencode_instructions -->'
printf "# 用户内容\n${marker}\n旧 bridge 内容\n${marker}\n" > "$agentsDir/AGENTS.md"
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_AGENTS=yes \
  node "$pkgRoot/bin/cli.js" init "$agentsDir"
```

**📝 预期结果**：
- 自动应答 openspec YES + AGENTS 替换 YES（不阻塞）
- AGENTS.md 中用户内容 `# 用户内容` 保留
- 标记间旧内容 `旧 bridge 内容` 被替换为新 bridge 内容
- AGENTS.md 包含 `Superpowers Skill 载入`（新 bridge 内容）

---

### 6.11 AGENTS.md 棕地有标记 — 跳过（BROWN_OVERRIDE_AGENTS=no）

> 验证棕地已有完整 bridge 标记时，BROWN_OVERRIDE_AGENTS=no 走跳过分支，AGENTS.md 完全不变。

**Windows:**
```powershell
$agentsSkipDir = "$env:TEMP\ops-agents-skip-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsSkipDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsSkipDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsSkipDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsSkipDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$marker = '<!-- openspec-superpowers-opencode_instructions -->'
$originalContent = "# 用户指令`n`n${marker}`n旧 bridge`n${marker}`n`n## 更多用户内容"
Set-Content -Path "$agentsSkipDir\AGENTS.md" -Value $originalContent -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_AGENTS = "no"
node "$pkgRoot\bin\cli.js" init "$agentsSkipDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_AGENTS -ErrorAction SilentlyContinue
```

**Linux:**
```bash
agentsSkipDir=$(mktemp -d /tmp/ops-agents-skip-XXXXXX)
mkdir -p "$agentsSkipDir/openspec" "$agentsSkipDir/.opencode"
echo 'schema: spec-driven' > "$agentsSkipDir/openspec/config.yaml"
originalContent="# 用户指令\n<!-- openspec-superpowers-opencode_instructions -->\n旧 bridge\n<!-- openspec-superpowers-opencode_instructions -->\n\n## 更多用户内容"
printf "$originalContent\n" > "$agentsSkipDir/AGENTS.md"
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_AGENTS=no \
  node "$pkgRoot/bin/cli.js" init "$agentsSkipDir"
```

**🔍 预期结果**：
```bash
cat "$agentsSkipDir/AGENTS.md"
```
- 内容完全保持为 `$originalContent`，无任何变化
- 仍包含 `旧 bridge`
- 不包含 `Superpowers Skill 载入`

---

### 6.12 AGENTS.md 棕地无标记 — 静默追加

> 验证棕地 AGENTS.md 没有 bridge 标记时，静默追加 bridge 内容到文件末尾。

**Windows:**
```powershell
$agentsAppendDir = "$env:TEMP\ops-agents-append-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsAppendDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsAppendDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsAppendDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsAppendDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
Set-Content -Path "$agentsAppendDir\AGENTS.md" -Value "# 用户自己的 AGENTS.md`n`n## 规则`n- 规则一" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
node "$pkgRoot\bin\cli.js" init "$agentsAppendDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**Linux:**
```bash
agentsAppendDir=$(mktemp -d /tmp/ops-agents-append-XXXXXX)
mkdir -p "$agentsAppendDir/openspec" "$agentsAppendDir/.opencode"
echo 'schema: spec-driven' > "$agentsAppendDir/openspec/config.yaml"
printf "# 用户自己的 AGENTS.md\n\n## 规则\n- 规则一\n" > "$agentsAppendDir/AGENTS.md"
BROWN_OVERRIDE_OPENSPEC=yes \
  node "$pkgRoot/bin/cli.js" init "$agentsAppendDir"
```

**🔍 预期结果**：
```bash
cat "$agentsAppendDir/AGENTS.md"
```
- 文件以 `# 用户自己的 AGENTS.md` 开头（用户内容保留）
- 文件末尾包含 `Superpowers Skill 载入`（bridge 内容已追加）
- 用户内容和 bridge 内容之间的分隔自然

---

### 6.13 AGENTS.md 棕地有标记 — 替换后用户内容保留

> 验证替换分支后，标记外的用户内容（前后均有）被完整保留。

**Windows:**
```powershell
$agentsPreDir = "$env:TEMP\ops-agents-pre-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsPreDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsPreDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsPreDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsPreDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$marker = '<!-- openspec-superpowers-opencode_instructions -->'
Set-Content -Path "$agentsPreDir\AGENTS.md" -Value "# 上方用户内容`n`n${marker}`n旧 bridge 内容`n${marker}`n`n# 下方用户内容" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_AGENTS = "yes"
node "$pkgRoot\bin\cli.js" init "$agentsPreDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_AGENTS -ErrorAction SilentlyContinue
```

**🔍 预期结果**：
```bash
$content = Get-Content "$agentsPreDir\AGENTS.md" -Raw
$content -match '# 上方用户内容' -and $content -match '# 下方用户内容'
```
- `# 上方用户内容` 和 `# 下方用户内容` 均保留
- 标记间内容已更新为 template 版本

---

### 6.14 AGENTS.md 棕地仅 1 标记（不完整）— 追加

> 验证 AGENTS.md 只有一个 `<!-- openspec-superpowers-opencode_instructions -->` 标记（缺少闭标记）时，走追加分支而非替换分支。

**Windows:**
```powershell
$agentsOneDir = "$env:TEMP\ops-agents-one-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsOneDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsOneDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsOneDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsOneDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
# 仅一个标记（缺失闭标记）
$marker = '<!-- openspec-superpowers-opencode_instructions -->'
Set-Content -Path "$agentsOneDir\AGENTS.md" -Value "# 用户`n`n${marker}`n不完整" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
node "$pkgRoot\bin\cli.js" init "$agentsOneDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**🔍 预期结果**：
```bash
$content = Get-Content "$agentsOneDir\AGENTS.md" -Raw
# 应包含 3 个标记（原 1 个 + bridge 中的 2 个）
$markerCount = ([regex]::Matches($content, $marker)).Count
$markerCount -eq 3
```
- 原 1 个标记保留
- bridge 内容追加到文件末尾
- 用户内容保留在文件开头

---

### 6.15 AGENTS.md 棕地空文件 — 写入 bridge

> 验证 AGENTS.md 为空文件时，走绿地分支（直接写入 bridge 内容），而不是追加。

```bash
$agentsEmptyDir = "$env:TEMP\ops-agents-empty-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $agentsEmptyDir -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsEmptyDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$agentsEmptyDir\.opencode" -Force | Out-Null
Set-Content -Path "$agentsEmptyDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
# 创建空文件
"" | Set-Content -Path "$agentsEmptyDir\AGENTS.md" -NoNewline -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
node "$pkgRoot\bin\cli.js" init "$agentsEmptyDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**📝 预期结果**：
- AGENTS.md 不为空，包含 template bridge 完整内容
- 包含 `Superpowers Skill 载入` 等 bridge 内容

清理（可选，所有 agents 测试目录在一次 Phase 10 批量清理）：
```bash
Remove-Item -Recurse -Force "$agentsDir","$agentsSkipDir","$agentsAppendDir","$agentsPreDir","$agentsOneDir","$agentsEmptyDir"
```

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

### 8.3 Git Deploy 单元测试（marker 部署逻辑）

测试文件 `test/git-deploy.test.js` 覆盖 `.gitignore` / `.gitattributes` / `.editorconfig` 的 marker 检测/替换/追加逻辑，与 `AGENTS.md` 部署逻辑一致：

- **绿地**：文件不存在时直接写入 template 内容
- **棕地已有标记**：≥ 2 marker → 替换标记间内容（保留用户内容）或跳过
- **棕地无标记**：0-1 marker → 静默追加到文件末尾
- **标记计数判定**：grep -c 风格，< 2 走追加，≥ 2 走替换
- **re.sub 语义**：count=1 仅替换第一个标记对；`.trimEnd()` 去除尾部换行
- **跨平台**：CRLF 换行中标记识别
- **边缘**：仅有标记对无用户内容、空文件
- **Template 一致性**：每个 template 文件包含恰好 2 个 marker，均在 `#` 注释行中

每个场景对三个文件分别执行，共 **39 个测试**。

```bash
# 运行
node --test test/git-deploy.test.js

# 预期输出：全部 39 个测试通过 ✓
```

### 8.4 .editorconfig 棕地部署验证

> 验证 `init` 在棕地场景下对 `.editorconfig` 的三路分支行为：绿地创建、棕地无标记追加、棕地已有标记替换/跳过。

#### 8.4.1 绿地部署 — .editorconfig 创建

**Windows:**
```powershell
$ecGreenDir = "$env:TEMP\ops-ec-green-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $ecGreenDir -Force | Out-Null
$env:BROWN_OVERRIDE_OPENSPEC = "yes"
node "$pkgRoot\bin\cli.js" init "$ecGreenDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC -ErrorAction SilentlyContinue
```

**Linux:**
```bash
ecGreenDir=$(mktemp -d /tmp/ops-ec-green-XXXXXX)
BROWN_OVERRIDE_OPENSPEC=yes node "$pkgRoot/bin/cli.js" init "$ecGreenDir"
```

**🔍 预期结果：**
```bash
cat "$ecGreenDir/.editorconfig"
```
- `.editorconfig` 存在
- 包含 `# <!-- openspec-superpowers-opencode_editorconfig -->` marker 对
- 包含 `root = true`、`end_of_line = lf` 等规则

清理：
```bash
Remove-Item -Recurse -Force "$ecGreenDir"
```

---

#### 8.4.2 棕地无标记 — .editorconfig 追加

> 验证已有 `.editorconfig` 但无 marker 时，静默追加 bridge 内容。

**Windows:**
```powershell
$ecAppendDir = "$env:TEMP\ops-ec-append-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $ecAppendDir -Force | Out-Null
New-Item -ItemType Directory -Path "$ecAppendDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$ecAppendDir\.opencode" -Force | Out-Null
Set-Content -Path "$ecAppendDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
# 创建不含 marker 的用户 .editorconfig
@"
root = true

[*]
indent_style = space
indent_size = 2
charset = utf-8
"@ | Set-Content -Path "$ecAppendDir\.editorconfig" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "y"
$env:BROWN_OVERRIDE_SKILLS = "y"
node "$pkgRoot\bin\cli.js" init "$ecAppendDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_COMMANDS, BROWN_OVERRIDE_SKILLS -ErrorAction SilentlyContinue
```

**Linux:**
```bash
ecAppendDir=$(mktemp -d /tmp/ops-ec-append-XXXXXX)
mkdir -p "$ecAppendDir/openspec" "$ecAppendDir/.opencode"
echo 'schema: spec-driven' > "$ecAppendDir/openspec/config.yaml"
cat > "$ecAppendDir/.editorconfig" << 'EOF'
root = true

[*]
indent_style = space
indent_size = 2
charset = utf-8
EOF
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_COMMANDS=y BROWN_OVERRIDE_SKILLS=y \
  node "$pkgRoot/bin/cli.js" init "$ecAppendDir"
```

**🔍 预期结果：**
```bash
$content = Get-Content "$ecAppendDir\.editorconfig" -Raw
Write-Host "文件开头: $($content.Substring(0, 30))"
# 用户原始内容在文件开头
$content.StartsWith('root = true') -and $content.Contains('openspec-superpowers-opencode_editorconfig')
```
- `.editorconfig` 以用户原始内容（`root = true`, `indent_style = space` 等）开头
- 文件末尾包含 bridge 内容 + `# <!-- openspec-superpowers-opencode_editorconfig -->` marker
- `end_of_line = lf` 等模板规则存在

清理：
```bash
Remove-Item -Recurse -Force "$ecAppendDir"
```

---

#### 8.4.3 棕地已有标记 — .editorconfig 替换

> 验证已有完整 marker 对时，`BROWN_OVERRIDE_EDITORCONFIG=yes` 替换标记间内容。

**Windows:**
```powershell
$ecReplaceDir = "$env:TEMP\ops-ec-replace-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $ecReplaceDir -Force | Out-Null
New-Item -ItemType Directory -Path "$ecReplaceDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$ecReplaceDir\.opencode" -Force | Out-Null
Set-Content -Path "$ecReplaceDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$marker = '# <!-- openspec-superpowers-opencode_editorconfig -->'
@"
# 用户自定义规则
$marker
旧 bridge 内容
end_of_line = crlf
$marker
# 用户尾部规则
"@ | Set-Content -Path "$ecReplaceDir\.editorconfig" -Encoding utf8

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "y"
$env:BROWN_OVERRIDE_SKILLS = "y"
$env:BROWN_OVERRIDE_EDITORCONFIG = "yes"
node "$pkgRoot\bin\cli.js" init "$ecReplaceDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_COMMANDS, BROWN_OVERRIDE_SKILLS, BROWN_OVERRIDE_EDITORCONFIG -ErrorAction SilentlyContinue
```

**Linux:**
```bash
ecReplaceDir=$(mktemp -d /tmp/ops-ec-replace-XXXXXX)
mkdir -p "$ecReplaceDir/openspec" "$ecReplaceDir/.opencode"
echo 'schema: spec-driven' > "$ecReplaceDir/openspec/config.yaml"
marker='# <!-- openspec-superpowers-opencode_editorconfig -->'
cat > "$ecReplaceDir/.editorconfig" << EOF
# 用户自定义规则
$marker
旧 bridge 内容
end_of_line = crlf
$marker
# 用户尾部规则
EOF
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_COMMANDS=y BROWN_OVERRIDE_SKILLS=y \
BROWN_OVERRIDE_EDITORCONFIG=yes \
  node "$pkgRoot/bin/cli.js" init "$ecReplaceDir"
```

**🔍 预期结果：**
```bash
$content = Get-Content "$ecReplaceDir\.editorconfig" -Raw
$content -match '# 用户自定义规则' -and $content -match '# 用户尾部规则' -and -not ($content -match '旧 bridge 内容')
```
- `# 用户自定义规则` 保留
- `# 用户尾部规则` 保留
- `旧 bridge 内容` 和 `end_of_line = crlf` 被替换为模板规则（`end_of_line = lf`）
- marker 对仍存在

清理：
```bash
Remove-Item -Recurse -Force "$ecReplaceDir"
```

---

#### 8.4.4 棕地已有标记 — .editorconfig 跳过

> 验证 `BROWN_OVERRIDE_EDITORCONFIG=no` 跳过替换，内容完全不变。

**Windows:**
```powershell
$ecSkipDir = "$env:TEMP\ops-ec-skip-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $ecSkipDir -Force | Out-Null
New-Item -ItemType Directory -Path "$ecSkipDir\openspec" -Force | Out-Null
New-Item -ItemType Directory -Path "$ecSkipDir\.opencode" -Force | Out-Null
Set-Content -Path "$ecSkipDir\openspec\config.yaml" -Value 'schema: spec-driven' -Encoding utf8
$marker = '# <!-- openspec-superpowers-opencode_editorconfig -->'
@"
# 我的配置
$marker
自定义内容
$marker
# 结尾
"@ | Set-Content -Path "$ecSkipDir\.editorconfig" -Encoding utf8
$originalContent = Get-Content "$ecSkipDir\.editorconfig" -Raw

$env:BROWN_OVERRIDE_OPENSPEC = "yes"
$env:BROWN_OVERRIDE_COMMANDS = "y"
$env:BROWN_OVERRIDE_SKILLS = "y"
$env:BROWN_OVERRIDE_EDITORCONFIG = "no"
node "$pkgRoot\bin\cli.js" init "$ecSkipDir"
Remove-Item Env:\BROWN_OVERRIDE_OPENSPEC, BROWN_OVERRIDE_COMMANDS, BROWN_OVERRIDE_SKILLS, BROWN_OVERRIDE_EDITORCONFIG -ErrorAction SilentlyContinue
```

**Linux:**
```bash
ecSkipDir=$(mktemp -d /tmp/ops-ec-skip-XXXXXX)
mkdir -p "$ecSkipDir/openspec" "$ecSkipDir/.opencode"
echo 'schema: spec-driven' > "$ecSkipDir/openspec/config.yaml"
marker='# <!-- openspec-superpowers-opencode_editorconfig -->'
cat > "$ecSkipDir/.editorconfig" << EOF
# 我的配置
$marker
自定义内容
$marker
# 结尾
EOF
originalContent=$(cat "$ecSkipDir/.editorconfig")
BROWN_OVERRIDE_OPENSPEC=yes BROWN_OVERRIDE_COMMANDS=y BROWN_OVERRIDE_SKILLS=y \
BROWN_OVERRIDE_EDITORCONFIG=no \
  node "$pkgRoot/bin/cli.js" init "$ecSkipDir"
```

**🔍 预期结果：**
```bash
$newContent = Get-Content "$ecSkipDir\.editorconfig" -Raw
$newContent -eq $originalContent
```
- `.editorconfig` 内容完全不变（`# 我的配置`、`自定义内容`、`# 结尾` 均保留）

清理：
```bash
Remove-Item -Recurse -Force "$ecSkipDir"
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
Available commands: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims
```

---

### 11.8 未知子命令 --lang zh-CN

```bash
node <npm-package-root-path>/bin/cli.js --lang zh-CN blah
```

**🔍 预期结果**：
```
未知子命令: blah
可用命令: init, reset, dry-run, ensure-worktree, registry, verify, install-shims, uninstall-shims
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

### 13.9 验证生成的项目结构完整（含 .gitignore 排除规则）

```bash
# 1. 关键文件全部存在
ls "$testDir13/.opencode/opencode.json" \
   "$testDir13/.opencode/install-manifest.json" \
   "$testDir13/openspec/config.yaml" \
   "$testDir13/AGENTS.md" \
   "$testDir13/.gitignore"

# 2. .gitignore 包含正确的排除规则
grep -q "\.opencode/" "$testDir13/.gitignore" && echo "✅ .opencode/ ignored" || echo "❌ .opencode/ missing"
grep -q "openspec/schemas/" "$testDir13/.gitignore" && echo "✅ schemas/ ignored" || echo "❌ schemas/ missing"
grep -q "openspec/config\.yaml" "$testDir13/.gitignore" && echo "✅ config.yaml ignored" || echo "❌ config.yaml missing"
grep -q "\.worktrees/" "$testDir13/.gitignore" && echo "✅ .worktrees/ ignored" || echo "❌ .worktrees/ missing"

# 3. 模拟 git add 确认排除规则生效（隔离项目是全新 git init，此时尚未 commit）
cd "$testDir13"
git init . 2>/dev/null  # 如果已 init 则无害
git add -A 2>&1
# .opencode/ 不应在待提交列表中
git diff --cached --name-only | grep -q "\.opencode/" && echo "❌ .opencode/ staged (BUG: .gitignore not working)" || echo "✅ .opencode/ NOT staged"
```

**🔍 预期结果**：
- 5 个关键文件全部存在
- 4 条排除规则全部匹配
- `.opencode/` 未出现在 staged 列表中

---

### 13.10 验证生成的项目结构——直接 init 后的 git add 排除（回归：之前 .gitignore 缺失导致 infra 文件被追踪）

```bash
cd "$testDir13"

# openspec/schemas/ 不应在待提交列表中
git diff --cached --name-only | grep -q "openspec/schemas/" && echo "❌ schemas/ staged (BUG)" || echo "✅ schemas/ NOT staged"

# openspec/config.yaml 不应在待提交列表中
git diff --cached --name-only | grep -q "openspec/config.yaml" && echo "❌ config.yaml staged (BUG)" || echo "✅ config.yaml NOT staged"
```

**🔍 预期结果**：`openspec/schemas/` 和 `openspec/config.yaml` 均未被 staged。

---

### 13.11 在隔离项目内执行 openspec 工作流

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

## Phase 14 — 注册表 CLI 测试

> **覆盖命令**：`registry add`、`registry remove`、`registry list`、`registry verify`（轻量）、`registry reset`

### 14.1 创建临时目录并 init

**Windows (PowerShell):**
```powershell
$p14Dir = "$env:TEMP\ops-p14-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $p14Dir -Force | Out-Null
$pkgRoot = "<npm-package-root-path>"
node "$pkgRoot\bin\cli.js" init "$p14Dir"
```

**Linux (bash):**
```bash
p14Dir=$(mktemp -d /tmp/ops-p14-XXXXXX)
node "$pkgRoot/bin/cli.js" init "$p14Dir"
```

**📝 预期结果**：
- init 完成，exit code 0
- 输出包含 `注册表: openspec/oso-change-registry.json`

---

### 14.2 验证注册表初始状态

**Windows / Linux:**
```bash
cat "$p14Dir/openspec/oso-change-registry.json"
```

**🔍 预期结果**：
```json
{
  "changes": []
}
```

---

### 14.3 registry add — 添加变更

**Windows / Linux:**
```bash
cd "$p14Dir"
node "$pkgRoot/bin/cli.js" registry add my-feature .worktrees/my-feature
```

**📝 预期结果**：
- 输出 `✓ Registry updated: my-feature`
- exit code 0

---

### 14.4 验证添加后注册表内容

```bash
cat openspec/oso-change-registry.json
```

**🔍 预期结果**：
```json
{
  "changes": [
    {
      "name": "my-feature",
      "worktree": ".worktrees/my-feature",
      "createdAt": "..."
    }
  ]
}
```

---

### 14.5 registry list — 列出活跃变更

```bash
node "$pkgRoot/bin/cli.js" registry list
```

**🔍 预期结果**：
```
Changes:
  my-feature  .worktrees/my-feature  just now
```

---

### 14.6 registry add — 同名覆盖

```bash
node "$pkgRoot/bin/cli.js" registry add my-feature .worktrees/my-feature-v2
```

**📝 预期结果**：exit code 0，注册表中 my-feature 的 worktree 路径已更新为 `.worktrees/my-feature-v2`。

验证：
```bash
cat openspec/oso-change-registry.json | grep "my-feature-v2"
```

---

### 14.7 registry verify — 轻量验证（注册表 + worktree 目录）

**Windows / Linux:**
```bash
node "$pkgRoot/bin/cli.js" registry verify
```

当前 worktree 目录不存在，预期：
```
  ✓ oso-change-registry.json: 1 change(s)
  ⚠ worktree my-feature: not found (.worktrees/my-feature-v2)
```
exit code 1。

---

### 14.8 创建 worktree 目录后 verify 应通过

```bash
mkdir -p .worktrees/my-feature-v2
node "$pkgRoot/bin/cli.js" registry verify
```

**🔍 预期结果**：
```
  ✓ oso-change-registry.json: 1 change(s)
  ✓ worktrees: all present
```
exit code 0。

---

### 14.9 registry remove — 删除变更

```bash
node "$pkgRoot/bin/cli.js" registry remove my-feature
```

**📝 预期结果**：
- 输出 `✓ Removed from registry: my-feature`
- exit code 0

验证已删除：
```bash
cat openspec/oso-change-registry.json
```

**🔍 预期结果**：`{"changes":[]}`

---

### 14.10 registry reset — 重置注册表（带备份）

```bash
node "$pkgRoot/bin/cli.js" registry add feature-a .worktrees/feature-a
node "$pkgRoot/bin/cli.js" registry add feature-b .worktrees/feature-b
node "$pkgRoot/bin/cli.js" registry reset
```

**📝 预期结果**：
- reset 输出包含 `backup` 和 `previous entries: 2`
- exit code 0

验证：
```bash
cat openspec/oso-change-registry.json
ls openspec/oso-change-registry.json.bak
```

**🔍 预期结果**：
- `oso-change-registry.json` → `{"changes":[]}`
- `oso-change-registry.json.bak` → 存在，包含 2 条条目的备份

---

### 14.11 非项目目录下 registry 命令行为

```bash
cd "$env:TEMP"
node "$pkgRoot/bin/cli.js" registry list
```

**🔍 预期结果**：报错提示不在 OpenSpec 项目中，exit code 1。

---

## Phase 15 — verify 顶层命令测试

> **覆盖**：`openspec-superpowers-opencode verify`（5 项系统完整性检查）

### 15.1 创建临时目录并 init

```powershell
$p15Dir = "$env:TEMP\ops-p15-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $p15Dir -Force | Out-Null
node "$pkgRoot\bin\cli.js" init "$p15Dir"
```

---

### 15.2 在项目内执行 verify

```bash
cd "$p15Dir"
node "$pkgRoot/bin/cli.js" verify
```

**🔍 预期输出格式**（5 项检查，每行一图标 + 检查名 + 描述）：

```
✓ openspec: installed at ...
✓ openspec-orig: ...
✓ openspec (shim): ...
✓ oso-change-registry.json: valid (0 changes)
✓ worktrees: no active changes
```

每个检查项输出包含三项之一：
- `✓` — 通过
- `∼` — 跳过（如非项目目录中）
- `⚠` — 失败，含 `修复：` 提示行

---

### 15.3 verify exit code 验证

```bash
node "$pkgRoot/bin/cli.js" verify
echo "Exit code: $LASTEXITCODE"
```

**🔍 预期结果**：
- 所有检查 ✓ → exit code 0
- 任意检查 ⚠ → exit code 1
- 全部 ∼（非项目目录）→ exit code 0

---

### 15.4 非项目目录下 verify

```bash
cd "$env:TEMP"
node "$pkgRoot/bin/cli.js" verify
```

**🔍 预期结果**：
- openspec / openspec-orig / openspec (shim) 正常检查
- oso-change-registry.json → `∼ not in a project`
- worktrees → `∼ not in a project`
- exit code 0

---

### 15.5 注册表损坏时 verify 报错

**Windows:**
```powershell
echo "broken json" > "$p15Dir\openspec\oso-change-registry.json"
node "$pkgRoot\bin\cli.js" verify
```
**Linux:**
```bash
echo "broken json" > "$p15Dir/openspec/oso-change-registry.json"
node "$pkgRoot/bin/cli.js" verify
```

**🔍 预期结果**：
```
⚠ oso-change-registry.json: parse error
  修复：openspec-superpowers-opencode registry reset
```
exit code 1。

恢复：
```bash
node "$pkgRoot/bin/cli.js" registry reset
```

---

## Phase 16 — 垫片脚本测试

> **覆盖命令**：`install-shims`、`uninstall-shims`
>
> **注意**：本 Phase 会修改全局 PATH 中的 `openspec` 文件。使用结束后应通过 `uninstall-shims` 恢复。
>
> **执行前确认**：系统已安装原版 `openspec` CLI（`npm install -g @fission-ai/openspec`），且可通过 `which openspec` / `where openspec` 定位。

### 16.1 验证原版 openspec 可用

```bash
openspec --version
```

**📝 预期结果**：输出 openspec CLI 版本号（如 `1.3.x`），exit code 0。

---

### 16.2 install-shims — 安装垫片脚本

**Windows:**
```powershell
node "<npm-package-root-path>\bin\cli.js" install-shims
```

**Linux:**
```bash
node "<npm-package-root-path>/bin/cli.js" install-shims
```

**📝 预期结果**：
```
  ✓ Shim scripts installed successfully
    found openspec at: <bin-dir>
    created: openspec-orig.cmd（或 openspec-orig）
    installed shim scripts: openspec.cmd, openspec.ps1（或 openspec）
```

---

### 16.3 验证垫片脚本已替换 openspec

**Windows:**
```powershell
Get-Content "$(where openspec | Select-Object -First 1)" -TotalCount 1
```

**Linux:**
```bash
head -1 "$(which openspec)"
```

**🔍 预期结果**：垫片标记行 `# openspec shim for oso registry`（Unix）或 `@rem openspec shim for oso registry`（CMD）或 `# openspec shim for oso registry`（PowerShell）。

---

### 16.4 验证 openspec-orig 存在

**Unix:**
```bash
which openspec-orig
```

**Windows:**
```powershell
where openspec-orig
```

**🔍 预期结果**：输出 openspec-orig 路径，exit code 0。

---

### 16.5 验证垫片脚本在项目内合并 list

```bash
cd "$p14Dir"   # 使用 phase 14 的测试目录（已有注册表条目）
mkdir -p .worktrees/my-feature-v2
openspec list
```

**🔍 预期结果**：输出包含各 worktree 的合并变更列表，格式同原版 openspec list。

---

### 16.6 在项目外垫片透传

```bash
cd "$env:TEMP"
openspec list
```

**🔍 预期结果**：输出原生 openspec list 行为，无垫片拦截。

---

### 16.7 uninstall-shims — 卸除垫片脚本

**Windows:**
```powershell
node "<npm-package-root-path>\bin\cli.js" uninstall-shims
```

**Linux:**
```bash
node "<npm-package-root-path>/bin/cli.js" uninstall-shims
```

**📝 预期结果**：
```
  ✓ Shim scripts uninstalled successfully
    found openspec at: <bin-dir>
    found backup: openspec-orig.cmd
    deleted shim files: openspec.cmd, openspec.ps1
    restored: openspec-orig.cmd → openspec.cmd
```

---

### 16.8 验证已恢复原版 openspec

```bash
head -1 "$(which openspec)"
```

**🔍 预期结果**：第一行不含 `openspec shim` 标记（已恢复为原版 openspec 文件）。

---

### 16.9 幂等性 — 重复 install-shims

```bash
node "<npm-package-root-path>/bin/cli.js" install-shims
node "<npm-package-root-path>/bin/cli.js" install-shims
```

**🔍 预期结果**：第二次安装输出 `openspec-orig already exists, skipped`，exit code 0。

清理：
```bash
node "<npm-package-root-path>/bin/cli.js" uninstall-shims
```

### 16.10 注册表不存在时垫片透传

使用一个纯 openspec 项目（没有 oso-change-registry.json）验证 `openspec list` 透传行为：

```bash
# 确保垫片已安装
node "<npm-package-root-path>/bin/cli.js" install-shims

# 创建临时目录并 init 一个普通 openspec 项目
$passthruDir = "$env:TEMP\ops-passthru-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $passthruDir -Force | Out-Null
cd "$passthruDir"
openspec new change "passthru-test"

# 验证 openspec list 仍然能正常显示变更（垫片未因无注册表而拦截阻断）
# 说明：注册表不存在 → registry-utils 内部透传 openspec-orig list → 原生输出
openspec list
```

**🔍 预期结果**：`openspec list` 正常输出变更列表（不是"No active changes found."），因为垫片检测到无注册表后透传给了原版 openspec。

清理：
```bash
node "<npm-package-root-path>/bin/cli.js" uninstall-shims
Remove-Item -Recurse -Force "$passthruDir"
```

---

## Phase 17 — Registry + Opsx 集成测试

> **覆盖**：注册表与 opsx 命令的联动，包括 add→list→verify 完整链路

### 17.1 创建临时目录并 init

```powershell
$p17Dir = "$env:TEMP\ops-p17-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $p17Dir -Force | Out-Null
node "$pkgRoot\bin\cli.js" init "$p17Dir"
```

---

### 17.2 simulate: 创建 worktree 并 add 注册表

```bash
cd "$p17Dir"
git worktree add .worktrees/feature-login -b feature/feature-login
node "$pkgRoot/bin/cli.js" registry add feature-login .worktrees/feature-login

git worktree add .worktrees/feature-auth -b feature/feature-auth
node "$pkgRoot/bin/cli.js" registry add feature-auth .worktrees/feature-auth
```

**🔍 预期结果**：两个 worktree 创建成功，两个 registry add 均 exit code 0。

---

### 17.3 验证 registry list 展示所有活跃变更

```bash
node "$pkgRoot/bin/cli.js" registry list
```

**🔍 预期结果**：
```
Changes:
  feature-login  .worktrees/feature-login  just now
  feature-auth   .worktrees/feature-auth   just now
```

---

### 17.4 verify 命令在集成状态下运行

```bash
node "$pkgRoot/bin/cli.js" verify
```

**🔍 预期结果**：
```
✓ openspec: installed at ...
✓ openspec-orig: ...
✓ openspec (shim): ...
✓ oso-change-registry.json: valid (2 changes)
✓ worktrees: all present
```
exit code 0。

---

### 17.5 registry remove + registry list 验证删除

```bash
node "$pkgRoot/bin/cli.js" registry remove feature-login
node "$pkgRoot/bin/cli.js" registry list
```

**🔍 预期结果**：list 输出只包含 `feature-auth`，不包含 `feature-login`。

---

### 17.6 registry reset + verify 验证重置

```bash
node "$pkgRoot/bin/cli.js" registry reset
node "$pkgRoot/bin/cli.js" verify
```

**🔍 预期结果**：
- reset 输出包含备份信息
- verify 输出 `oso-change-registry.json: valid (0 changes)`
- exit code 0

---

### 17.7 opsx 命令流程模拟 — 创建→add→remove 完整生命周期

```bash
cd "$p17Dir"

# 模拟 /opsx-new: 创建变更 + registry add
openspec new change "test-flow"  2>&1 | tail -1
# 注意：此时变更在 main 上创建，正常流程应在 worktree 内
# 这里仅测试 registry add 的联动
node "$pkgRoot/bin/cli.js" registry add test-flow .worktrees/test-flow

# 模拟 add 前 verify（opsx 命令中会在 add 前自动跑 registry verify）
# 当前 worktree 不存在，verify 应报 ⚠
node "$pkgRoot/bin/cli.js" registry verify
# exit code 1（预期：worktree 不存在）

# 创建 worktree 后 verify 通过
git worktree add .worktrees/test-flow -b feature/test-flow
node "$pkgRoot/bin/cli.js" registry verify
# exit code 0

# 模拟 /opsx-finish: remove 注册表
node "$pkgRoot/bin/cli.js" registry remove test-flow

# 清理 worktree
git worktree remove .worktrees/test-flow
git branch -d feature/test-flow
```

**🔍 预期结果**：
- 完整生命周期中每一步 exit code 符合标注
- verify 在 worktree 存在时为 0，不存在时为 1

---

### 17.8 清理

```powershell
Remove-Item -Recurse -Force "$p14Dir"
Remove-Item -Recurse -Force "$p15Dir"
Remove-Item -Recurse -Force "$p17Dir"
```

---

## 执行记录指引

测试完成后，将结果记录到 `docs/TEST_RECORDS/`：

1. 复制 `docs/TEST_RECORDS/_template.md`（如不存在则创建新文件）
2. 填写：测试日期、平台、测试人员
3. 逐项记录 ✅/❌
4. 附上异常情况的实测日志
