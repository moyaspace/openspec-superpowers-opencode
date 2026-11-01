# Superpowers 版本兼容（v5 / v6 / v7）

> 本文只描述**当前行为**：装哪个版本会发生什么。
>
> 为什么这样设计、改过哪些文件、当时的测试结果，不在本文。完整记录见
> `local/docs/2026-11-01-Superpowers-v7-集成全集.md` 与 `openspec/changes/oso-superpowers-v7/`。

## 1. 安装位置与版本识别

Superpowers 在 OpenCode 侧的安装位置，v6 与 v7 **完全相同**：

```
~/.cache/opencode/packages/superpowers@*/node_modules/superpowers/skills
```

不存在「v7 换了安装路径」，路径探测不含 major 分支。

识别方式：定位 `skills/` 目录后，读同级 `package.json` 的 `version`，取 major（只接受 `\d+(\.\d+){0,2}`，其余视为无法解析）。

## 2. 三版本对照

| 项目 | v5 | v6 | v7 |
|------|----|----|----|
| SDD 目录文件 | `implementer-prompt.md`、`spec-reviewer-prompt.md`、`code-quality-reviewer-prompt.md` | `implementer-prompt.md`、`task-reviewer-prompt.md`、`scripts/{task-brief,review-package,sdd-workspace}` | 同 v6，另加 `references/`（7 份）与 `re-review-prompt.md` |
| 审查方式 | 两步：spec → code quality | 单步：spec + quality 一次 | 单步 + fix-loop + final review（细节在 `references/`） |
| `/opsx-apply` 分支 | 自编排（Read 4 个文件 + 手工构造 prompt + 两步审查） | 委托上游 SDD（Read `SKILL.md` + 确认三脚本；三节 OSO 约定） | 同 v6 |
| 锁清单 | `skills.lock.v5.json`（拼凑值，见 §8） | `skills.lock.v6.json`（v6.4.2） | `skills.lock.v7.json`（v7.0.1） |

- v7 `references/` 七份：`preflight.md`、`batching.md`、`handling-reports.md`、`fix-loop.md`、`final-review.md`、`resuming.md`、`cannot-verify.md`。
- v7 的 `skills/` 共 15 个技能，与 v6.4.2 目录名完全一致（零增删改名）；差异在文件内容。
- v6 与 v7 共用同一条 v6+ 分支；v5 分支保持零改动。

## 3. 影响范围

| 文件 | 引用的 SDD 文件 | v5 | v6 | v7 |
|------|-----------------|----|----|----|
| `template/.opencode/commands/opsx-apply.md` | `implementer-prompt.md` | ✅ | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `task-reviewer-prompt.md` | ❌ | ✅ | ✅ |
| `template/openspec/schemas/.../schema.yaml`（apply 段） | `SKILL.md` | ✅ | ✅ | ✅ |
| | `implementer-prompt.md` | ✅ | ✅ | ✅ |
| | `spec-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `code-quality-reviewer-prompt.md` | ✅ | ❌ | ❌ |
| | `task-reviewer-prompt.md` | ❌ | ✅ | ✅ |
| `template/skills.lock.v5.json` / `.v6.json` / `.v7.json` | 各版本实际存在的文件（hash） | ✅ | ✅ | ✅ |
| `src/setup/discovery.ts` + `src/setup/index.ts` | 锁文件选择与校验 | ✅ | ✅ | ✅ |

v7 与 v6 的引用关系一致；v5 的两个 reviewer prompt 不在任何 v6+ 锁文件中，因此不会误报。

**不受影响**：brainstorm / proposal / specs / tasks / plan / verify / retrospective 的 artifact 流程；
`opsx-ff`、`opsx-new`、`opsx-finish`、`opsx-archive`；`template/_AGENTS.md`（只引用 TDD）。

## 4. 锁清单

```
template/
├── skills.lock.v5.json    ← v5.x（拼凑值，不修）
├── skills.lock.v6.json    ← v6.x（v6.4.2）
└── skills.lock.v7.json    ← v7.x（v7.0.1）
```

| 文件 | `upstream.commit` | 条目数 | 说明 |
|---|---|---|---|
| `skills.lock.v5.json` | `612fbcdd01be93b7e3432f04fc8a864e2c3b8a88` | 7 | v4 时代拼凑值，含两个 reviewer prompt，**不可作 v5 基线** |
| `skills.lock.v6.json` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` | 6 | v6.4.2，hash 按实际文件重算 |
| `skills.lock.v7.json` | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | 6 | v7.0.1，结构同 v6 |

三份都是标准 v1 结构，每个条目为 `{ "sha256": "<64 位大写 hex>" }`。实际内容以 `template/` 下的文件为准，本文不复述。

v7 相对 v6 的 hash 变化：`brainstorming/SKILL.md` 与 `subagent-driven-development/SKILL.md`；其余 4 条一致。

## 5. 锁选择与越界处理

`selectLockFile(templateDir, major)`：

- major 有值且 `skills.lock.v<major>.json` 存在 → 返回该路径；
- 否则返回 `null`。

