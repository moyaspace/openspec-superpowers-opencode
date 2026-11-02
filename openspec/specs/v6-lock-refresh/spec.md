# v6-lock-refresh Specification

## Purpose
本 capability 定义 Superpowers v6 锁清单刷新到 v6.4.2 的基线要求与其 hash 校验方式，并明确 v5 锁清单不在本范围内改动。
## Requirements
### Requirement: v6 锁清单基线刷新到 v6.4.2

`template/skills.lock.v6.json` 的 `upstream.commit` MUST 刷新为 Superpowers v6.4.2 的提交 `8ca22dba9a94f28898bbce59f2537ff4d87c747d`，其 6 个 `sha256` MUST 由该提交的实际文件内容计算得出，保留原有 6 个条目键与文件结构不变。

#### Scenario: commit 已刷新

- **WHEN** 读取 `template/skills.lock.v6.json`
- **THEN** `upstream.commit` 等于 `8ca22dba9a94f28898bbce59f2537ff4d87c747d`，且 `schema` / `version` / `upstream.repo` 与原文件一致

#### Scenario: hash 与 v6.4.2 实际文件一致

- **WHEN** 用 v6.4.2 干净 checkout 的 6 个对应文件重算 SHA-256 并逐条比对
- **THEN** 6 个值全部一致；若无法获取 v6.4.2 的实际文件，实现 MUST 报「未验」并记录原因，MUST NOT 编造数值

#### Scenario: v6.4.2 环境 init 无假警告

- **WHEN** 安装 Superpowers v6.4.2（与刷新后的锁清单一致）并执行 `oso init`
- **THEN** 6 个条目的校验全部通过，不输出 hash 不匹配警告

### Requirement: v5 锁清单在本变更中不被修改

`template/skills.lock.v5.json` MUST 保持原样（决策：v5 即将废弃，不修其拼凑值），MUST NOT 出现在本变更的文件改动中。

#### Scenario: v5 清单零改动

- **WHEN** 查看本变更的 `git diff` 相对基线 `b4ba0a098`
- **THEN** `template/skills.lock.v5.json` 不在改动列表中

