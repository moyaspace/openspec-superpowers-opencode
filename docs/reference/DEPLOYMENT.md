# superpowers-bridge-opencode 部署文档

> 基於 [superpowers-bridge](https://github.com/JiangWay/openspec-schemas) v1 改造的 OpenCode 專用版本。
> 將 Superpowers skills 的 `skill()` 調用改為 `Read` 讀取檔案，子 Agent 調度從 `Task` 改為 `task()`。

---

## 目錄

- [前置要求](#前置要求)
- [快速安裝（使用 setup 腳本）](#快速安裝使用-setup-腳本)
- [手動安裝步驟（Windows）](#手動安裝步驟windows)
- [手動安裝步驟（Linux）](#手動安裝步驟linux)
- [驗證安裝](#驗證安裝)
- [使用流程](#使用流程)
- [AGENTS.md 配置](#agentsmd-配置)
- [故障排除](#故障排除)
- [維護](#維護)

---

## 前置要求

| 組件 | 說明 | 檢查方式 |
|:---|:---|:---|
| **OpenCode** | 終端 AI 程式助手 | `opencode --version` |
| **OpenSpec CLI** | Spec-driven 開發框架 | `openspec --version` |
| **Superpowers 套件** | Superpowers 開發方法論 skills | `ls <superpowers-path>/skills/`（見下方） |
| **Git** | 版本控制（worktree 需要） | `git --version` |

### 確認 Superpowers 安裝路徑

Superpowers 套件安裝在 OpenCode 的快取目錄中，路徑因平台而異：

**Windows：**
```
{{SUPERPOWERS_BASE_PATH}}
```

**Linux：**
```
{{SUPERPOWERS_BASE_PATH}}
```

該目錄下應包含 `brainstorming/`、`writing-plans/`、`using-git-worktrees/` 等子目錄。

> 若自行安裝至其他位置，請在後續所有 `Read` 路徑中對應修改。

---

## 快速安裝（使用 setup 腳本）

### Windows

```powershell
cd your-project
# 確保已 git init
git init
# 運行安裝腳本（自動檢測 Superpowers 路徑、複製模板、初始化 OpenSpec）
.\scripts\setup.ps1
```

### Linux

```bash
cd your-project
git init
chmod +x scripts/setup.sh
./scripts/setup.sh
```

setup 腳本會自動完成：檢測 Superpowers 安裝路徑 → 替換模板佔位符 → 複製檔案 → 執行 `openspec init` → 驗證 schema。

---

## 手動安裝步驟（Windows）

### 1. 初始化專案（如果尚未初始化）

```powershell
cd your-project
openspec init --tools opencode
```

### 2. Git init

```powershell
git init
```

### 3. 複製 template 目錄到專案

將本模板的 `template/` 目錄下的所有內容複製到專案根目錄。

### 4. 修改 schema.yaml 中的路徑

編輯 `openspec\schemas\superpowers-bridge-opencode\schema.yaml`，
將所有 `{{SUPERPOWERS_BASE_PATH}}` 替換為實際的 Superpowers 基底路徑。

**路徑範例（Windows）：**
```
C:\Users\<用戶名>\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\
```

**路徑範例（Linux）：**
```
/home/<用戶名>/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/
```

### 5. 驗證 schema

```powershell
openspec schema validate superpowers-bridge-opencode
openspec schemas
```

---

## 手動安裝步驟（Linux）

### 1. 初始化專案

```bash
cd your-project
openspec init --tools opencode
```

### 2. Git init

```bash
git init
```

### 3. 複製 template 目錄

```bash
cp -R /path/to/template/* .
```

### 4. 替換路徑

```bash
# 替換 schema.yaml 中的所有路徑佔位符
sed -i 's|{{SUPERPOWERS_BASE_PATH}}|/home/user/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/|g' openspec/schemas/superpowers-bridge-opencode/schema.yaml
```

### 5. 驗證

```bash
openspec schema validate superpowers-bridge-opencode
openspec schemas
```

---

## 驗證安裝

### 確認 schema 被識別

```bash
openspec schemas
```

輸出中應列出 `superpowers-bridge-opencode`。

### 測試 artifact 建立

```bash
/opsx-ff test-drive
```

應自動生成 `openspec/changes/test-drive/` 並包含 brainstorm.md、proposal.md、specs/、tasks.md、plan.md。

### 確認 Read 路徑有效

在對話中測試：
```
Read {{SUPERPOWERS_BASE_PATH}}brainstorming/SKILL.md
```
應返回 brainstorming skill 的完整內容。

---

## 使用流程

### 快速啟動（推薦）

```bash
/opsx-ff <功能名>    # 一鍵生成所有 artifacts
/opsx-apply          # 自動創建 worktree → 派 Agent TDD 編碼 → 審查
/opsx-verify         # 驗證實現 vs spec
/opsx-archive        # 歸檔 + PR
```

### 逐步啟動

```bash
/opsx-new <功能名> --schema superpowers-bridge-opencode
/opsx-continue       # brainstorm
/opsx-continue       # proposal
/opsx-continue       # design（可選）
/opsx-continue       # specs
/opsx-continue       # tasks
/opsx-continue       # plan
/opsx-apply          # 實現
/opsx-verify         # 驗證
/opsx-continue       # retrospective（可選）
/opsx-archive        # 歸檔
```

### apply 階段實際流程

```
Step 0: Pre-flight → Read 檢查所有 skill 檔案是否存在
Step 1: Workspace → Read using-git-worktrees → 創建 .worktrees/<name>
Step 2: 執行 → 對 plan.md 中每個任務：
         a) Read implementer-prompt.md → task() 派 Agent
         b) Agent 完成 → Read spec-reviewer-prompt.md 審查
         c) 通過 → Read code-quality-reviewer-prompt.md 審查
         d) 全部通過 → 標記 tasks.md checkbox
Step 3: Verification → 按 verify.yaml 的 7 項檢查清單逐項執行（可重複直到 blocking 問題解決）
Step 4: Retrospective → 開 PR 前產出 retrospective.md（趁熱寫，與 PR 在同一 diff）
Step 5: Archive → openspec archive -y（同步 delta specs + 移動文件夾到 archive/）
Step 6: Completion → Read finishing-a-development-branch → PR（PR 是最後一步，retro/archive 沒完成則 STOP）
```

---

## AGENTS.md 配置

每個使用此 schema 的專案都需要在 AGENTS.md 中包含載入規則：

```markdown
## Superpowers Skill 載入規則

本項目使用自訂 schema `superpowers-bridge-opencode`。

### skill() 載入失敗時

schema 的 instruction 已改用 Read，但如果其他情境仍需載入 Superpowers skill：
Read {{SUPERPOWERS_BASE_PATH}}<技能名稱>/SKILL.md
按 Read 到的內容執行。

### 子 Agent 調度

一律使用 `task()`：
- 實現任務 → `task(category="deep", load_skills=[], ...)` — prompt 嵌入 TDD 指令（Read Superpowers TDD SKILL.md）
- 程式碼搜索 → `task(subagent_type="explore", ...)`
- 查文檔 → `task(subagent_type="librarian", ...)`
- 架構決策 → `task(subagent_type="oracle", ...)`
- Code review → `task(subagent_type="oracle", ...)`

### 基底路徑

{{SUPERPOWERS_BASE_PATH}}
```

---

## 故障排除

### 問題：`openspec schema validate` 報錯

```
Error: schema validation failed
```

可能原因：
- YAML 格式錯誤（檢查縮排）
- instruction 內含無效字元
- 路徑包含 Windows 反斜線未正確跳脫

**解決：** 用 `openspec schema validate --verbose` 查看詳細錯誤。

### 問題：Read 找不到 skill 檔案

```
Read 失敗：找不到路徑
```

可能原因：
- Superpowers 未安裝
- 安裝路徑與 schema.yaml 中寫的路徑不一致

**解決：**
```bash
# 查找實際安裝位置
find ~/.cache/opencode -name "SKILL.md" -path "*/brainstorming/*" 2>/dev/null
```
找到後更新 schema.yaml 中的所有路徑。

### 問題：task() 子 Agent 調用失敗

可能原因：
- `category` 或 `subagent_type` 參數錯誤
- 模型提供商無法訪問
- prompt 格式不正確

**解決：**
- 確認 `category` 值有效：`deep` / `quick` / `unspecified-high` / `visual-engineering`
- 確認 `subagent_type` 值有效：`explore` / `librarian` / `oracle`
- 檢查模型服務狀態（需連接至 OpenCode 後端）

### 問題：apply 時 git worktree 報錯

```
fatal: not a git repository
```

**解決：** 忘記 `git init`。先初始化 git 倉庫。

---

## 升級

superpowers-bridge-opencode 有三個上游來源可能變化，需要分別處理。

### 情境 A：OpenCode 升級（低風險）

OpenCode 升級後，`task()` 等工具 API 可能微調。

**症狀：**
- apply step 2 的子 Agent 調用報錯
- `category` 或 `subagent_type` 名稱不識別
- `run_in_background` 行為變化

**解決：**
```yaml
# 更新 AGENTS.md 中的子 Agent 映射規則
# 或調整 schema.yaml 中 apply step 2 的 task() 調用參數
```

查看 OpenCode 更新日誌確認 API 變更。

---

### 情境 B：Superpowers 套件升級（中風險）

Superpowers 套件更新後，skill 檔案內容可能變化（如 brainstorming 流程改版、writing-plans 新增步驟）。

**症狀：**
- 現有的 Read 路徑仍有效，但 Read 到的內容和預期不符
- brainstorming 的行為變了（如輸出格式、檢查清單不同）
- writing-plans 的 task 拆解方式變了

**解決步驟：**

```bash
# 1. 找到新版 skill 檔案路徑（路徑本身通常不變）
ls "{{SUPERPOWERS_BASE_PATH}}brainstorming/SKILL.md"

# 2. 用 OpenCode 的 Read 工具讀取新內容，確認變更範圍
# 登入 OpenCode 對話後執行：
#   Read "{{SUPERPOWERS_BASE_PATH}}brainstorming/SKILL.md"
#   Read "{{SUPERPOWERS_BASE_PATH}}writing-plans/SKILL.md"
#   Read "{{SUPERPOWERS_BASE_PATH}}using-git-worktrees/SKILL.md"

# 3. 評估變更是否影響現有工作流：
#    - 如果是新增步驟 → 更新 AGENTS.md 或 schema.yaml 中的 instruction 描述
#    - 如果是流程重排 → 需要重新驗證整個 apply 流程
#    - 如果只是文字調整 → 無需動作

# 4. 更新 AGENTS.md 中的路徑（如果 Superpowers 安裝位置變了）
```

**不需要修改 schema.yaml**——因為 instruction 中寫的是「Read 檔案並按內容執行」，只要 Read 到的內容是最新版，流程自然跟著走。

> **設計原理**：正因我們把 `skill()` 改成了 `Read`，Superpowers 升級 skill 檔案後，你不需要修改 schema.yaml 的 instruction。Read 會自動讀到最新內容。這是 Read 方式比 `skill()` 調用更靈活的地方。

---

### 情境 C：superpowers-bridge 社群上游升級（高風險）

### 情境 D：Superpowers 安裝路徑變更（中風險）

重新安裝 OpenCode 或 Superpowers 後，快取路徑可能變更。

**症狀：** 所有 Read 操作都報「找不到檔案」

**解決：**

```bash
# 查找新的 Superpowers 安裝位置
# Windows（PowerShell）
Get-ChildItem -Path "$env:LOCALAPPDATA\..\..\*" -Recurse -Filter "SKILL.md" -ErrorAction SilentlyContinue | Select-String -Pattern "brainstorming" | Select-Object -First 1

# Linux
find ~/.cache/opencode -name "SKILL.md" -path "*/brainstorming/*" 2>/dev/null
```

找到新路徑後，需要更新三處：

1. **schema.yaml** — 所有 `Read` 路徑
2. **AGENTS.md** — 基底路徑對照表
3. **config.yaml** — 如果路徑有寫在 context 中

---

### 升級檢查清單

每次升級後，建議走一遍驗證：

```markdown
- [ ] `openspec schema validate` 通過
- [ ] `openspec schemas` 列出正確名稱
- [ ] `/opsx-ff test-upgrade` 成功生成所有 artifacts
- [ ] Read 方式能正確載入所有需要的 skill 檔案
- [ ] 模板渲染正常（無遺漏變數）
```

---

### 版本記錄建議

在 schema.yaml 中加註自訂版本號，方便追蹤：

```yaml
name: superpowers-bridge-opencode
version: 1.0.0          # 自訂版本號
x-upstream: superpowers-bridge v1  # 基於的上游版本
x-upgraded: 2026-05-14  # 最後升級日期
```

每次升級後遞增 patch 號（如 `1.0.0` → `1.1.0`），大改動遞增 minor。

---

## 遷移

### 複製到新專案

建議使用 `scripts/setup.ps1` 或 `scripts/setup.sh` 進行安裝。
若需手動複製：

```bash
# 從模板複製整個 schema 目錄
cp -R template/* your-new-project/
```

### 退回 spec-driven

若 schema 不適用，隨時可退回：

```yaml
# openspec/config.yaml
schema: spec-driven    # 改回來
```

不需要刪除 schema 目錄，只是 config 切換而已。

---

## 目錄結構（最終）

```
your-project/
├── .git/
├── .opencode/                     ← OPSX 技能 + 命令
├── scripts/
│   ├── setup.ps1                  ← Windows 安裝腳本
│   └── setup.sh                   ← Linux 安裝腳本
├── AGENTS.md                      ← 含 Superpowers 載入規則
├── DEPLOYMENT.md                  ← 部署文檔
├── openspec/
│   ├── config.yaml                ← schema: superpowers-bridge-opencode
│   ├── schemas/
│   │   └── superpowers-bridge-opencode/
│   │       ├── schema.yaml        ← 已改為 OpenCode 相容
│   │       └── templates/         ← 模板
│   ├── specs/                     ← 主規格
│   └── changes/
│       └── archive/
└── README.md
```
