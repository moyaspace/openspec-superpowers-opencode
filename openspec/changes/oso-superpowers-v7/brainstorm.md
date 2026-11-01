## Design Summary

本 change（Sprint 1 · T004）在 `release/1.1` 上交付 3 个任务项，外加 1 项未编号的措辞更正：

- **F001 Superpowers v7 支持**：新增 `template/skills.lock.v7.json`（6 条目，基线 v7.0.1 `2ce8aa15`）；`template/.opencode/commands/opsx-apply.md` 的 **v6 及更高**分支改为整体委托上游 SDD（v5 分支原样保留）；`template/openspec/schemas/superpowers-bridge-opencode/schema.yaml` 的 apply 段同步为委托口径；`src/verify.ts` 增 bash 可用性检查；`.github/workflows/ci.yml` 的 tarball 清单纳入 v7 lock；`docs/superpowers-version-compatibility.md` 扩为 v5/v6/v7。
- **BUG012 `selectLockFile` 静默回退**：精确匹配优先；无匹配时按 major 高于/低于支持范围分别明确提示；**绝不跨 major 复用清单**；同时改掉把该 bug 当规格钉死的测试断言。
- **BUG013 `skills.lock.v6.json` 只匹配 v6.1.1**：把该 lock 刷新到 v6.4.2（commit `8ca22dba`）。
- **追加范围（未编号，【用户指挥】）**：`template/.opencode/commands/opsx-finish.md` 的措辞更正。由用户逐条现场给出要改的措辞与目标表述；AI 默认只复核与报告，用户明确说「你来做」时才动手。

核心判断：**OSO 现在只借了 SDD 的皮** —— 它用了 SDD 的两个 prompt 模板与两个脚本，然后把 SDD 的 Step 5/6 用自研简化版重跑了一遍，从未执行 SDD 的控制器逻辑。逐项核对 v7 的 `references/` 后可确认缺 8 项能力：preflight、fix-loop（≤5 轮 + breaker）、handling-reports（重派）、BLOCKED 出口、final-review（deferred-minor 收口）、resuming（中断续跑）、ledger 记账（`progress.md`）、scoped re-review（`FIX_BASE HEAD`）。这与「v7 能力不阉割」直接冲突。

## Alternatives Considered

### 方案 A：维持现状 —— OSO 自研控制器

- **做法**：保留 `opsx-apply.md` 里 v6 分支的自编排（读 implementer / task-reviewer 模板 + 跑 `task-brief` / `review-package`），继续手工从 TDD SKILL.md 摘 RED-GREEN-REFACTOR 塞进 prompt。
- **优点**：不改文本，风险最低；v6 行为完全不回归。
- **缺点**：交付的是阉割版 —— 上表 8 项能力全部缺失；v7 用户拿不到 SDD 的控制器逻辑，问题要在中途才暴露。
- **为何未采用**：与决策「交付完整版、v7 能力不得阉割」直接冲突。

### 方案 B：把 SDD 的 references 规则内嵌进 OSO 模板

- **做法**：把 preflight / fix-loop / handling-reports / final-review / resuming / cannot-verify / batching 的规则抄进 `opsx-apply.md`。
- **优点**：不依赖上游文件布局，单文件自足。
- **缺点**：references 的**执行者是 SDD（控制器 = 主会话）**，implementer 与 reviewer 都不读它们；把它们内嵌进 OSO 模板等于**复刻控制器**，上游一升级就漂移，且 OSO 要长期维护一份逻辑副本。
- **为何未采用**：复刻即漂移，且与决策「不复刻控制器逻辑」冲突。

### 方案 C：整体委托上游 SDD（采用）

