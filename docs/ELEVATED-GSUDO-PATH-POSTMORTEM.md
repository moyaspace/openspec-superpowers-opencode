# 提权套件 gsudo 路径引号事故复盘

## 背景

`npm test` 的标准链路是：

```
npm run typecheck → npm run build → node --test "test/*.test.js" → node test/elevated/run.mjs
```

最后一步 `test/elevated/run.mjs` 负责运行提权套件（`test/elevated/*.test.js`）。之所以要提权，是因为其中 `shims-installer.elevated.test.js` 需要创建符号链接（Windows 特权操作），另有一个生命周期端到端用例要走 `npm pack → install -g → oso init → registry → reset` 真实链路。

设计目标是：**一次 `npm test`，在任意权限环境下全绿**。具体约定：

- gsudo 可用 → 提权运行 elevated 套件；
- gsudo 不可用 → 打印 `SKIPPED` 并 `exit 0`（**不算失败**）；
- 任一提权用例真的失败 → 非零退出。

`docs/testing.md` 把这个门槛写成「199 主套件 + elevated 套件，一遍全绿（标准 Gate）」。

## 现象

在 **PowerShell（pwsh）** 里执行 `npm test` 或 `node test/elevated/run.mjs`：

```
ELEVATED: running 2 elevated test file(s) via gsudo ...
C:\Program: The term 'C:\Program' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of your name or check if the path is included and verify that the path is correct.
```

退出码 **1** —— 既不是用例失败，也不是 `SKIPPED`，而是编排器压根没把命令拼对。

同一个仓库、同一台机器，**在 cmd 里执行则一切正常**：历史记录（2026-09-06 的 `stage-gate-report.md`）为 `npm test` exit 0、elevated 5/5 pass。

## 根因

### 直接原因：传给 gsudo 的可执行文件路径含空格且未加引号

`test/elevated/run.mjs` 原实现：

```js
const r = spawnSync(
  "gsudo",
  [process.execPath, "--test", ...elevatedFiles],
  { stdio: "inherit", shell: false },
);
```

`process.execPath` 在 Windows 上通常是：

```
C:\Program Files\nodejs\node.exe
```

`spawnSync` 把参数数组原样交给 gsudo 进程，这一点没问题；**问题出在 gsudo 之后怎么把这条命令交给子 shell**。

### 为什么 cmd 绿、PowerShell 红

gsudo 默认会做 **shell 检测**（它自己的 `--help` 明确写着 `-d | --direct  Skip Shell detection. Assume CMD shell or CMD {command}.`）。它会按父环境把命令转交给 cmd 或 PowerShell。

```
父进程 pwsh  → gsudo 用 PowerShell 拼命令行
              → "C:\Program Files\nodejs\node.exe" 未加引号
              → PowerShell 把 C:\Program 当作命令名 → 报错
```

报错措辞可以直接用来判断是哪一层在抱怨：

| 抱怨者 | 措辞 |
|---|---|
| PowerShell | `The term '...' is not recognized as a name of a cmdlet, function, script file, or executable program.` |
| cmd.exe | `'...' is not recognized as an internal or external command, operable program or batch file.`（即 exit code **9009**） |

我们这次看到的是 PowerShell 版本，说明命令被转交给了 PowerShell。

### 注意：这不是权限问题

gsudo 检测成功、提权也成功了，失败发生在「提权后子 shell 解析命令行」这一步。因此不能用「重试 / 换用户 / 关掉 UAC」这类办法绕过。

## 第二个隐性缺陷：提权套件不能并发

`test/elevated/lifecycle-e2e.test.js` 会执行 `npm pack → npm install -g`，**改写全局 openspec 垫片**。如果提权套件内多个文件并发运行，生命周期用例改完垫片后，其他套件对 `openspec` 的调用就会指向临时项目，出现莫名其妙的失败。

所以 elevated 套件必须 **串行** 运行（`--test-concurrency=1`），这跟主套件的并发策略是两回事。

## 为什么「以前都是全绿」

两条原因叠加：

1. `test/elevated/run.mjs` 是 **2026-09-07** 才引入的（提交 `1c73b0a99`），`v1.1.1` 标签（2026-08-10）里根本没有这个文件。更早的「全绿」不包含这一层。
2. 该文件引入后，历史绿记录都来自 **cmd** 环境 —— 引号问题被 cmd 的容错掩盖，直到有人在 **pwsh** 里跑才暴露。

结论：**缺陷从引入起就存在，只是被运行环境掩盖了**，不是某次改动引入的回归。

## 修复

`main`（V2 线）已采用的写法：

```js
console.log(`ELEVATED: running ${elevatedFiles.length} elevated test file(s) via gsudo ...`);
const r = spawnSync(
  "gsudo",
  ["node", "--test", "--test-concurrency=1", ...elevatedFiles],
  { stdio: "inherit", shell: false },
);
```

两处关键改动：

1. **`"node"` 代替 `process.execPath`**
   - `node` 由子 shell 从 PATH 解析，指向同一个可执行文件，但**字符串里没有空格**，gsudo 无论转交给哪个 shell 都不会被切词。
   - 副作用：依赖 PATH 中存在 node（提权 shell 会继承系统 PATH，正常环境满足）。
2. **加 `--test-concurrency=1`**
   - 保证提权套件串行，避免 lifecycle e2e 改写全局垫片污染其他用例。

`release/1.1` 当前仍是旧写法，搬运时注意连注释一起改（原注释写的是 `gsudo node --test test/elevated/*.test.js`，需同步为带 `--test-concurrency=1` 的版本，并补一句「必须串行」的原因）。

## 验证方式

1. **两条 shell 各跑一次**（首次会弹一次 UAC；`gsudo cache on` 可缓存凭据）：
   - cmd：`node test/elevated/run.mjs` → exit 0
   - pwsh：`node test/elevated/run.mjs` → exit 0
2. **无 gsudo 的机器**：输出 `SKIPPED: elevated suite (gsudo not available; ...)` 且 exit 0。
3. **提权被拒绝**：输出 `SKIPPED: elevated suite (gsudo elevation rejected: ...)` 且 exit 0（该分支已有）。
4. 通过后跑一次完整 `npm test`，确认「标准 Gate」恢复全绿。

## 排查清单（下次遇到同类报错）

- 先看报错措辞：`cmdlet` → PowerShell 在抱怨；`internal or external command` / **9009** → cmd 在抱怨。两者都指向「含空格的路径没加引号」。
- 任何传给提权工具（gsudo / sudo / runas）的**绝对路径**，一律假设「会被再拼一次命令行」，要么换成 PATH 名，要么显式加引号。
- 提权套件里只要有用例会改写全局状态（`install -g`、注册垫片、改 PATH），就必须串行，并在文件注释里写清原因。
- 判断「环境问题 vs 回归」的低成本办法：在**未改动**的同版本仓库上复现一次。本次即通过在主仓库 `release/1.1`（HEAD 未变）复现，确认与业务改动无关。
