# host-compatibility-probe Specification

## Purpose
TBD - created by archiving change oso-typescript-esm-foundation-and-host-feasibility. Update Purpose after archive.
## Requirements
### Requirement: 真实宿主探测程序

仓库 MUST 提供 Host Compatibility Probe：使用真实 OpenCode（非测试替身）验证 ESM npm 插件只加载一次、自定义工具可调用、工具上下文完整、用户消息 Hook 真实触发且发生在模型处理前、Session/Message 标识稳定、消息 Hook 的 Promise 会被等待、重复加载与退出释放不留下重复处理器或锁。能力矩阵 MUST 记录真实 Hook 名称、参数、返回值、调用次数、await 行为与时序，不得只写"通过"。

#### Scenario: 探针在真实 OpenCode 上运行

- **WHEN** 在测试项目上执行宿主探针命令
- **THEN** 真实 OpenCode 加载 ESM 插件，探针收集 Hook 触发记录与工具调用结果，并输出结构化能力矩阵

#### Scenario: Hook 行为漂移被检测

- **WHEN** 宿主 Hook 名称、参数或时序与能力矩阵基线不符
- **THEN** 探针以非零退出码失败并指出漂移项，不静默改用猜测字段

---

### Requirement: 能力矩阵三分法定级

阶段 0 MUST 输出能力矩阵，每项能力只能归入 `required-supported`、`required-missing`、`optional-supported`、`optional-missing` 之一。`required-missing` 使阶段 0 Gate 失败；可选能力缺失时 MUST 走已测试的降级路径且不阻止 Gate。上下文压缩 Hook MUST 归入可选能力；其降级恢复测试失败仍阻止通过。

#### Scenario: 矩阵覆盖必需与可选能力

- **WHEN** 阶段 0 结束
- **THEN** 能力矩阵对每项依赖的宿主能力给出三分法定级及证据（命令、版本、脱敏输出摘要）

---

### Requirement: pending 登记最小路径

0A MUST 单独验证"活动 Interview 消息先登记 pending，再让模型处理"的最小路径。如果目标版本不能可靠取得用户消息、项目目录和稳定消息标识，MUST 停止完整 Adapter 模式实施，不得用推测字段继续。

#### Scenario: pending 最小路径验证

- **WHEN** 探针在真实宿主中登记一条用户消息后再让模型处理
- **THEN** pending 记录在模型处理开始前已持久化，且宿主消息标识可稳定关联

