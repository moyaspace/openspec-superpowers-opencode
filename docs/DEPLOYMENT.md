# superpowers-bridge-opencode 部署文档

> 基於 [superpowers-bridge](https://github.com/JiangWay/openspec-schemas) v1 改造的 OpenCode 專用版本。
> 將 Superpowers skills 的 `skill()` 調用改為 `Read` 讀取檔案，子 Agent 調度從 `Task` 改為 `call_omo_agent`。

---

## 目錄

- [前置要求](#前置要求)
- [安裝步驟（Windows）](#安裝步驟windows)
- [安裝步驟（Linux）](#安裝步驟linux)
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
| **OMO**（可選） | oh-my-openagent 多 Agent 編排 | `npx oh-my-opencode doctor` |

### 確認 Superpowers 安裝路徑

Superpowers 套件安裝在 OpenCode 的快取目錄中，路徑因平台而異：

**Windows：**
```
C:\Users\<用戶名>\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\
```

**Linux：**
```
~/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/
```

該目錄下應包含 `brainstorming/`、`writing-plans/`、`using-git-worktrees/` 等子目錄。

> 若自行安裝至其他位置，請在後續所有 `Read` 路徑中對應修改。

---

## 安裝步驟（Windows）

### 1. 初始化專案（如果尚未初始化）

```powershell
cd your-project
openspec init --tools opencode
```

### 2. Git init

```powershell
git init
```

### 3. 下載 superpowers-bridge schema

```powershell
git clone https://github.com/JiangWay/openspec-schemas C:\temp\oss
```

### 4. 複製到專案並改名

```powershell
Copy-Item -Recurse C:\temp\oss\superpowers-bridge openspec\schemas\superpowers-bridge-opencode
```

### 5. 清理暫存目錄

```powershell
Remove-Item -Recurse -Force C:\temp\oss
```

### 6. 驗證 schema

```powershell
openspec schema validate superpowers-bridge-opencode
openspec schemas
```

### 7. 修改 schema.yaml

編輯 `openspec\schemas\superpowers-bridge-opencode\schema.yaml`，

**7a. 修改頂部（第 1-3 行）：**

```yaml
name: superpowers-bridge-opencode
version: 1
description: >
  OpenCode 專用版本。基於 superpowers-bridge v1。
```

**7b. 依以下表格逐項修改 instruction 中的內容：**

| 位置 | 原內容 | 改為 |
|:---|:---|:---|
| **brainstorm PRECHECK** | `confirm superpowers:brainstorming appears...` | `Read 以下檔案：<完整路徑>\brainstorming\SKILL.md` |
| **brainstorm 執行** | `Use the Skill tool to invoke superpowers:brainstorming` | `按 Read 到的內容執行` |
| **brainstorm 輸出重定向** | `docs/superpowers/specs/` | `openspec/changes/<name>/brainstorm.md` |
| **plan PRECHECK** | `confirm superpowers:writing-plans appears...` | `Read 以下檔案：<完整路徑>\writing-plans\SKILL.md` |
| **plan 執行** | `Use the Skill tool to invoke superpowers:writing-plans` | `按 Read 到的內容執行` |
| **verify 執行** | `Use the Skill tool to invoke openspec-verify-change` | `按檢查清單逐項執行` |
| **apply pre-flight** | `verify required Superpowers skills` | `確認 Read 方式可用` + 檔案路徑列表 |
| **apply step 1** | `Use the Skill tool to invoke superpowers:using-git-worktrees` | `按以下檔案內容執行：<完整路徑>\using-git-worktrees\SKILL.md` |
| **apply step 2** | `superpowers:subagent-driven-development` + `Task tool` | `call_omo_agent(subagent_type="hephaestus", ...)` |
| **apply step 6** | `use the Skill tool to invoke superpowers:finishing-a-development-branch` | `按以下檔案內容執行：<完整路徑>\finishing-a-development-branch\SKILL.md` |

**路徑範例（Windows）：**
```
C:\Users\<username>\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\brainstorming\SKILL.md
```

**7c. apply step 2 的 call_omo_agent 範本：**

```yaml
2. **執行計畫** — 使用 call_omo_agent 派生子 Agent

   從 plan.md 中提取所有任務，對每個任務：

   a) 讀取 implementer-prompt.md 模板，按模板構造 prompt 調用子 Agent：
      模板路徑：
        <完整路徑>\subagent-driven-development\implementer-prompt.md
      調用：
        call_omo_agent(
          subagent_type="hephaestus",
          description="實現 <任務名>",
          prompt="<任務內容 + 模板>",
          run_in_background=true
        )

   b) 任務完成後，讀取 spec-reviewer-prompt.md 做 spec 審查：
      路徑：
        <完整路徑>\subagent-driven-development\spec-reviewer-prompt.md

   c) 審查通過後，讀取 code-quality-reviewer-prompt.md 做代碼質量審查：
      路徑：
        <完整路徑>\subagent-driven-development\code-quality-reviewer-prompt.md

   d) 審查全部通過後，標記 tasks.md 中的 checkbox 為完成
```

### 8. 修改 config.yaml

```yaml
# openspec/config.yaml
schema: superpowers-bridge-opencode

# （可選）設定專案上下文
context: |
  技術棧: <你的技術棧>
```

### 9. 修改 AGENTS.md

```markdown
## Superpowers Skill 載入規則

本項目使用自訂 schema `superpowers-bridge-opencode`。

### skill() 載入失敗時

改用手動 Read 對應 skill 檔案：
- `Read <完整基底路徑>/<技能名稱>/SKILL.md`
- 按 Read 到的內容執行

### 子 Agent 調度

一律使用 `call_omo_agent`：
- 實現任務 → hephaestus
- 程式碼搜索 → explore
- 查文檔 → librarian
- 架構決策 → oracle
- Code review → momus
```

---

## 安裝步驟（Linux）

### 1. 初始化專案

```bash
cd your-project
openspec init --tools opencode
```

### 2. Git init

```bash
git init
```

### 3. 下載 schema

```bash
git clone https://github.com/JiangWay/openspec-schemas /tmp/oss
```

### 4. 複製到專案並改名

```bash
cp -R /tmp/oss/superpowers-bridge openspec/schemas/superpowers-bridge-opencode
```

### 5. 清理

```bash
rm -rf /tmp/oss
```

### 6. 驗證

```bash
openspec schema validate superpowers-bridge-opencode
openspec schemas
```

### 7-9 修改 schema.yaml / config.yaml / AGENTS.md

步驟與 Windows 完全相同，差異僅在**路徑格式**。

**Linux 路徑範例：**
```
/home/user/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/brainstorming/SKILL.md
```

**基底路徑（Linux）：**
```
~/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/
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
Read <基底路徑>/brainstorming/SKILL.md
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
         a) Read implementer-prompt.md → call_omo_agent 派 Agent
         b) Agent 完成 → Read spec-reviewer-prompt.md 審查
         c) 通過 → Read code-quality-reviewer-prompt.md 審查
         d) 全部通過 → 標記 tasks.md checkbox
Step 3: Verification → 運行 openspec-verify-change（7 項檢查）
Step 4: Retrospective → 產生 retrospective.md
Step 5: Archive → openspec archive -y
Step 6: Completion → Read finishing-a-development-branch → PR
```

---

## AGENTS.md 配置

每個使用此 schema 的專案都需要在 AGENTS.md 中包含 Load 規則：

```markdown
## Superpowers Skill 載入規則

本項目使用自訂 schema `superpowers-bridge-opencode`。

### skill() 載入失敗時

schema 的 instruction 已改用 Read，但如果其他情境仍需載入 Superpowers skill：
Read <基底路徑>/<技能名稱>/SKILL.md
按 Read 到的內容執行。

### 子 Agent 調度

一律使用 `call_omo_agent`：
- 實現任務 → hephaestus
- 程式碼搜索 → explore
- 查文檔 → librarian
- 架構決策 → oracle
- Code review → momus

### 基底路徑

<!-- 請根據實際作業系統和用戶名修改 -->

Windows：
C:\Users\<用戶名>\.cache\opencode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\skills\

Linux：
~/.cache/opencode/packages/superpowers@git+https_/github.com/obra/superpowers.git/node_modules/superpowers/skills/
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

### 問題：call_omo_agent 調用失敗

可能原因：
- OMO 未安裝或未正確配置
- subagent_type 名稱錯誤

**解決：** 確認 `npx oh-my-opencode doctor` 輸出正常。

### 問題：apply 時 git worktree 報錯

```
fatal: not a git repository
```

**解決：** 忘記 `git init`。先初始化 git 倉庫。

---

## 升級

superpowers-bridge-opencode 有三個上游來源可能變化，需要分別處理。

### 情境 A：OpenCode 或 OMO 升級（低風險）

OpenCode 或 OMO 升級後，`call_omo_agent` 等工具的 API 可能微調。

**症狀：**
- apply step 2 的子 Agent 調用報錯
- subagent_type 名稱不識別
- `run_in_background` 行為變化

**解決：**
```yaml
# 更新 AGENTS.md 中的子 Agent 映射規則
# 或調整 schema.yaml 中 apply step 2 的 call_omo_agent 調用參數
```

查看 OMO 更新日誌確認 API 變更。

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
ls "<基底路徑>/brainstorming/SKILL.md"

# 2. 用 OpenCode 的 Read 工具讀取新內容，確認變更範圍
# 登入 OpenCode 對話後執行：
#   Read "<基底路徑>/brainstorming/SKILL.md"
#   Read "<基底路徑>/writing-plans/SKILL.md"
#   Read "<基底路徑>/using-git-worktrees/SKILL.md"

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

上游 `JiangWay/openspec-schemas` 的 `superpowers-bridge` 發佈新版，可能包含：
- 新增 artifact 類型
- 修改 artifact 依賴關係（`requires` 變更）
- 模板（templates/）更新
- instruction 內容優化

**升級步驟：**

#### 第一步：拉取新版並比對差異

```bash
# Windows
git clone https://github.com/JiangWay/openspec-schemas C:\temp\oss-upgrade

# Linux
git clone https://github.com/JiangWay/openspec-schemas /tmp/oss-upgrade
```

#### 第二步：比對差異，分類評估

```bash
# 比對 schema.yaml（核心結構）
diff -u openspec/schemas/superpowers-bridge-opencode/schema.yaml C:\temp\oss-upgrade\superpowers-bridge\schema.yaml

# 比對模板目錄
diff -urN openspec/schemas/superpowers-bridge-opencode/templates/ C:\temp\oss-upgrade\superpowers-bridge\templates\
```

**比對結果分三類處理：**

| 變更類型 | 範例 | 處理方式 |
|:---|:---|:---|
| **🟢 schema 結構不變** | 模板文字調整、instruction 微調 | 手動合併對應行即可 |
| **🟡 新增 artifact** | 上游新增了 `security-review` artifact | 需在 schema.yaml 中新增對應 ID 及 instruction（用 Read 方式） |
| **🔴 artifact 依賴變更** | `apply.requires` 新增了 artifact | 需調整 schema.yaml 的 requires 陣列 + 新增對應 OpenCode instruction |
| **🔴 instruction 改為調用新 skill** | 上游新增了 `superpowers:security-review` | 需找到對應 skill 檔案路徑，改為 Read 方式 |

#### 第三步：合併 schema.yaml

**schema.yaml 的合併策略**：

```yaml
# 上游新增的內容 → 翻譯成 Read 方式
# 你的 instruction 改動 → 保留不動

# 範例：上游新增了一個 artifact
# 上游原始內容：
#   - id: security-review
#     instruction: |
#       Use the Skill tool to invoke superpowers:security-review
#
# 你改成：
#   - id: security-review
#     instruction: |
#       PRECHECK — 載入 security-review skill：
#       Read 以下檔案：
#         <基底路徑>\security-review\SKILL.md
#       如果 Read 失敗，STOP 並告知用戶。
#       按 Read 到的內容執行。
```

**原則：** 上游的 `instruction` 全部要改為 Read 方式。上游的 `templates/`、`requires` 陣列、artifact 清單結構可以照搬。

#### 第四步：合併模板（通常可直接覆蓋）

```bash
# Windows
Copy-Item -Recurse -Force C:\temp\oss-upgrade\superpowers-bridge\templates\* openspec\schemas\superpowers-bridge-opencode\templates\

# Linux
cp -R /tmp/oss-upgrade/superpowers-bridge/templates/* openspec/schemas/superpowers-bridge-opencode/templates/
```

模板是純 markdown，不涉及工具調用，可直接覆蓋。

#### 第五步：驗證

```bash
openspec schema validate superpowers-bridge-opencode
openspec schemas
```

#### 第六步：清理

```bash
# Windows
Remove-Item -Recurse -Force C:\temp\oss-upgrade

# Linux
rm -rf /tmp/oss-upgrade
```

---

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

```bash
# 從舊專案複製整個 schema 目錄
# Windows
Copy-Item -Recurse ../old-project/openspec/schemas/superpowers-bridge-opencode openspec/schemas/

# Linux
cp -R ../old-project/openspec/schemas/superpowers-bridge-opencode openspec/schemas/
```

### 新專案設定

```bash
# 1. 改 config.yaml
# schema: superpowers-bridge-opencode

# 2. 在 AGENTS.md 中加入載入規則（參考上方章節）

# 3. 確認路徑正確（不同機器用戶名可能不同）
# 4. git init（如果新專案尚未初始化）
```

### 退回 spec-driven

若 schema 不適用，隨時可退回：

```yaml
# openspec/config.yaml
schema: spec-driven    # 改回來
```

不需要刪除 schema 目錄，只是 config 切換而已。schema 目錄留著，之後想用隨時改回去。

---

## 目錄結構（最終）

```
your-project/
├── .git/
├── AGENTS.md                         ← 含 Superpowers 載入規則
├── openspec/
│   ├── config.yaml                   ← schema: superpowers-bridge-opencode
│   ├── schemas/
│   │   └── superpowers-bridge-opencode/
│   │       ├── schema.yaml           ← 已改為 OpenCode 相容
│   │       └── templates/            ← 模板（不動）
│   ├── specs/                        ← 主規格
│   └── changes/
│       └── archive/
└── .opencode/                        ← OPSX 技能（不變）
```