**绝不跨 major 回退。**

`selectLockFile` 返回 `null` 时，`init` 按支持范围给出提示，并跳过完整性校验继续安装：

| 情形 | 提示 | 行为 |
|---|---|---|
| major 高于模板最高 | 当前 Superpowers vN 暂不受支持 | 跳过校验，继续 init |
| major 低于模板最低 | Superpowers vN 已不受支持 | 跳过校验，继续 init |
| 落在中间缺口 | 未找到 vN 的锁清单 | 跳过校验，继续 init |
| version 无法解析 | 版本无法解析类提示 | 跳过校验，继续 init |

跳过校验时**不会落地** `skills.lock.json`。

## 6. `/opsx-apply` 的两个分支

**v5**：自编排。按 v5 清单 Read `implementer` / `spec-reviewer` / `code-quality-reviewer` / TDD，手工构造 implementer prompt，做两步审查（spec → code quality）。

**v6+**（v7 走这里）：委托上游 SDD。

```
Step 4a  Pre-flight
         Read {{SUPERPOWERS_BASE_PATH}}subagent-driven-development/SKILL.md（失败 STOP）
         + 确认 scripts/{task-brief,review-package,sdd-workspace} 存在（只确认，不运行）

Step 4.5  三节 OSO 约定（硬约束）
         ① bash 调用写法：一律 bash "<脚本路径>"
         ② SDD → OMO 语法映射（见下表）
         ③ tasks.md 勾选契约

Step 5/6 严格按 SKILL.md 执行；OSO 只追加两条：
         1) report 中 status = DONE 的任务勾 tasks.md
         2) 不得修改 openspec/schemas/ 与 openspec/config.yaml
```

**SDD → OMO 映射**：

| SDD 写法（Claude Code） | OMO 写法 | 说明 |
|---|---|---|
| `Subagent (general-purpose)` | `task(category="deep", load_skills=[], description=..., prompt=...)` | 只用于实现者 |
| Subagent 承担审查 | `task(subagent_type="oracle", ...)` | 审查者；不用 `category="deep"` |
| `model: [MODEL]` | 不写 `model` | 模型由 category 隐含 |
| 后台派发 | `run_in_background=true` | 用 `background_output(task_id="bg_...")` 收取 |
| 续跑同一子 Agent | `task(..., task_id="ses_...")` | fix loop 前 3 轮 |
| `load_skills=[...]` | 不依赖，一律 `load_skills=[]` | Superpowers 技能是文件系统 `.md`，不是注册技能，传入会被静默忽略 |

`template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 `apply:` 段与上表同口径。

## 7. bash 检测

v6+ 的 apply 依赖三个 bash 脚本。

- Windows 探测顺序：`where bash` → `C:\Program Files\Git\bin\bash.exe` → `C:\Program Files (x86)\Git\bin\bash.exe` → `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`；类 Unix 用 `which bash`。
- `oso verify`：Superpowers major ≥ 6 时追加 `bash` 检查项。可用 → ✓ 并显示路径；不可用 → ⚠ 并给出安装提示，**退出码不受影响**。
- `oso init`：8/8 阶段打印一行 bash 状态，缺 bash 不阻塞。

## 8. 三个既存问题

- **① v6 锁曾滞后。** 曾停在 v6.1.1，v6.2+ 用户会看到假 hash 警告。现已刷新到 v6.4.2。
- **② v5 锁是拼凑值。** `upstream.commit` 属 v4 时代，部分 hash 与 v5 实际文件不符。不修，不得作 v5 基线。
- **③ v5 分支依赖已删除的文件。** `spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md` 自 v6 起不存在；v6+ 用户不走 v5 分支，手工指定 v5 会失败。不修，仅记录。

## 9. brainstorming 与 OSO 的覆盖

v7 的 `brainstorming/SKILL.md` 有两条要求：

- **体量分流**：小改动写短设计，大型项目写完整设计。
- **强制批准门**（`HARD-GATE`）：设计文档获批前不开始实现。

**OSO 的立场：明确覆盖体量分流，始终走完整 artifacts 流程。**

一律执行 brainstorm → proposal → design → specs → tasks → plan → apply；体量只影响各 artifact 篇幅，不影响环节是否存在。批准门体现为用户显式发起 `/opsx-apply`。

## 10. 不变的内容

- `template/_AGENTS.md`：只引用 `test-driven-development/SKILL.md`。
- `opsx-finish.md`：只引用 `finishing-a-development-branch/SKILL.md`。
- `template/_gitignore`、`_gitattributes`、`_editorconfig`：与 Superpowers 版本无关。
- brainstorm / proposal / specs / tasks / plan / verify / retrospective 的 schema instruction：不引用 SDD。

## 附：相关文档

| 主题 | 位置 |
|---|---|
| 完整记录（决策、执行、历史） | `local/docs/2026-11-01-Superpowers-v7-集成全集.md` |
| 上游 v5 → v6 结构对比 | `docs/superpowers-sdd-version-comparison.md` |
| 本次变更的规格与任务 | `openspec/changes/oso-superpowers-v7/` |