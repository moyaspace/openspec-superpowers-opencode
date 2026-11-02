## Context

V1 线（`release/1.1`，`package.json` 1.1.1 → 目标 1.1.2）在 `c770dbb2f` 基线上已是 TS `src/` + JS `test/`（`.js` 测试 `import '../dist/...'`，即测编译产物）。`template/` 是随包发布、由 `oso init` 部署给用户的资产：锁清单、`.opencode/commands/opsx-*.md` 命令集、`openspec/schemas/superpowers-bridge-opencode/`。V1 没有 2.0 设施（无 `oso-core`、无插件、无 `supported-versions`、无 `.oso/config.yaml`）。

Superpowers 侧已实测安装 v7.0.1（`2ce8aa1`）：**安装路径与 v6 完全相同**，`skills/` 下 15 个技能（v6.1.1 为 14 个，新增 `diagnosing-superpowers`），`subagent-driven-development/` 新增 `references/`（7 份）与 `re-review-prompt.md`。所谓「v7 安装路径变了」在 OpenCode 侧不成立。

本 change 的 3 个任务项与 1 项未编号措辞更正的范围、裁决、验收，全部由 Sprint 1 T004 开工命令与 `local/docs/2026-10-29-Superpowers-v7-V1.0落地方案.md` 预先固定；本文只补「怎么落」的实现级决定。

## Goals / Non-Goals

**Goals:**

- v7 环境 `oso init` 全绿（无 hash 警告）：新增 v7 lock 并让 `selectLockFile` 精确匹配到它。
- v6.2+ 环境不再假警告：v6 lock 刷新到 v6.4.2。
- `/opsx-apply` 在 v6+ 下拿到完整 SDD 能力（preflight / fix-loop ≤5 轮 / BLOCKED / final review / resuming / ledger / scoped re-review），且 OSO 不复制这些规则。
- lock 选择永不跨 major 复用清单；越界时给出可读原因。
- Windows 缺 bash 时 `oso verify` 明确给出 ⚠ 与安装方式，但不判失败、不阻塞 init。

**Non-Goals:**

- 版本号 bump、`npm publish`、dist-tag、全新环境安装验证（→ T005）。
- 修 `template/skills.lock.v5.json`（决策：不修，v5 即将废弃；只在文档记录它不可作准确基线）。
- `main`（V2.0 线）的同源改动（→ BUG014 / V2 线，未排期）。
- 引入 2.0 设施（oso-core、opencode-plugin、`supported-versions`、`.oso/config.yaml`）。
- 更换 Superpowers 版本做真实环境验收（属【用户指挥】，AI 不自行安装或切换用户缓存）。

## Decisions

### D1 `selectLockFile` 保持 `string | null` 签名，返回 `null` 表示「无可用清单」

**选择**：签名不变，**删除**回退分支 —— 精确匹配存在则返回该路径，否则返回 `null`。

**备选**：返回 `{ path, reason, supportedMajors }` 富对象。否决原因：调用点只有两处，富对象会把「支持范围」的发现逻辑塞进选择函数，反而让契约变模糊；保持 `null` 让「没有可用清单」成为唯一可判定的结果，范围提示交给调用方 + 一个新的只读辅助（见 D2）。

**代价**：调用方必须处理 `null`（当前是 `throw`）。

### D2 「不支持」的判定与提示由调用方完成，支持范围由模板目录现状推导

**选择**：新增只读辅助（如 `listLockMajors(templateDir): string[]`，按数值排序），调用方在 `selectLockFile` 返回 `null` 时据此判断：

- `major > 最大支持 major` → 「当前 Superpowers v{major} 暂不受支持，跳过完整性校验」+ 提示等待 oso 支持该版本。
- `major < 最小支持 major` → 「Superpowers v{major} 已不受支持」+ 提示升级 Superpowers。
- 落在两支持 major 之间（模板缺该版本清单）→ 「未找到 v{major} 的锁清单」+ 跳过校验。

三种情况都**跳过**完整性校验、`init` 继续（不抛无信息错误）。理由：完整性校验是校验而非安装前提；未来的 v8 用户不应因为「还没出 v8 清单」就装不上（与「缺 bash 只 WARNING」同一取向）。

**口径说明**：落地文档 §3.4 对「高于支持范围」明写「跳过完整性校验」；本 change 对「低于」与「中间缺口」采用同一口径（提示 + 跳过），以保持三种越界情形的行为一致。

### D3 v6+ 的 apply 委托段写成「两步 Pre-flight + 三节补充」

**选择**：Step 4 只保留两件事（Read `SKILL.md`，失败 STOP；确认 `scripts/task-brief` / `review-package` / `sdd-workspace` 存在），随后一句「严格按 SKILL.md 执行（含它指引的 references）」；在此之后紧跟三节补充：① bash 调用写法（`bash <脚本路径>`）；② SDD→OMO 语法映射表；③ tasks.md 勾选契约。

**理由**：顺序很关键 —— 映射表必须出现在 Step 4 之后、Step 5 之前，否则 AI 会先照抄 [CC] 语法（落地文档 §7 风险 1）。三节内容必须是**约束**（MUST / MUST NOT），不是「参考」。

**v5 分支**：原样保留（Read 清单 + 两步审查 + 自编排），不改一个字。

