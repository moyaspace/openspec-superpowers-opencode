## Design Summary

本 change 同时收口三件事，它们都落在「安装生命周期 + CLI 输出层 + 发版测试线」这一条链上：

1. **GAP006**：删除 `package.json` 的 `install` 生命周期钩子与 `scripts/shims-installer.mjs`，改用 `prepare` 在源目录承载构建；`dist/` 移出 git 跟踪，由 `prepare` 在 `npm pack` / `npm publish` 前现编；CI 增加两条守卫，防止产物回潮与构建写脏工作区。
2. **GAP007**：删除 V2 迁移的一次性验收测试 `test/imp16-tarball-equivalence.test.js`，把它独有的两条断言（ps1 shim 不得引用旧 `lib` 路径、tarball 不得含 `src/` 与 `tsconfig.json`）迁入 `ci.yml` 的 tarball 内容检查。
3. **F003**：帮助与报错中的命令指引统一为 `oso ...`；`create-openspec-superpowers-opencode` 的用法行保留自己的名字，但「等同于」改为 `oso init <target-dir>`；新增子命令级 `--help`，且必须在任何副作用之前短路。

设计基石是已实测的 npm 生命周期矩阵：

| 场景 | install | postinstall | prepare | prepack |
|---|---|---|---|---|
| 源仓库 `npm ci` | 跑 | 跑 | 跑 | — |
| 源仓库 `npm pack` / `publish` | — | — | 跑 | 跑 |
| tarball 装进别的项目 | 跑 | 跑 | **不跑** | **不跑** |
| npm 12 装 tarball（未 approve） | **blocked** | **blocked** | **blocked** | — |

结论：`prepare` / `prepack` 只在源目录执行，可安全承载构建；`install` / `postinstall` 会在用户机器执行，不能承载构建。删除钩子后包变成零生命周期脚本，npm 12 不再拦截。

## Alternatives Considered

### 方案 A：保留 `install` 钩子，把 `installShims` 自包含为纯 JS

- **做法**：把 `src/shims-installer.ts` 的运行时逻辑复制/移植进 `scripts/shims-installer.mjs`，让它只依赖 Node 内置模块，不再静态 `import '../dist/shims-installer.js'`。`dist/` 可继续留在 git 或移出。
- **优点**：安装即生效，用户无需额外执行命令；与既有行为最接近。
- **缺点**：同一套垫片安装逻辑出现两份实现（TS 源 + 纯 JS 脚本），长期必然漂移；npm 12 仍会拦截带生命周期脚本的包，用户仍要 `--allow-scripts` 才能生效；npm 官方提示命令本身还有 bug。
- **为何未采用**：只解决「`dist/` 循环依赖」，没有解决「npm 平台正在淘汰安装钩子」这个根本问题。用户裁决（2026-11-03）明确走删除钩子路线。

### 方案 B：删除钩子 + `prepare` 构建 + `dist/` 移出 git（采用）

- **做法**：删除 `scripts.install` 与 `scripts/shims-installer.mjs`；增加 `scripts.prepare = "npm run build"`；`.gitignore` 加 `dist/` 并 `git rm -r --cached dist`；`files` 仍保留 `dist/`；`oso init` 的 `ensureShim` 成为垫片安装的唯一生效路径。
- **优点**：零生命周期脚本，npm 12 完全无感；源码与产物的关系恢复单向（源码 → 构建 → tarball）；干净 clone 的 `npm ci` 先跑 `prepare` 再成功；worktree 内 `npm ci` 不再污染全局垫片。
- **缺点**：安装后不再自动装垫片，必须执行 `oso init`；这会把「垫片写全局 bin 需要权限」的问题第一次暴露给用户（需要配套的权限提示与原子替换）。
- **为何胜出**：同时消除循环依赖与平台淘汰风险；权限暴露由本 change 的必改点 5 一并收口。

### 方案 C：保留钩子，但把构建放到 `postinstall` / `prepack`

- **做法**：`postinstall: npm run build`，或依赖 `prepack` 在打包前构建。
- **优点**：看起来能让「安装后就有 dist」。
- **缺点**：`postinstall` 会在**用户机器**上执行构建，既拖慢安装、又要求用户机器具备 devDependencies（本包用户不应安装 TypeScript），且 npm 12 同样 blocked；`prepack` 只在 pack/publish 时执行，无法解决干净 clone 的 `npm ci`。
- **为何未采用**：违反「构建只在源目录发生」这一硬约束，且 npm 12 下不可用。

## Agreed Approach

采用**方案 B**：

- 删除 `install` 钩子与 `scripts/shims-installer.mjs`，`package.json` 不含 `preinstall` / `install` / `postinstall`。
- 新增 `"prepare": "npm run build"`，只在源目录执行构建。
- `dist/` 移出 git（保留磁盘文件与 `files` 中的 `"dist/"`），tarball 由 `prepare` 在 pack 前现编。
- `oso init` 的垫片自检失败不再中止：记录 `shimSkipped`，继续走完 8/8，结尾输出醒目的 banner，含实际 binDir、失败原因与可照抄命令；init 仍 exit 0。
- `installShims` 在 `EACCES` / `EPERM` 时给出 binDir 与可照抄命令；垫片写入改为「临时文件 + 原子替换」；`setExecutable` 不再静默吞错。
- 删除 `test/imp16-tarball-equivalence.test.js`，两条独有断言迁入 CI。
- 帮助与报错统一用 `oso`，新增子命令级 `--help`（副作用前短路）。

## Key Decisions

1. **走删除钩子路线**，不选「把 installShims 自包含为纯 JS 保留钩子」（用户裁决 2026-11-03）。
2. **`dist/` 移出 git**：产物由 `prepare` 现编，tarball 仍含 `dist/`。
3. **GAP007 并入本 change**：`IMP-16` 属 V2 专属编号，不应出现在 V1 发版线；不与发布任务 T005 混。
4. **`oso init` 不因垫片失败而中止**：跳过 → 继续完成 init → 结尾统一提示。此条取代 `BUG004` 关闭条件中「失败即明确中止」的表述；`BUG004` 的核心结论「init 会自检并修复垫片」不变。
5. **Windows 的 gsudo 只作静态文案选项提示**，不做存在性检测；`gsudo oso install-shims` 是备选，不是唯一方式。
6. **不自动提权**：程序不调用 sudo、不弹 UAC，只检测并提示。
7. **`scripts/run-tests.mjs` 的 `restoreGlobalShim()` 本 change 不动**：删钩子后源头虽消失，但仍有测试主动调用真实 `installShims()`，隔离是否完全覆盖未验证；冗余判定与退役登记为 GAP008，不进本 Sprint。
8. **F003 只改用户可见命令指引**：`manifest.ts` 的 `project` 字段、`planner.ts` 的四个 marker、`reset.ts` 的项目名校验一个字符都不动；长命令解析路径不动。
9. **测试计数预期 318 → 317**（删除 imp16 的 1 条 `test()`）；若减少更多，视为静默少收集，必须排查。

## Open Questions

无。所有方案与边界均由用户于 2026-11-03 裁决；实现阶段按 tasks.md 与 plan.md 执行即可。

以下事项已明确**不在本 change 范围**：

- `package.json` 的 `version`（T005 Step 2）与 `CHANGELOG.md`（T005 Step 3）。
- `scripts/run-tests.mjs` 的 `restoreGlobalShim()` 退役（GAP008）。
- 除 `test/imp16-tarball-equivalence.test.js` 外的其他 V2 遗留测试（发现可疑文件只记 GAP，不顺手删）。
- 自动提权、gsudo 存在性检测。
