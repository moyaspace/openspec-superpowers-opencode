# 设计决策：棕地（Brownfield）合并策略

> 2026-05-21 — 讨论中，逐步追加

安装清单文件：`.opencode/install-manifest.json`

---

## 门控流程

```
[0] 前提检查
[1] Superpowers 路径检测
[1.5] Skill lock 校验
  ↓
[2] openspec/ 部署 ← 门控
  → 棕地询问 YES/NO
  → NO → 退出（后续部署无意义）
  → YES → 部署 config.yaml + schemas/
  ↓
[3] 部署维度 2：.opencode/
  ├── opencode.json → 棕地合并（required 强制 allow）/ 绿地复制
  ├── commands/* → 棕地 y/N/a / 绿地部署
  └── skills/* → 棕地 y/N/a / 绿地部署
  ↓
[4] 部署维度 3：git
  ├── .gitignore → 创建 / 幂等追加 .worktrees/ 规则
  └── .gitattributes → 创建 / skip
  ↓
[5] 部署维度 4：已部署内容
  └── AGENTS.md → 绿地创建 / 棕地追加（不记入 manifest）
  ↓
[6] 替换占位符（{{SUPERPOWERS_BASE_PATH}}）
[7] 验证 schema
[8] 验证工作流 + 写入安装清单
```

---

## 维度 1：openspec/（config.yaml + schemas/* + changes/ + specs/）

### 门控

openspec/ 是整个部署的**门控步骤**，执行顺序**第一**。如果用户选择不覆盖：
- 后续部署无意义，直接退出
- 不复制任何模板文件

### 策略

| 文件/目录 | Greenfield | Brownfield | Reset |
|-----------|-----------|-----------|-------|
| config.yaml | 部署 + 记入 manifest | 询问 YES/NO（与 schemas 共进退） | 按 manifest 删除 |
| schemas/* | Force 部署 + 记入 manifest | 询问 YES/NO（与 config.yaml 共进退） | 按 manifest 删除 |
| changes/archive/ + specs/ | 创建空目录（仅未存在时） | Skip | 从不碰 |

### 当前脚本问题

`schema/*` 的 Force 部署（`Copy-Item -Recurse -Force`，L298）未记入 `$installedFiles`，reset 时删不到。需补记录。

---

## 维度 2：.opencode/（opencode.json + commands/ + skills/）

| 文件类型 | Greenfield | Brownfield | Reset |
|---------|-----------|-----------|-------|
| opencode.json | 直接复制 | 联合合并（required 强制 allow）+ 通知用户 | 不碰，告知用户 |
| commands/* | 直接部署 | 分目录 y/N/a 询问，按决策执行，记录到 manifest | 按 manifest 记录执行 |
| skills/* | 直接部署 | 分目录 y/N/a 询问，按决策执行，记录到 manifest | 按 manifest 记录执行 |

---

## 维度 3：git（.gitignore + .gitattributes + .worktrees/）

| 文件 | Greenfield | Brownfield | Reset |
|------|-----------|-----------|-------|
| .gitignore | 创建（含 .worktrees/ 条目） | 幂等追加 .worktrees/ 规则 | 不碰 |
| .gitattributes | 创建 | skip-if-exists | 不碰 |
| .worktrees/* | — | — | 不碰 |

---

## 维度 4：已部署内容（AGENTS.md + skills.lock.json + install-manifest.json）

| 文件 | Greenfield | Brownfield | Reset |
|------|-----------|-----------|-------|
| AGENTS.md | 创建 | 无 bridge 标记则追加 | 不碰，提醒用户自行处理 |
| skills.lock.json | 不部署到项目（仅模板内校验） | — | 不涉及 |
| install-manifest.json | 写入 | 写入 | 删除自身 |

---

## 四维汇总

| 维度 | 门控 | Brownfield 入口 | Reset 行为 |
|------|------|----------------|-----------|
| 1. openspec/ | ✅ 门控，NO 则退出 | YES/NO 询问 | 按 manifest 删 |
| 2. .opencode/ | — | opencode.json 合并；commands/skills y/N/a | 按记录执行；opencode.json 不碰 |
| 3. git | — | 幂等追加/skip | 不碰 |
| 4. 已部署内容 | — | AGENTS.md 追加 | 不碰，提醒用户自处理 |