### D4 schema 的 apply 段与 `opsx-apply.md` 同源同口径

**选择**：把 schema `apply:` 的 Pre-flight 与 Executor 两处按 D3 改写，措辞与 `opsx-apply.md` 对齐；搜索 `skills.lock.json` / `spec-reviewer-prompt.md` 等旧表述，只保留 v5 分支需要的部分。

**理由**：主会话会同时读 schema 的 apply 指令与命令文件；两处不一致时 AI 会按更「具体」的那份执行（往往是旧的自编排），委托就白改了。

### D5 bash 检测：独立纯函数 + `runAllChecks` 第 6 项 + init 一行复用

**选择**：

- 纯函数 `detectBash(isWin): { available: boolean; path: string | null }`：Windows 先 `where bash`，再查 `C:\Program Files\Git\bin\bash.exe`、`C:\Program Files (x86)\Git\bin\bash.exe`、`%LOCALAPPDATA%\Programs\Git\bin\bash.exe`；类 Unix 用 `which bash`。
- `runAllChecks` 在 **Superpowers major ≥ 6** 时追加第 6 项（`bash`）：可用 → `pass` + 路径；不可用 → 新增的 **`warn`** 状态 + 安装提示。
- init 的 8/8 输出打印一行 bash 状态，**复用同一检测函数**，不阻塞 init（缺 bash 只提示）。

**已核实的现状（`src/verify.ts`）**：`CheckResult.status` 只有 `'pass' | 'fail' | 'skip'`；`allPass` 认 `pass` 与 `skip`；`formatResults` 为 `pass → ✓`、`skip → ∼`、其余 `→ ⚠`（即目前 `fail` 也用 ⚠）。

**因此**：要在不判失败的前提下显示 ⚠，必须**新增 `warn` 状态** —— `allPass` 把 `warn` 与 `pass` / `skip` 一样视为通过，`formatResults` 给 `warn` 用 ⚠（并可打印修复提示）。改动 MUST 同步既有断言（`test/verify.test.js`、`test/setup-verify-registry.test.js` 中对状态集合的假设）与格式化函数，不得用 `fail` 冒充 ⚠。

**版本来源**：`verify` 目前入参没有 Superpowers 版本；实现时复用 setup 侧已有的 Superpowers 解析（必要时抽取/导出），**不得**新增第二套「找 skills 目录 + 读 version」的实现。

### D6 lock 文件生成：脚本化重算 + 逐条核对参考值

**选择**：v7 / v6 两份 lock 的 hash 一律用脚本在目标 commit 的实际文件上重算（`node -e`/PowerShell `Get-FileHash` 均可），不手抄。计算后与开工块给出的参考值逐条比对：

- v7 六个值必须与参考值**完全一致** → 不填则 STOP 报告（上游可能换了版本）。
- v6.4.2 无参考值 → 必须先在干净 checkout（tag `v6.4.2` / commit `8ca22dba`）上重算，并在 commit message / 验收记录里写下「来源 commit + 计算方式」；拿不到该版本文件时 MUST 报「未验」，不得编造。

### D7 `template/skills.lock.v6.json` 只改 `upstream.commit` + 6 个 `sha256`

**选择**：文件结构（`schema` / `version` / `upstream.repo`）不动，仅替换 commit 与 6 个 hash；条目 key 顺序保持原样，便于 diff 审阅。

**理由**：结构变更会牵动 `verifySkillLock` 与既有测试；本任务只解决「基线过期」。

## Risks / Trade-offs

- **照抄 [CC] 语法** → 映射表放在 Step 4 之后、Step 5 之前（D3）；模板一致性测试断言委托段含 `task(category="deep"` 与「不得使用 Subagent (general-purpose)」类措辞。
- **Windows 无 bash → SDD 脚本全挂** → D5 检测 + WARNING；委托段明写 `bash <脚本路径>`。
- **hash 算错或抄错** → D6 脚本化 + 逐条核对参考值；验收第一条就是「与 v7.0.1 实际文件逐条比对」。
- **委托后 tasks.md 未勾选** → 契约写进委托段（D3 ③）+ 验收查 `openspec status`。
- **v5 分支被顺手改坏** → 任务里单列「v5 分支零改动」校验项（Read 清单与两步审查原文比对）。
- **v8 用户被硬阻塞**（若误实现为 throw） → D2 明确「提示 + 跳过校验」，并用测试钉住。
- **真实 v6 / v7 环境验收无法自证** → AC1 / AC2 / BUG013 的 v6.4.2 项属【用户指挥】；AI 只报「未验」，不得用「逻辑等价」替代实跑。

## Migration Plan

- 本 change 只落 `release/1.1`，`main` 零接触；发布在 T005。
- 模板变更对**已 init 的存量项目**不自动生效（`oso init` 是部署动作），需用户重新部署；本次不写迁移脚本。
- 回滚：全部改动集中在 `src/setup/discovery.ts`、`src/setup/index.ts`、`src/verify.ts`、`template/` 四类文件与 `ci.yml` / 文档；`git revert` 单个 change 提交即可回到 `b4ba0a098` 的模板形态。

## Open Questions

- 无阻塞项。`CheckResult.status` 的现状已在 D5 核实（无 `warn`，需新增），实现按 D5 执行。
