# 全局垫片被测试改坏事故复盘（并行专属 9009）

## 背景

`npm test` 的标准链路：

```
npm run typecheck → npm run build → node --test "test/*.test.js" → node test/elevated/run.mjs
```

主套件用 Node 默认并行（每个测试文件一个子进程）。本仓库同时是一个「会安装全局垫片」的工具：`oso init` 与包自身的 `install` 脚本都会调用 `installShims()`，把 `openspec` 换成一条转接到 oso 的垫片，并保留原始命令为 `openspec-orig`。

问题就出在这两件事的交汇处：**测试会真的执行安装逻辑，而安装逻辑写的是机器全局目录**。

## 现象

`node --test "test/*.test.js"`（并行）有 2 条用例随机失败，且每次失败的用例可能不同（第一次 `new change`、第二次 `instructions`）：

```
✖ openspec new change applies OSO schema to the change
  AssertionError: new change failed:
  - Creating change 'oso-cli-integration-check'...
    ✔ Created change 'oso-cli-integration-check' at openspec/changes/... (schema: superpowers-bridge-opencode)
    'o-template-base-branch' is not recognized as an internal or external command,
    operable program or batch file.
  9009 !== 0
```

几个关键特征：

- 报错发生在**创建已经成功之后**，且失败信息的尾巴固定是 `o-template-base-branch` —— 正是本 worktree 目录名 `...\.worktrees\oso-template-base-branch` 去掉 `\os` 之后的部分。
- 同一套件**串行跑必绿**（`--test-concurrency=1`）。
- 完整输出里 artifact 内容出现**两次**，`- Generating instructions...` 也出现两次。
- 退出码是 **9009**（cmd.exe 的「命令不存在」）。

## 根因

### 最小复现

```powershell
node --test "test/create-project.behavior.test.js" "test/openspec-cli-integration.test.js"
```

稳定复现 9009；加 `--test-concurrency=1` 即消失。

### 因果链

1. `test/create-project.behavior.test.js` 的第二个用例用真实 CLI 跑 `init`，且没有注入 `shimDeps`。
2. `init` 走到 `ensureShim(resolveToolRoot(), {})` → 真实 `installShims()`。
3. `installShims()` 用 `where openspec` 定位 bin 目录 → 命中**机器全局** `C:\Program Files\nodejs`。
4. `installShimScripts()` 对目标文件做 `unlinkSync` + `writeFileSync`（原地替换），把 96 字节的上游 `openspec.cmd` 换成 636 字节的垫片；垫片第 3 行是 `set TOOL_DIR=<worktree 路径>`。
5. 与此同时，另一个测试 `test/openspec-cli-integration.test.js` 正在用 `cmd.exe /d /s /c openspec ...` 执行**同一个** `openspec.cmd`。上游 openspec 在本机很慢（7–22 秒），窗口足够大。
6. 子进程返回后，`cmd.exe` 按**旧文件的字节偏移**继续读取同一路径。此时文件已被换掉，偏移落在新文件第 3 行中间 —— `...\.worktrees\os|o-template-base-branch` —— 于是把 `o-template-base-branch` 当命令执行 → 9009。
7. 接着 cmd 读到垫片的自愈块：本次执行从未跑过第 3 行，`%TOOL_DIR%` 为空 → 自愈成立 → 把 `openspec-orig.cmd` 恢复成 `openspec.cmd`，并再次执行上游 CLI（这解释了输出重复）。但 `exit /b %errorlevel%` 在块解析期展开，仍是前面残留的 9009 —— 所以**实际上第二次执行成功了，退出码却还是失败**。

### 为什么只在并行出现

需要「另一个进程在 `cmd.exe` 执行 `.cmd` 的中途原地替换该文件」。串行时没有任何测试会在那 7–22 秒窗口内改写全局 bin，因此永不触发。`--test-concurrency=1` 只是把窗口错开，**不解决测试污染机器全局状态这个真正的问题**。

### 为什么尾巴固定是 `o-template-base-branch`

垫片的 `TOOL_DIR` 就是发起安装的包的根目录。测试从当前 checkout 发起，于是路径里嵌了本 worktree 名；换一个 checkout 就会换成另一个目录名。看起来「只有这个 worktree 有问题」是错觉。

## 另外两个同类污染源

用「跑单个文件、前后对比全局 `openspec.ps1`」扫描了 30 个测试文件，发现**三个**会写全局 bin：

