# tools/check-test-coverage.ps1
# 验证 TESTING.md 与当前代码的同步完整性
#
# 用法:
#   pwsh -NoProfile tools\check-test-coverage.ps1
#   pwsh -NoProfile tools\check-test-coverage.ps1 -ProjectRoot "C:\path\to\project"
#
# exit code: 0 = 全部通过, 1 = 发现问题
#
# 检查项:
#   1. CLI 子命令全覆盖 — 每个 subcommand 在 TESTING.md 中都有对应 Phase
#   2. 过期引用检测 — TESTING.md 中不含已知的旧代码痕迹

param(
    [string]$ProjectRoot = ""
)

if (-not $ProjectRoot) {
    $ProjectRoot = Split-Path $PSScriptRoot -Parent
}

$issues = @()
$cliPath = Join-Path $ProjectRoot "bin\cli.js"
$testingPath = Join-Path $ProjectRoot "docs\TESTING.md"

if (-not (Test-Path $cliPath)) { Write-Host "❌ 未找到 $cliPath" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $testingPath)) { Write-Host "❌ 未找到 $testingPath" -ForegroundColor Red; exit 1 }

$testingContent = Get-Content $testingPath -Raw

# ============================================================
# 1. CLI 子命令覆盖检查
# ============================================================
Write-Host "=== CLI 子命令覆盖检查 ===" -ForegroundColor Cyan

$cliCommands = Select-String -Path $cliPath -Pattern "(?<=subcommand === ')[\w-]+(?=')" -AllMatches |
    ForEach-Object { $_.Matches.Value } | Sort-Object -Unique

foreach ($cmd in $cliCommands) {
    # 在 TESTING.md 中搜索子命令名称
    if ($testingContent -match "(?i)\b$cmd\b") {
        Write-Host "  ✅ $cmd" -ForegroundColor Green
    } else {
        Write-Host "  ❌ '$cmd' 在 TESTING.md 中无对应测试" -ForegroundColor Red
        $issues += "Missing test for command: $cmd"
    }
}

# ============================================================
# 2. 过期引用检测
# ============================================================
Write-Host "`n=== 过期引用检查 ===" -ForegroundColor Cyan

$stalePatterns = @(
    @{ Pattern = "openspec-bridge-install\.json"; Desc = "旧 manifest 文件名" }
    @{ Pattern = "803888f"; Desc = "旧 commit hash" }
    @{ Pattern = "83bab78"; Desc = "旧 commit hash" }
    @{ Pattern = "47ed281"; Desc = "旧 commit hash" }
)

foreach ($sp in $stalePatterns) {
    $m = Select-String -Path $testingPath -Pattern $sp.Pattern -SimpleMatch
    if ($m) {
        # 只报告预期结果中的引用（跳过历史实测记录中的引用）
        $contextLine = $m.Line.Trim()
        if ($contextLine -notmatch '^❌') {  # 实测记录中的旧 hash 在历史数据中，不报
            Write-Host "  ⚠️  过期引用: '$($sp.Pattern)' — $($sp.Desc)" -ForegroundColor Yellow
            $issues += "Stale reference: $($sp.Desc) ($($sp.Pattern))"
        }
    }
}

# ============================================================
# 3. 提取当前 commit 消息供人工核对
# ============================================================
Write-Host "`n=== 当前代码状态 ===" -ForegroundColor Cyan

$commitMsg = Select-String -Path $cliPath -Pattern "commit -m `"([^`"]+)`"" -AllMatches |
    ForEach-Object { $_.Matches.Groups[1].Value } | Select-Object -First 1

if ($commitMsg) {
    Write-Host "  commit 消息: '$commitMsg'" -ForegroundColor Gray
}

# ============================================================
# 汇总
# ============================================================
Write-Host "`n=== 汇总 ===" -ForegroundColor Cyan
if ($issues.Count -eq 0) {
    Write-Host "✅ 所有检查通过" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  发现 $($issues.Count) 个问题:" -ForegroundColor Yellow
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
    Write-Host "`n请更新 TESTING.md 后再执行测试。" -ForegroundColor Yellow
    exit 1
}
