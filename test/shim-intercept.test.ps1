# shim-intercept.test.ps1 — TDD: 验证垫片正确拦截 openspec list
#
# 这个测试的「生产代码」是 lib/shims/ 中的三个模板文件。
# 
# RED   阶段：当前模板有 bug（哨兵检查永远匹配→垫片始终透传）
#         预期：openspec list 输出来自 openspec-orig（含 "OpenSpec changes directory"）
# GREEN 阶段：修复后模板拦截生效
#         预期：openspec list 输出来自 registry-utils.js（含 "No active changes found."）
#
# 核心检查：输出是否来自 registry-utils.js（拦截成功）vs openspec-orig（透传）

param(
    [string]$ToolDir = "L:\moyaspace\oso\openspec-superpowers-opencode",
    [switch]$UninstallOnly
)

$ErrorActionPreference = "Stop"
$TestDir = "$env:TEMP\ops-tdd-shim-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"

function Cleanup {
    if (Test-Path $TestDir) {
        Remove-Item -Recurse -Force $TestDir -ErrorAction SilentlyContinue
    }
    if (-not $UninstallOnly) {
        & node "$ToolDir\bin\cli.js" uninstall-shims 2>&1 | Out-Null
    }
}

if ($UninstallOnly) {
    & node "$ToolDir\bin\cli.js" uninstall-shims 2>&1
    return
}

try {
    Write-Host "=== 1. 创建测试项目 ==="
    New-Item -ItemType Directory -Force $TestDir | Out-Null
    Set-Location -LiteralPath $TestDir
    git init -b main 2>&1 | Out-Null

    Write-Host "=== 2. 创建注册表条目 ==="
    New-Item -ItemType Directory -Path openspec -Force | Out-Null
    New-Item -ItemType Directory -Path .worktrees\demo-feat -Force | Out-Null
    '{"changes":[{"name":"demo-feat","worktree":".worktrees/demo-feat","createdAt":"2026-07-08T12:00:00.000Z"}]}' |
        Set-Content openspec\oso-change-registry.json -NoNewline

    Write-Host "=== 3. 安装垫片 ==="
    $installResult = & node "$ToolDir\bin\cli.js" install-shims 2>&1
    Write-Host "  $($installResult -join "`n  ")"

    Write-Host "`n=== 4. 测试: openspec list 拦截 ==="
    $listOutput = openspec list 2>&1
    $listText = "$listOutput"
    Write-Host "  openspec list 输出: $listText"

    # 区分 registry-utils 输出 vs openspec-orig 原生输出
    $isIntercepted = $listText -match 'No active changes found'
    $isPassthrough = $listText -match 'No OpenSpec changes'

    if ($isIntercepted) {
        Write-Host "`n  ✅ 测试通过: 垫片已拦截 list（输出来自 registry-utils.js）" -ForegroundColor Green
        $testPassed = $true
    } elseif ($isPassthrough) {
        Write-Host "`n  ❌ 测试失败: 垫片未拦截 list（输出来自 openspec-orig）" -ForegroundColor Red
        $testPassed = $false
    } else {
        Write-Host "`n  ⚠ 无法判断输出来源: $listText" -ForegroundColor Yellow
        $testPassed = $false
    }

    if (-not $testPassed) {
        Write-Host "`n  [TDD-RED] 测试正确失败 — 可以进入 GREEN 阶段修模板" -ForegroundColor Yellow
    } else {
        Write-Host "`n  [TDD-GREEN] 测试通过 — 垫片已在工作" -ForegroundColor Green
    }

    Cleanup
    if ($testPassed) { exit 0 } else { exit 1 }

} catch {
    Write-Host "`n  ✗ 测试执行异常: $_" -ForegroundColor Red
    Cleanup
    exit 2
}
