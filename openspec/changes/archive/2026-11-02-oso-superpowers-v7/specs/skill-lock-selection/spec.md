## ADDED Requirements

### Requirement: 锁清单选择精确匹配优先

`selectLockFile(templateDir, major)` MUST 优先返回 `skills.lock.v{major}.json`（当该文件存在时），MUST NOT 因为模板目录中存在字典序更小的锁清单而改变这一选择。

#### Scenario: 存在精确匹配

- **WHEN** 模板目录含 `skills.lock.v5.json`、`skills.lock.v6.json`、`skills.lock.v7.json`，并以 major `7` 调用
- **THEN** 返回 `skills.lock.v7.json` 的完整路径

#### Scenario: v6 用户仍拿到 v6 清单

- **WHEN** 模板目录含上述三份清单，并以 major `6` 调用
- **THEN** 返回 `skills.lock.v6.json` 的完整路径

### Requirement: 无精确匹配时绝不跨 major 复用清单

`selectLockFile` 在没有精确匹配时 MUST 返回「无可用清单」，MUST NOT 回退到其他 major 的锁清单。

#### Scenario: 更高 major 无清单

- **WHEN** 模板目录只有 v5 / v6 / v7 清单，并以 major `8` 调用
- **THEN** 返回 `null`，且不返回 v5 / v6 / v7 中任何一个路径

#### Scenario: 更低 major 无清单

- **WHEN** 模板目录只有 v5 / v6 / v7 清单，并以 major `4` 调用
- **THEN** 返回 `null`

#### Scenario: major 无法解析

- **WHEN** 传入的 major 为 `null`
- **THEN** 返回 `null`，不回退

### Requirement: 越界时给出可读原因并跳过完整性校验

当没有精确匹配的锁清单时，`oso init` MUST 输出可读的「不支持」原因（区分高于支持范围与低于支持范围），MUST 跳过完整性校验并继续完成其余部署步骤，MUST NOT 抛出无信息错误，也 MUST NOT 用其他 major 的清单执行校验。

#### Scenario: 高于支持范围

- **WHEN** Superpowers 主版本高于模板支持的最高版本（例如模板最高为 v7、实际为 v8）
- **THEN** 输出「当前 Superpowers v8 暂不受支持，跳过完整性校验」（或等价表述），init 继续，且不产生基于 v7 清单的 hash 警告

#### Scenario: 低于支持范围

- **WHEN** Superpowers 主版本低于模板支持的最低版本
- **THEN** 输出「已不受支持」类提示，init 继续

#### Scenario: 不再出现无信息错误

- **WHEN** 上述任一越界情况下执行 `oso init`
- **THEN** 不出现 `No skills lock file was found in the template` 这类无信息错误

### Requirement: 测试断言反映正确行为

`test/setup-discovery.test.js` MUST 断言「major=7 时返回 v7 锁清单」，MUST NOT 保留「major=7 时返回 v5 锁清单」这类把缺陷当规格的断言；并 MUST 新增「major 超出支持范围时返回无可用清单、不回退」的用例。

#### Scenario: 原断言已更正

- **WHEN** 运行 `test/setup-discovery.test.js`
- **THEN** 存在断言「major `7` + 存在 v7 清单 → 返回 `skills.lock.v7.json`」，且不存在断言「major `7` → 返回 `skills.lock.v5.json`」

#### Scenario: 越界用例

- **WHEN** 运行新增用例：模板目录含 v5 / v6 / v7 清单，major 为 `8`
- **THEN** 断言返回值为「无可用清单」，且断言未回退到 v5 或 v6 或 v7