- **做法**：Step 4 只做两件事 —— Read `subagent-driven-development/SKILL.md`（失败 → STOP，不静默降级）+ 确认 `scripts/` 下 `task-brief` / `review-package` / `sdd-workspace` 三个脚本存在；之后**严格按 SKILL.md 执行**（v7 下它指引读到 7 份 references）；Step 5–6 交给 SDD；OSO 只保留两条额外约束（report 中 status=done 的任务勾 `tasks.md`；不得改 `openspec/schemas/` 与 `openspec/config.yaml`）；Step 7 不变。
- **优点**：能力 100%（主会话按 SKILL.md 读到全部 references）；OSO 模板不内嵌任何控制器规则，天然不漂移；额外收益是无需再把 TDD SKILL.md 全文（约 3K tokens）嵌进每个任务 prompt。
- **缺点**：依赖上游文件布局（路径、脚本名、references 数量）。任何 Read 失败都必须 STOP 暴露，而不是降级。
- **为何采用**：这是唯一同时满足「完整能力」与「不复刻」的路径。

### 方案 D：彻底去掉版本分支，v5 / v6 / v7 统一委托（未采用）

- **做法**：删掉 v5 分支，所有版本都走委托。
- **优点**：文本更简洁，只有一条路径。
- **缺点**：v5 的 SDD 脚本布局与 prompt 文件名不同（`spec-reviewer-prompt.md` / `code-quality-reviewer-prompt.md`），且 v5 即将 EOL，为它承担改造风险不划算。
- **为何未采用**：决策「v5 分支原样保留不动；v6 及更高走委托」—— 收益小于风险。

### 方案 E：`selectLockFile` 无匹配时回退到「最近的 major」（未采用）

- **做法**：major=8 时退回 v7 lock；major=4 时退回 v5 lock。
- **优点**：不返回空，调用方逻辑不变。
- **缺点**：跨 major 校验本身没有意义（上游文件可能增删改名），且这正是 BUG012 的成因 —— v7 用户拿 v5 清单校验，看到 5 个 hash 不匹配 + 2 个文件不存在，无从得知根因。
- **为何未采用**：决策「selectLockFile 必须修（真 bug）」；正确行为是明确说「不支持」，而不是给一份错误的清单。

### 方案 F：`selectLockFile` 无匹配时直接抛错中止 init（未采用）

- **做法**：任何无对应 lock 的 major 都让 init 失败。
- **优点**：错误最显眼。
- **缺点**：未来的 v8 用户会被硬阻塞（连 openspec / 命令部署都装不上），而完整性校验只是「校验」不是「安装前提」；与项目既有的「缺 bash 只 WARNING 不阻塞」取向不一致。
- **为何未采用**：改为「明确提示 + 跳过完整性校验」；`init` 不因「该 major 无 lock」而抛出无信息错误。

### 方案 G：跟随 v7 的 brainstorming 体量分流（未采用）

- **做法**：v7 的 brainstorming 会按改动体量决定是否走完整流程；OSO 若跟随，小改动可跳过 artifacts。
- **优点**：与上游语义一致，小改动更快。
- **缺点**：OSO 的核心价值是**强制** artifacts 门禁（`openspec status` 的 applyRequires）；跟随体量判断会让门禁形同虚设。
- **为何未采用**：决策 §0-6「方案 A：OSO 明确覆盖 v7 的体量判断，始终走完整 artifacts 流程」；该差异必须写进三版本文档。

## Agreed Approach

采用**方案 C + E/F 的结合**，并在实现上同时补三件事（只改「委托」而不补这三件＝半残）：

