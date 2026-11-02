## Design Summary

本变更修复两个棕地 `oso init` 缺陷，二者根因相同：升级路径用「文件存不存在」而不是「文件归谁所有」来决定是否写入。

- **BUG021**：目标已有 `openspec/config.yaml`、`openspec/schemas/superpowers-bridge-opencode/` 为空时，`src/setup/planner.ts:131-134` 的 openspec 门禁对**全部** `openspec/` 前缀发 preserve，schema 模板文件永远不落盘；`oso init` 走到 7/8 `openspec schema validate` 报 `Schema not found`，exit 1。
- **BUG022**：`.opencode/commands/` 已存在时，`src/setup/index.ts:328-343` + `src/setup/planner.ts:150-162` 走「询问 + 逐文件决策」，用户维持默认（答 n）后，1.1.1 → 1.1.2 的 10 个命令改动永远送不到。`.opencode/skills/` 同理。

裁决（2026-11-02，用户）：**方案 B —— 按「产权」分类**。产权表是唯一判据：

| 产权 | 文件 | 棕地 init 行为 |
|---|---|---|
| ① OSO 产品资产 | `.opencode/commands/*.md`、`openspec/schemas/superpowers-bridge-opencode/**`、`.opencode/skills/**` | 无条件覆盖 / 新建，不询问 |
| ② 用户配置 | `openspec/config.yaml`、`.opencode/opencode.json` | 存在则询问，默认保留；json 走 merge |
| ③ 混合文件 | `AGENTS.md` / `.gitignore` / `.gitattributes` / `.editorconfig` | marker 区块内替换，区块外一律不动 |
| ④ 用户数据 | `openspec/changes/**`、`openspec/specs/**` | 永远不碰 |

本变更只改 ① 一类的行为，②③④ 现有语义 MUST NOT 改变。

## Alternatives Considered

### 方案 A：一刀切「目标不存在才写」

- **做法**：所有模板文件统一 `fs.existsSync(target)`，存在就 preserve，不存在才 write；删除所有 commands / skills / openspec 询问分支。
- **优点**：实现最小，一处判断覆盖全部路径；永远不会覆盖用户已有文件。
- **缺点**：把 BUG022 固化成设计——产品资产（新增的 opsx 命令、更新过的 schema 模板）在已安装项目里永远无法升级，等于宣称「oso 只装一次」。新增命令也送不到，用户只能 `reset` 后重来。
- **为何未采用**：与升级场景的核心诉求（把新版本命令送到老项目）直接矛盾。

### 方案 B：按「产权」分类（已采用）

- **做法**：把模板文件按产权分成四类，只对 ① 类产品资产无条件写；② 类保留询问与 merge；③ 类继续走 marker 合并；④ 类继续永久 preserve。路径判定在 `planner.ts` 内按前缀细分，不做「整个 `openspec/` 无条件化」。
- **优点**：升级能送达（① 类覆盖），用户配置与数据仍受保护（②③④ 类不动）；语义可用一张表讲清，测试也按这张表写；新增命令与 schema 模板走同一条「新建」路径。
- **缺点**：路径分类需要维护一份 ① 类清单；未来新增模板目录时要同步归类。
- **为何胜出**：唯一同时满足 BUG021（schema 必须落盘）与 BUG022（命令必须更新）且不破坏既有保护的方案。

### 方案 C：按 `.opencode/install-manifest.json` 判断所有权

- **做法**：只有 manifest `files` 中记录过的文件才允许覆盖，其余一律 preserve。
- **优点**：理论上能精确识别「OSO 装过的文件」，连用户手改过的产品资产也能再区分。
- **缺点**：BUG021 场景里 manifest 本身可能缺失或来自旧版本（1.1.1 的 manifest 不含新命令）；manifest 无法区分「产品资产」与「用户配置」；用户自建命令与产品命令混在同一目录，manifest 变成事实上的产权表，反而更难审计。
- **为何未采用**：把可升级性绑在一个可能过期、且语义不覆盖产权区分的副产物上，脆弱且不可解释。

## Agreed Approach

采用方案 B。实现落点：

1. `src/setup/planner.ts`：openspec 门禁按路径细分——`openspec/changes/**` / `openspec/specs/**` 永远 preserve；`openspec/schemas/**`（① 类）无条件 write；其余 `openspec/*`（含 `config.yaml`）保留「存在才询问」语义并补 `fs.existsSync(target)` 守卫（BUG021）。删除 commands / skills 的 preserve 门禁（BUG022）。
2. `src/setup/index.ts`：删除 commands / skills 的询问分支与逐文件决策；openspec 询问条件收窄为「`openspec/config.yaml` 存在」。`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 保留读取但只打印一行废弃说明（理由见 design.md）。
3. 覆盖产品资产时，若目标内容与渲染结果不同，输出一行「已更新：<相对路径>」；相同不列；新建仍用 `✓ <path>`。
4. 测试：修复假 runner 的 `schema validate` 恒成功问题；新增 `seedInstalledProject(t)` 夹具与 4 个新用例；把 3 个建立在旧语义上的既有用例改写为新语义（不是删除）。

## Key Decisions

- **只改 ① 类**：`openspec/config.yaml`、`.opencode/opencode.json`、受管根文件、`openspec/changes/**`、`openspec/specs/**` 的行为 MUST NOT 变化。
- **路径细分，不按前缀一刀切**：`openspec/schemas/**` 是产品资产，`openspec/config.yaml` 是用户配置，二者必须走不同分支。
- **不删除用户自建命令**：本变更只做「写模板文件」，从不做删除；用户自建命令（模板中没有、manifest 中未记录）自然保留。
- **弃用环境变量**：`BROWN_OVERRIDE_COMMANDS` / `BROWN_OVERRIDE_SKILLS` 保留解析并打印一行说明，让显式设置过 `no` 的用户知道行为已变，而不是静默反转。
- **升级可见性**：只在「已存在且内容不同」时输出「已更新」，避免每次 init 刷屏。

## Open Questions

无。缺陷复现、根因、关闭条件与方案均已在 `local/oso/sprints/backlog.md` §2 与 2026-11-02 的裁决中确定；本变更不再重新讨论方案。
