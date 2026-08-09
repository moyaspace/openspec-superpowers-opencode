# Why oso: OpenSpec + Superpowers 为什么需要桥接

## 各自的定位

| 工具 | 层 | 职责 | 接口 | 产出 |
|------|-----|------|------|------|
| **Superpowers** | 方法论（HOW） | 提供开发流程指导 | Skill tool / Read SKILL.md | 方法步骤 |
| **OpenSpec** | 治理（WHAT） | 定义 artifact 及依赖关系 | openspec CLI | 文件结构 |

两者在设计上是完全正交的——没有任何一层意识到彼此的存在。要把它们配合使用，用户需要自己填补 6 道鸿沟。

---

## 鸿沟 1：工具接口不同

Superpowers skills 设计为通过 `Skill` 工具调用（Claude Code 原生支持）。

但 OpenSpec 的 `instruction` 字段写的是 `"Use the Skill tool to invoke superpowers:brainstorming"`——如果你的平台不支持 `Skill` 工具（如 OpenCode、Gemini CLI 等），这个 instruction 直接不可用。

**必须手动逐条改成 `Read` 方式。**

## 鸿沟 2：路径随环境变化

Superpowers skill 文件的实际路径因平台 + 用户名 + 安装方式不同而变化：

```
Windows: C:\Users\Alice\.cache\opencode\packages\...\brainstorming\SKILL.md
Linux:   /home/bob/.cache/opencode/packages/.../brainstorming/SKILL.md
```

schema.yaml 里写死的路径换台机器就炸。必须在每台机器上手动查找并替换所有路径（涉及 7 个 skill、4 个文件共 10+ 处）。

## 鸿沟 3：没有 skill ↔ artifact 映射

两边各自有一套实体，但没有标准对应关系：

| Superpowers skill | OpenSpec artifact | 手动集成的工作 |
|---|---|---|
| brainstorming | brainstorm | 写 instruction：去读 SKILL.md → 填 brainstorm.md 模板 |
| writing-plans | plan | 同上，重复 |
| subagent-driven-dev | apply 阶段 | 写 instruction：调度子 Agent TDD 编码 |
| using-git-worktrees | apply 阶段 | 写 instruction：创建 worktree |
| finishing-branch | finish 阶段 | 写 instruction：合并策略 |

7 个 skills × 7 个 artifacts，每个 instruction 都要手动写路径 + 配模板 + 指定输出位置。**全部是手工作业，没有复用性。**

## 鸿沟 4：没有编排层

按照 OpenSpec 的设计，生成一个变更的全部 artifact 需要：

```
openspec instructions brainstorm --change X
  → 读 brainstorming skill → 写 brainstorm.md
openspec instructions proposal --change X
  → 读 writing-plans skill → 写 proposal.md
openspec instructions specs --change X
  → 读 writing-plans skill → 写 specs.md
...（重复 7 次）
```

每次都要手动敲命令、读 skill、写文件。**7 个 artifact 就要 7 轮手动操作。**

13 个 OPSX 命令就是为了解决这个——每条命令封装一个完整阶段（创建/实现/验证/收尾），用户一个 `/opsx-ff` 走完所有 7 个 artifact 的生成。

## 鸿沟 5：没有版本兼容性保障

Superpowers 更新后 skill 内容可能变化（如 brainstorming 流程改版）。schema.yaml 里的 instruction 写的是"读这个文件然后执行"，但：

- 谁来判断新版 skill 和现有 instruction 是否兼容？
- 兼容性断裂时谁会告警？
- 如何回滚到已知可用的版本？

**这些没有标准机制。**

skills.lock.json 做的就是这件事：记录 7 个 skill 文件在部署时的 SHA-256 哈希，后续部署时自动比对，哈希不匹配则 WARNING。

## 鸿沟 6：没有变更隔离

即便 1-5 全部手工配好，也只能在一个工作目录下一次做一个变更。

想做第二个变更？要么等当前的 finish，要么手动 git stash——然后面临上下文切换丢失、变更碎片化的风险。

worktree 隔离是在你真正用这个组合做多变更开发时才会遇到的瓶颈。但它恰恰是 AI 编码场景下最高频的需求。

---

## 总结

| 鸿沟 | 没有 oso | 有 oso |
|------|---------|--------|
|  工具接口 | 手动改 7 条 instruction | 预置适配 |
|  路径 | 每台机器手动替换 10+ 处路径 | setup 脚本自动检测并替换 |
|  映射 | 手动维护 skill ↔ artifact 对应关系 | 写入 schema.yaml，开箱即用 |
|  编排 | 手动敲 7 轮命令完成一个变更 | `/opsx-ff` 一键完成 |
|  版本锁 | 无，靠人工注意 | SHA-256 自动校验 |
|  隔离 | 无，多变更冲突 | git worktree 强制执行 |

```bash
# 没有 oso：数小时手工配置，每次换机器重来
# 有 oso：
npm install -g @moyaspace/openspec-superpowers-opencode
openspec-superpowers-opencode init my-project
# 以上 6 个鸿沟一次填平
```