1. **委托（C）**：`opsx-apply.md` 的 Step 4 简化为「Read SKILL.md + 确认三脚本」，Step 5–6 的 **v6 分支**换成委托文本；**v5 分支原样保留**。
2. **bash 调用写法**：SDD 的三个脚本都是 bash 脚本，且无执行位 —— Windows 上 **MUST** 写 `bash <脚本路径>`，直接执行会失败；这一点必须写进委托段。
3. **SDD → OMO 语法映射**：SDD 的 SKILL.md 与 prompt 模板是照 [CC] 写的（`Subagent (general-purpose)` + `model: [...]`），V1 线用 OMO 的 `task()`。映射：`Subagent (general-purpose)` → `task(category="deep", load_skills=[])`；`model` → 由 category 隐含（无显式 model 参数）；后台执行 → `run_in_background=true`；续跑同一子会话 → `task_id`；预加载技能 → **不用**（Superpowers 技能不是注册技能，传进 `load_skills` 会被静默忽略，只能 Read 后嵌入 prompt）。
4. **tasks.md 勾选契约**：SDD 不知道 `tasks.md` 存在 —— report 中 status = done 的任务 MUST 勾选 `tasks.md` 对应 checkbox，否则 `openspec status` 会显示 artifacts 未完成。
5. **Lock 选择（E 的反面 + F 的修正）**：精确匹配优先；无匹配时按 major 高于/低于支持范围分别明确提示，**不跨 major 复用**，且**跳过**完整性校验而非中止 init。
6. **v6 lock 刷新**：把 `template/skills.lock.v6.json` 的基线刷新到 v6.4.2，消除 v6.2+ 用户的假警告。

## Key Decisions

- **v5 分支不动**：v5 的 SDD 结构不同且即将 EOL，改造风险不划算；`opsx-apply.md` 里 v5 的 Read 清单与两步审查流程 MUST 保持原样。
- **委托段 MUST 明写「Read 失败 → STOP」**：不得静默降级为「主会话自己实现」，否则能力缺失会静默发生。
- **`load_skills` 对 Superpowers 技能无效**：只接受已注册 skill ID；Superpowers 技能是文件系统上的 `.md`，传入会被静默忽略。这是 `template/_AGENTS.md` 已记录的硬限制。
- **v7 lock 的 hash 必须现场重算**：在 v7.0.1 精确 commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` 的实际文件上算 SHA-256，不得沿用旧值；算完 MUST 与开工块给出的参考值逐条对照，**不一致 → 停下报告**，先确认上游是否已换版本，不得默默采用新值。
- **v6 lock 同样必须现场重算**：基线 v6.4.2（commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`）；拿不到该版本的实际文件时 MUST 报「未验」，不得凭参考值编造 hash。
- **v5 lock 不修**：它是拼凑的（`upstream.commit` 写的是 v4 时代的 `612fbcd`，部分 hash 不匹配）；决策 §0-7 明确不修，只在文档中记录「不得把它当作 v5 的准确基线」。
- **bash 检测只报告不持久化**：V1 没有 `.oso/config.yaml`（那是 2.0 设施），检测结果无处可写；`verify` 的 `runAllChecks` 增第 6 项，缺 bash 为 ⚠ 而非 fail。
- **测试先改再改实现**：`test/setup-discovery.test.js` 里 `selectLockFile(templateDir, '7')` 期望 v5 lock 的那条断言是**把 bug 当规格钉死**，必须先改成断言 v7 lock，并补「major 超出支持范围 → 不支持而非回退」用例。
- **`main`（V2.0 线）零接触**：同源改动（selectLockFile、模板委托、三版本文档）由 BUG014 / V2 线承接，未排期。
- **`finish` 措辞更正由用户逐条现场给出**：AI 默认只复核与报告；落点是 `template/.opencode/commands/opsx-finish.md`（受版本控制那份），部署版是否同步由用户当场单独指示；MUST NOT 触碰 Step 6a 的 base 判定顺序与「方向约束（MUST）」段（T003 刚验收）、`{{SUPERPOWERS_BASE_PATH}}` 占位符、Step 3b 的测试分派口径（BUG007 刚验收）。若某条「措辞更正」实际改变了读者能得出的结论，它就不是更正是修订 → 停下报告。

## Open Questions

- 无。范围、裁决、验收均由 Sprint 1 T004 开工命令与 `local/docs/2026-10-29-Superpowers-v7-V1.0落地方案.md` 固定，本次 brainstorming **不做新的方案讨论**（块内明示「全部已裁决，不要再讨论方案」）。
- 唯一需要执行期现场确认的量：v7.0.1 与 v6.4.2 的实际 SHA-256。参考值不一致时按上文「停下报告」处理，不在此处预先假定。