| 测试 | 触发方式 |
|---|---|
| `test/create-project.behavior.test.js` | 真跑 `init` → `ensureShim` → `installShims` |
| `test/imp16-tarball-equivalence.test.js` | `npm install <tarball>` 触发包自己的 `install` 生命周期脚本 |
| `test/elevated/lifecycle-e2e.test.js` | `npm install` 的 postinstall + `oso init` |

> 后续变化（`retire-install-hook` 变更）：npm `install` 生命周期钩子已退役，`test/imp16-tarball-equivalence.test.js` 已删除；现在唯一的触发路径是 `oso init` 的 `ensureShim` 与 `oso install-shims`。上文为事故当时的事实记录，保留原样。

后果不只是「随机 9009」：这些测试跑完后，全局 `openspec.ps1` 会指向**已被删除的临时项目**，开发机上从此 `openspec` 处于半坏状态（cmd 下正常，PowerShell 下走自愈或报错）。

## 顺带发现的真 bug：ps1 垫片在 Windows PowerShell 5.1 下报错

```powershell
# 5.1 报 "A positional parameter cannot be found that accepts argument 'registry-utils.js'"
$healthCheck = Join-Path $TOOL_DIR "dist" "registry-utils.js"
```

`Join-Path` 只接受一个位置参数 `-ChildPath`；`-AdditionalChildPath` 是 pwsh 6+ 才有。pwsh 7 能容忍多给的 positional，5.1 不能，于是 `$healthCheck` 为 `$null`，紧接着 `Test-Path` 再报一次。功能上仍能回落到上游 CLI，但每次都会刷两段红字。

修复：嵌套调用。

```powershell
$healthCheck = Join-Path (Join-Path $TOOL_DIR "dist") "registry-utils.js"
$rutilsJs   = Join-Path (Join-Path $TOOL_DIR "dist") "registry-utils.js"
```

## 修复

### 1. 测试隔离 PATH（三处）

给会触发安装逻辑的 spawn 前置一个临时 bin 目录，并放一个 `openspec` 进去：

- `create-project.behavior.test.js`、`imp16-tarball-equivalence.test.js`：放 **dummy**（只要求 `where openspec` 命中临时目录）。
- `test/elevated/lifecycle-e2e.test.js`：放**真实 openspec 的副本**。原因：`init` 内部会用 `openspec` 做验证，dummy 什么都不输出会让 init 失败；而垫片会把这份副本备份成 `openspec-orig` 并回落到它，所以必须是能真正工作的可执行文件。

效果：`installShims` 的 `where openspec` 只命中临时目录，全局 bin 零副作用；同时仍然完整执行真实的 install-shims 逻辑（没有靠 `--ignore-scripts` 绕过）。

### 2. ps1 的 `Join-Path` 嵌套

见上。`assets/shims/openspec.ps1` 两处。

### 3. 已经坏掉的机器怎么恢复

```powershell
oso install-shims
```

它会重新定位 bin、备份原始 `openspec`、重写 `.cmd`/`.ps1`。验证后 `TOOL_DIR` 指向当前 oso 安装目录、`openspec-orig.cmd` 存在、cmd 与 pwsh 下 `openspec --version` 都正常。

## 验证

| 检查 | 结果 |
|---|---|
| 最小复现（create-project + integration） | 5/5 pass |
| imp16 + integration | 4/4 pass |
| 全量并行 `node --test "test/*.test.js"` | 266/266 pass |
| `npm test`（build + 主套件 + elevated） | 266 + 5 全绿，exit 0 |
| 测试前后全局 bin 的 SHA-256 | 完全不变 |
| `.ps1` 嵌套写法 | Windows PowerShell 5.1 与 pwsh 7 均正常 |

## 排查清单（下次遇到同类）

- 报错措辞定位层级：`cmdlet` → PowerShell 在抱怨；`internal or external command` / **9009** → cmd 在抱怨。
- 见到「命令已经成功执行，但退出码非零」：优先怀疑**自愈/重试块**把旧的 errorlevel 带了出来（`exit /b %errorlevel%` 会在块解析期展开）。
- 见到「报错里只有某个路径的后半段」：典型是**含空格或长路径未被引号包裹**，或被别的进程**原地替换**了正在被 shell 读取的脚本。
- 任何测试只要会执行 `init` / `npm install`（带生命周期脚本）/ 安装垫片，就必须**隔离 PATH 或目录**；否则它写的是开发机的全局状态，不是临时目录。
- 给「测试不得污染机器」加一条低成本检查：跑测试前后对比全局 bin 的哈希（本次排查就是这么定位三个污染源的）。
- 串行只是让竞态窗口不重叠，属于掩盖；不要用 `--test-concurrency=1` 代替隔离。
