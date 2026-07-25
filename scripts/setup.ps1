# openspec-superpowers-opencode 安装脚本 (Windows)
#
# 参数:
#   -DryRun       预览变更（不实际执行）
#   -Uninstall    卸载（移除清单中记录的已安装文件）

#   -Force        覆盖未受管理的冲突文件
#   -ProjectRoot  项目目标目录（由 CLI 工具调用时指定）
#   -Lang         语言偏好: zh-CN / zh-TW / en（默认）

param(
    [switch]$DryRun,
    [switch]$Uninstall,
    [switch]$Force,
    [string]$ProjectRoot = "",   # 从外部指定项目目录（由 CLI 调用时使用）
    [string]$Lang = "en"         # 语言偏好（默认英文）
)

$ErrorActionPreference = "Stop"

# ---- 棕地覆盖决策记录 ----
$overwriteDecisions = @{}  # 记录 commands/skills 的覆盖决策
# 用于自动化测试的环境变量覆盖（详见 TEST.md Phase 5-6）
$envOverrideOpenspec = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_OPENSPEC")
$envOverrideCommands = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_COMMANDS")
$envOverrideSkills = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_SKILLS")
$envOverrideAgents = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_AGENTS")
$envOverrideGitignore = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_GITIGNORE")
$envOverrideGitattr = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_GITATTR")
$envOverrideEditorconfig = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_EDITORCONFIG")
$envOverrideOcodeJson = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_OCODEJSON")
$envOverrideInit = [System.Environment]::GetEnvironmentVariable("BROWN_OVERRIDE_INIT")

# ---- 多语言辅助函数 ----
function t($zh, $en) {
    if ($Lang -eq "zh-CN" -or $Lang -eq "zh-TW") { return $zh }
    return $en
}

# ---- 帮助 ----
if ($DryRun -and $Uninstall) {
    Write-Host (t "错误: -DryRun 和 -Uninstall 不能同时使用" "Error: -DryRun and -Uninstall cannot be used together") -ForegroundColor Red
    exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templateDir = Join-Path $scriptDir "..\template"

if ($ProjectRoot) {
    $projectRoot = $ProjectRoot
} else {
    $projectRoot = (Get-Item $scriptDir).Parent.FullName
}

# 清单文件（记录实际安装的文件，供 reset 精确卸载）
$manifestFile = Join-Path $projectRoot ".opencode\install-manifest.json"

function log {
    param([string]$msg, [string]$color = "Gray")
    if (-not $DryRun) {
        Write-Host $msg -ForegroundColor $color
    } else {
        Write-Host "[DRY-RUN] $msg" -ForegroundColor $color
    }
}

function run {
    param(
        [scriptblock]$block,
        [string]$description
    )
    if ($DryRun) {
        Write-Host "  [DRY-RUN] $description" -ForegroundColor DarkYellow
        return $null
    }
    return & $block
}

# ---- yes/no/ask 询问函数（用于棕地 commands/skills 覆盖决策）----
function Prompt-YesNoAll {
    param(
        [string]$prompt,
        [string]$envOverride
    )
    # 环境变量覆盖（自动化测试）
    if ($envOverride) {
        if ($envOverride -eq 'yes') { return 'yes' }
        if ($envOverride -eq 'no') { return 'no' }
        if ($envOverride -eq 'ask') { return 'ask' }
        # 无效值：不回退，继续往下走到 Read-Host 交互式询问
    }
    while ($true) {
        $ans = Read-Host "$prompt (yes/No/ask)"
        if ($ans -eq 'y' -or $ans -eq 'Y' -or $ans -eq 'yes') { return 'yes' }
        if ($ans -eq '' -or $ans -eq 'n' -or $ans -eq 'N' -or $ans -eq 'no') { return 'no' }
        if ($ans -eq 'a' -or $ans -eq 'A' -or $ans -eq 'ask') { return 'ask' }
    }
}

# ---- 棕地门控询问函数（用于 openspec/ YES/NO）----
function Prompt-YesNo {
    param(
        [string]$prompt,
        [string]$envOverride
    )
    if ($envOverride) {
        if ($envOverride -eq 'yes') { return 'yes' }
        if ($envOverride -eq 'no') { return 'no' }
        # 无效值：不回退，继续往下走到 Read-Host 交互式询问
    }
    while ($true) {
        $ans = Read-Host "$prompt (y/N)"
        if ($ans -eq 'y' -or $ans -eq 'Y') { return 'yes' }
        if ($ans -eq '' -or $ans -eq 'n' -or $ans -eq 'N') { return 'no' }
    }
}

# ---- 卸载 ----
if ($Uninstall) {
    Write-Host (t "=== 卸载 openspec-superpowers-opencode ===" "=== Uninstall openspec-superpowers-opencode ===") -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Path $manifestFile)) {
        Write-Host (t "✗ 未找到安装清单 ($manifestFile)" "✗ Install manifest not found ($manifestFile)") -ForegroundColor Red
        Write-Host (t "  可能项目未通过此脚本安装，或清单已被删除。" "  The project may not have been installed via this script, or the manifest was deleted.") -ForegroundColor Yellow
        Write-Host (t "  手动删除已部署的文件:" "  Manually delete deployed files:") -ForegroundColor Yellow
        Write-Host ("    .opencode\commands\ (opsx-* " + (t "命令" "commands") + ")") -ForegroundColor Gray
        Write-Host ("    .opencode\skills\openspec-*-change\ (skill " + (t "定义" "definitions") + ")") -ForegroundColor Gray
        Write-Host "    openspec\config.yaml" -ForegroundColor Gray
        Write-Host "    openspec\schemas\ (template + schema)" -ForegroundColor Gray
        Write-Host ("    skills.lock.json (skill " + (t "完整性锁" "integrity lock") + ")") -ForegroundColor Gray
        Write-Host ("    AGENTS.md (bridge " + (t "部分" "content") + ")") -ForegroundColor Gray
        Write-Host ("    opencode.json (permission " + (t "规则" "rules") + ")") -ForegroundColor Gray
        Write-Host (t "  注意: openspec/changes/ + openspec/specs/ 中的用户数据不会被删除" "  Note: User data in openspec/changes/ + openspec/specs/ will not be deleted") -ForegroundColor Yellow
        exit 1
    }

    $manifest = Get-Content $manifestFile -Raw -Encoding utf8 | ConvertFrom-Json
    $removedCount = 0
    $failedCount = 0

    # 受保护文件列表（reset 不碰）
    $protectedFiles = @(
        "opencode.json",
        "AGENTS.md",
        ".gitignore",
        ".gitattributes",
        ".editorconfig"
    )

    # ---- 预览：计算将删除/跳过什么 ----
    $toDelete = @()
    $toSkip = @()
    foreach ($file in $manifest.files) {
        # 检查受保护
        $isProtected = $false
        foreach ($protected in $protectedFiles) {
            if ($file -eq $protected -or $file -like "$protected/*" -or $file -like "$protected\*") {
                $isProtected = $true
                break
            }
            $basename = Split-Path $file -Leaf
            if ($basename -eq $protected) {
                $isProtected = $true
                break
            }
        }
        if ($isProtected) {
            $toSkip += @{ file = $file; reason = "受保护" }
            continue
        }
        $toDelete += $file
    }

    Write-Host (t "=== 重置预览 ===" "=== Reset Preview ===") -ForegroundColor Cyan
    Write-Host (t "将删除 $($toDelete.Count) 个文件/目录:" "Files/dirs to delete ($($toDelete.Count)):") -ForegroundColor Yellow
    foreach ($f in $toDelete) {
        Write-Host "  ✗ $f" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host (t "跳过（保留）$($toSkip.Count) 项:" "Skipped (retained) $($toSkip.Count) items:") -ForegroundColor Gray
    foreach ($s in $toSkip) {
        Write-Host "  - $($s.file) ($($s.reason))" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host (t "用户数据不碰: openspec/changes/, openspec/specs/" "User data untouched: openspec/changes/, openspec/specs/") -ForegroundColor Cyan

    $confirm = Read-Host (t "是否继续重置？(y/N) " "Continue reset? (y/N) ")
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host (t "重置已取消" "Reset cancelled") -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""

    foreach ($file in $manifest.files) {
        # 跳过受保护文件
        $isProtected = $false
        foreach ($protected in $protectedFiles) {
            if ($file -eq $protected -or $file -like "$protected/*" -or $file -like "$protected\*") {
                $isProtected = $true
                break
            }
            # 子目录中的同名文件也匹配（如 .opencode\opencode.json → opencode.json 匹配）
            $basename = Split-Path $file -Leaf
            if ($basename -eq $protected) {
                $isProtected = $true
                break
            }
        }
        if ($isProtected) {
            Write-Host (t "  - $file（受保护，跳过）" "  - $file (protected, skipped)") -ForegroundColor Gray
            continue
        }

        $path = Join-Path $projectRoot $file
        if (Test-Path $path) {
            try {
                if ($file -like "*\*" -or $file -like "*/") {
                    Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
                } else {
                    Remove-Item -Path $path -Force -ErrorAction Stop
                }
                Write-Host (t "  ✗ 已删除: $file" "  ✗ Deleted: $file") -ForegroundColor Red
                $removedCount++
            } catch {
                Write-Host (t "  ⚠ 删除失败: $file ($_)" "  ⚠ Delete failed: $file ($_)") -ForegroundColor Yellow
                $failedCount++
            }
        } else {
            Write-Host (t "  - 不存在: $file" "  - Does not exist: $file") -ForegroundColor Gray
        }
    }

    # 删除清单自身
    Remove-Item $manifestFile -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host (t "=== 卸载完成 ===" "=== Uninstall Complete ===") -ForegroundColor Cyan
    Write-Host (t "已删除: $removedCount 项" "Deleted: $removedCount items") -ForegroundColor White
    if ($failedCount -gt 0) {
        Write-Host (t "失败: $failedCount 项（手动清理）" "Failed: $failedCount items (manual cleanup)") -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host (t "提示: AGENTS.md 和 opencode.json 未重置，请自行处理。" "Hint: AGENTS.md and opencode.json were not reset, handle manually.") -ForegroundColor Yellow
    Write-Host (t "提示: .gitignore 和 .gitattributes 未重置，请自行处理。" "Hint: .gitignore and .gitattributes were not reset, handle manually.") -ForegroundColor Yellow
    exit 0
}

# ---- 主流程 ----
Write-Host (t "=== openspec-superpowers-opencode 安装脚本 ===" "=== openspec-superpowers-opencode Setup ===") -ForegroundColor Cyan
Write-Host ""

$installedFiles = @()  # 记录安装的文件，用于清单

# ---- 0. 检查前提条件 ----
Write-Host (t "[0/8] 检查前提条件..." "[0/8] Checking prerequisites...") -ForegroundColor Yellow

$allPrereqsOk = $true

# openspec CLI
$openspecVer = openspec --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host (t "  ✓ openspec CLI: $openspecVer" "  ✓ openspec CLI: $openspecVer") -ForegroundColor Green
} else {
    Write-Host (t "  ✗ openspec CLI 未找到" "  ✗ openspec CLI not found") -ForegroundColor Red
    $allPrereqsOk = $false
}

# opencode CLI
$opencodeVer = opencode --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host (t "  ✓ opencode CLI: $opencodeVer" "  ✓ opencode CLI: $opencodeVer") -ForegroundColor Green
} else {
    Write-Host (t "  ✗ opencode CLI 未找到" "  ✗ opencode CLI not found") -ForegroundColor Red
    $allPrereqsOk = $false
}

# git
$gitVer = git --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host (t "  ✓ git: $gitVer" "  ✓ git: $gitVer") -ForegroundColor Green
} else {
    Write-Host (t "  ⚠ git 未找到" "  ⚠ git not found") -ForegroundColor Yellow
}

# Superpowers 插件
$superpowersBaseSkills = Get-ChildItem -Path "$env:USERPROFILE\.cache\opencode\packages\superpowers@*" -Recurse -Directory -Filter "skills" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'node_modules[\\/]superpowers[\\/]skills$' } |
    Select-Object -First 1 -ExpandProperty FullName
if ($superpowersBaseSkills) {
    Write-Host (t "  ✓ Superpowers 已安装" "  ✓ Superpowers installed")
} else {
    Write-Host (t "  ✗ Superpowers 尚未安装" "  ✗ Superpowers not installed")
    Write-Host (t "   安装: opencode plugin install superpowers" "   Install: opencode plugin install superpowers")
    $allPrereqsOk = $false
}

if (-not $allPrereqsOk) {
    Write-Host (t "✗ 前提条件未满足" "✗ Prerequisites not met") -ForegroundColor Red
    exit 1
}
Write-Host ""

# ---- 1. 检测 Superpowers 安装路径 ----
Write-Host (t "[1/8] 检测 Superpowers 安装路径..." "[1/8] Detecting Superpowers installation path...") -ForegroundColor Yellow

$superpowersBase = $superpowersBaseSkills

if (-not $superpowersBase) {
    Write-Host (t "✗ 未找到 Superpowers skills 目录" "✗ Superpowers skills directory not found") -ForegroundColor Red
    exit 1
}

Write-Host (t "✓ Superpowers 路径: $superpowersBase" "✓ Superpowers path: $superpowersBase") -ForegroundColor Green
Write-Host ""

# ---- Skill lock 部署 + 校验（WARNING 级别，不阻塞）----

# 部署技能锁文件到项目根目录（版本检测 → 选择模板源 → 复制为 skills.lock.json）
$projectLockFile = Join-Path $projectRoot "skills.lock.json"
$spPkg = Join-Path $superpowersBase "..\package.json"
$lockSourceFile = $null

if (Test-Path $spPkg) {
    $spVersion = (Get-Content $spPkg -Raw -Encoding utf8 | ConvertFrom-Json).version
    $major = $spVersion -replace '\..*'
    $candidateLock = Join-Path $templateDir "skills.lock.v${major}.json"
    if (Test-Path $candidateLock) {
        $lockSourceFile = $candidateLock
        Write-Host (t "  - 检测到 Superpowers v${major}，使用对应锁文件" "  - Detected Superpowers v${major}, using matching lock") -ForegroundColor Gray
    } else {
        Write-Host (t "  - 未找到 skills.lock.v${major}.json" "  - skills.lock.v${major}.json not found") -ForegroundColor Yellow
    }
} else {
    Write-Host (t "  - 未找到 Superpowers package.json" "  - Superpowers package.json not found") -ForegroundColor Yellow
}

# 保底：未匹配到版本锁时，取第一个存在的 skills.lock.v*.json
if (-not $lockSourceFile) {
    $anyVersionLock = Get-ChildItem -Path (Join-Path $templateDir "skills.lock.v*.json") -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($anyVersionLock) {
        $lockSourceFile = $anyVersionLock.FullName
        Write-Host (t "  - 降级到 $($anyVersionLock.Name)" "  - Falling back to $($anyVersionLock.Name)") -ForegroundColor Gray
    }
}

if ($lockSourceFile) {
    # 部署到项目根目录为 skills.lock.json
    run -block {
        $null = New-Item -ItemType Directory -Path (Split-Path $projectLockFile -Parent) -Force
        Copy-Item -Force $lockSourceFile $projectLockFile -ErrorAction Stop
    } -description "部署 skills.lock.json"
    $installedFiles += "skills.lock.json"
    if (-not $DryRun) { Write-Host (t "  ✓ 已部署 skills.lock.json" "  ✓ Deployed skills.lock.json") -ForegroundColor Green }

    # 从项目根目录校验
    $lock = Get-Content $projectLockFile -Raw -Encoding utf8 | ConvertFrom-Json
    $allMatch = $true
    foreach ($skillKey in $lock.skills.PSObject.Properties.Name) {
        $expectedHash = $lock.skills.$skillKey.sha256
        $skillPath = Join-Path $superpowersBase $skillKey.Replace("/", "\")
        if (Test-Path $skillPath) {
            $actualHash = (Get-FileHash $skillPath -Algorithm SHA256).Hash
            if ($actualHash -eq $expectedHash) {
                Write-Host "  ✓ $skillKey" -ForegroundColor Green
            } else {
                Write-Host (t "  ⚠ $skillKey (hash 不匹配，可能已更新)" "  ⚠ $skillKey (hash mismatch, may have been updated)") -ForegroundColor Yellow
                $allMatch = $false
            }
        } else {
            Write-Host (t "  ✗ $skillKey (文件不存在)" "  ✗ $skillKey (file not found)") -ForegroundColor Red
            $allMatch = $false
        }
    }
    if ($allMatch) {
        Write-Host (t "✓ Skill 完整性校验通过" "✓ Skill integrity check passed") -ForegroundColor Green
    } else {
        Write-Host (t "⚠ Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）" "⚠ Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)") -ForegroundColor Yellow
    }
} else {
    Write-Host (t "  - 未找到 lock 文件，跳过校验" "  - Lock file not found, skipping verification") -ForegroundColor Gray
}
Write-Host ""

# ---- 2. openspec/ 门控（棕地：询问 YES/NO；绿地：自动部署）----
Write-Host (t "[2/8] 检测 openspec/ 部署状态..." "[2/8] Checking openspec/ deployment state...") -ForegroundColor Yellow

$openspecConfigDst = Join-Path $projectRoot "openspec\config.yaml"
$openspecHasExisting = Test-Path $openspecConfigDst
$openspecGateResult = "yes"

if ($openspecHasExisting) {
    Write-Host (t "  - openspec/ 已存在 (棕地)" "  - openspec/ already exists (brownfield)") -ForegroundColor Yellow
    $globalAnswer = Prompt-YesNo -prompt (t "  棕地项目。继续完整 init？" "  Brownfield project. Continue with full init?") -envOverride $envOverrideInit
    if ($globalAnswer -eq 'no') {
        Write-Host (t "  Init 取消。" "  Init cancelled.") -ForegroundColor Yellow
        exit 2
    }
    $openspecAnswer = Prompt-YesNo -prompt (t "  覆盖 config.yaml + schemas/？" "  Overwrite config.yaml + schemas/?") -envOverride $envOverrideOpenspec
    if ($openspecAnswer -eq 'no') {
        Write-Host (t "  - 跳过 openspec/ 部署" "  - Skip openspec/ deployment") -ForegroundColor Gray
        $openspecGateResult = "no"
    } else {
        Write-Host (t "  ✓ 用户确认覆盖 openspec/" "  ✓ User confirmed openspec/ overwrite") -ForegroundColor Green
        $openspecGateResult = "yes"
    }
} else {
    Write-Host (t "  - openspec/ 不存在（绿地模式，自动部署）" "  - openspec/ not found (greenfield, auto-deploy)") -ForegroundColor Gray
}
Write-Host ""

# ---- 3. 部署 openspec/（config.yaml + schemas/* + changes/ + specs/）----
Write-Host (t "[3/8] 部署 openspec/ 配置..." "[3/8] Deploying openspec/ config...") -ForegroundColor Yellow

if ($openspecGateResult -eq "yes") {
    # config.yaml（门控已通过，覆盖部署）
    $configSrc = Join-Path $templateDir "openspec\config.yaml"
    $configDst = Join-Path $projectRoot "openspec\config.yaml"
    if (Test-Path $configSrc) {
        run -block {
            $null = New-Item -ItemType Directory -Path (Split-Path $configDst -Parent) -Force
            Copy-Item -Force $configSrc $configDst -ErrorAction Stop
        } -description "复制 openspec/config.yaml"
        $installedFiles += "openspec\config.yaml"
        $overwriteDecisions["openspec\config.yaml"] = "overwrite"
        if (-not $DryRun) { Write-Host (t "  ✓ openspec/config.yaml" "  ✓ openspec/config.yaml") -ForegroundColor Green }
    }

    # schemas/*（Force 部署，记录每文件到 manifest）
    if (Test-Path (Join-Path $templateDir "openspec\schemas")) {
        $schemasTemplateDir = Join-Path $templateDir "openspec\schemas"
        $schemasDstDir = Join-Path $projectRoot "openspec\schemas"
        run -block {
            New-Item -ItemType Directory -Path $schemasDstDir -Force | Out-Null
            Copy-Item -Recurse -Force "$($schemasTemplateDir)\*" "$($schemasDstDir)\"
        } -description "复制 openspec/schemas/"
        # 记录所有复制的文件到 installedFiles
        $schemaFiles = Get-ChildItem -Path $schemasDstDir -Recurse -File -ErrorAction SilentlyContinue
        foreach ($sf in $schemaFiles) {
            $relativePath = $sf.FullName.Substring($projectRoot.Length + 1)
            $installedFiles += $relativePath
            $overwriteDecisions[$relativePath] = "overwrite"
        }
        if (-not $DryRun) { Write-Host (t "  ✓ openspec/schemas/（$(($schemaFiles | Measure-Object).Count) 文件）" "  ✓ openspec/schemas/ ($(($schemaFiles | Measure-Object).Count) files)") -ForegroundColor Green }
    }

    # changes/archive/ + specs/（仅未存在时创建）
    $openspecDst = Join-Path $projectRoot "openspec"
    if (-not $openspecHasExisting) {
        run -block {
            if (-not (Test-Path (Join-Path $openspecDst "changes\archive"))) { New-Item -ItemType Directory -Path (Join-Path $openspecDst "changes\archive") -Force | Out-Null }
            if (-not (Test-Path (Join-Path $openspecDst "specs"))) { New-Item -ItemType Directory -Path (Join-Path $openspecDst "specs") -Force | Out-Null }
        } -description "创建 openspec/changes/ + openspec/specs/"
        if (-not $DryRun) { Write-Host (t "  ✓ openspec/changes/ + openspec/specs/" "  ✓ openspec/changes/ + openspec/specs/") -ForegroundColor Green }
    } else {
        if (-not $DryRun) { Write-Host (t "  - openspec/changes/ + openspec/specs/（棕地模式，跳过）" "  - openspec/changes/ + openspec/specs/ (brownfield, skip)") -ForegroundColor Gray }
    }
}
Write-Host ""

# ---- 辅助函数：按模板 key 顺序序列化 JSON ----
function ConvertTo-CanonicalJson {
    param($Permission, $TemplatePermission, $Indent = 2)

    $nl = "`n"
    $i = { param($n) " " * $n }

    # 获取对象的所有键（兼容 hashtable 和 PSCustomObject）
    function Get-ObjectKeys($obj) {
        if ($null -eq $obj) { return @() }
        if ($obj -is [hashtable]) { return @($obj.Keys) }
        return @($obj.PSObject.Properties.Name)
    }

    # 从模板获取 key 顺序，追加额外 key（用户自定义）
    function Get-OrderedKeys($obj, $tmplKeys) {
        $ordered = @($tmplKeys)
        Get-ObjectKeys $obj | Where-Object { $_ -notin $ordered } | ForEach-Object { $ordered += $_ }
        return $ordered
    }

    $lines = @()
    $lines += "{"
    $lines += "$(&$i 2)`"permission`": {"

    $permKeys = Get-OrderedKeys $Permission $TemplatePermission.PSObject.Properties.Name
    $permCount = $permKeys.Count
    for ($pi = 0; $pi -lt $permCount; $pi++) {
        $key = $permKeys[$pi]
        $val = $Permission.$key
        $comma = if ($pi -lt $permCount - 1) { "," } else { "" }

        # 安全取值：避免 $obj[$key] 在 key 为 * 时被 PowerShell 做通配符匹配
    function SafeGet($obj, $key) {
        if ($null -eq $obj) { return $null }
        if ($obj -is [hashtable]) {
            foreach ($entry in $obj.GetEnumerator()) { if ($entry.Key -eq $key) { return $entry.Value } }
            return $null
        }
        foreach ($prop in $obj.PSObject.Properties) { if ($prop.Name -eq $key) { return $prop.Value } }
        return $null
    }
    if ($key -in "write", "edit" -and $null -ne $val -and $val -isnot [string]) {
            $lines += "$(&$i 4)`"$key`": {"
            $tmplSub = $TemplatePermission.$key
            $subKeys = Get-OrderedKeys $val ($tmplSub.PSObject.Properties.Name)
            $subCount = $subKeys.Count
            for ($si = 0; $si -lt $subCount; $si++) {
                $sk = $subKeys[$si]
                $sv = SafeGet $val $sk
                $scomma = if ($si -lt $subCount - 1) { "," } else { "" }
                $lines += "$(&$i 6)`"$sk`": `"$sv`"$scomma"
            }
            $lines += "$(&$i 4)}$comma"
        } elseif ($key -eq "bash" -and $null -ne $val -and $val -isnot [string]) {
            $lines += "$(&$i 4)`"bash`": {"
            $tmplBash = $TemplatePermission.bash
            $bashKeys = Get-OrderedKeys $val ($tmplBash.PSObject.Properties.Name)
            $bashCount = $bashKeys.Count
            for ($bi = 0; $bi -lt $bashCount; $bi++) {
                $bk = $bashKeys[$bi]
                $bv = SafeGet $val $bk
                $bcomma = if ($bi -lt $bashCount - 1) { "," } else { "" }
                $lines += "$(&$i 6)`"$bk`": `"$bv`"$bcomma"
            }
            $lines += "$(&$i 4)}$comma"
        } else {
            $lines += "$(&$i 4)`"$key`": `"$val`"$comma"
        }
    }

    $lines += "$(&$i 2)}"
    $lines += "}"
    return $lines -join $nl
}

# ---- 4. 部署 .opencode/（opencode.json 合并 + commands/skills y/N/a）----
Write-Host (t "[4/8] 部署 .opencode/ 配置..." "[4/8] Deploying .opencode/ config...") -ForegroundColor Yellow

$opencodeSrc = Join-Path $templateDir ".opencode"
$opencodeDst = Join-Path $projectRoot ".opencode"
if (Test-Path $opencodeSrc) {
    # 确保目标目录存在
    if (-not (Test-Path $opencodeDst)) {
        run -block { New-Item -ItemType Directory -Path $opencodeDst -Force | Out-Null } -description "创建 .opencode/ 目录"
    }

    # opencode.json：棕地合并（union merge）/ 绿地复制
    $ocJsonSrc = Join-Path $opencodeSrc "opencode.json"
    $ocJsonDst = Join-Path $opencodeDst "opencode.json"
    if ((Test-Path $ocJsonSrc) -and (Test-Path $ocJsonDst)) {
        # 棕地：询问是否合并
        $ocJsonOverwrite = Prompt-YesNo -prompt (t "  .opencode\opencode.json 权限顺序是否需要更新为模板标准？选择否将跳过合并" "  .opencode\opencode.json key order — sync to template standard?") -envOverride $envOverrideOcodeJson
        if ($ocJsonOverwrite -eq "no") {
            if (-not $DryRun) { Write-Host (t "  - .opencode\opencode.json（跳过）" "  - .opencode\opencode.json (skipped)") -ForegroundColor Gray }
        } else {
        # 棕地：联合合并
        $userJson = Get-Content $ocJsonDst -Raw -Encoding utf8 | ConvertFrom-Json
        $tmplJson = Get-Content $ocJsonSrc -Raw -Encoding utf8 | ConvertFrom-Json
        # 合并权限：以用户配置为基础，补充 required 路径
        $mergedPermission = @{}
        # 复制用户的所有权限键
        foreach ($key in $userJson.permission.PSObject.Properties.Name) {
            $mergedPermission[$key] = $userJson.permission.$key
        }
        # 补充模板中用户没有的权限键
        foreach ($key in $tmplJson.permission.PSObject.Properties.Name) {
            if (-not $mergedPermission.ContainsKey($key)) {
                $mergedPermission[$key] = $tmplJson.permission.$key
            }
        }
        # 对 write 和 edit：强制插入 required 路径和 deny 规则
        $requiredPaths = @(".worktrees/**", "openspec/changes/**", "openspec/specs/**", ".opencode/**")
        $denyPaths = @("openspec/schemas/**", "openspec/config.yaml")
        foreach ($action in @("write", "edit")) {
            if ($mergedPermission.ContainsKey($action)) {
                $actionObj = $mergedPermission[$action]
                if ($actionObj -is [PSCustomObject]) {
                    $actionHash = @{}
                    # 保留用户已有条目（通过 PSObject.Properties 枚举，避免特殊键名解析问题）
                    foreach ($prop in $actionObj.PSObject.Properties) {
                        $actionHash[$prop.Name] = $prop.Value
                    }
                    # 强制插入 required 路径（allow）
                    foreach ($rPath in $requiredPaths) {
                        $actionHash[$rPath] = "allow"
                    }
                    # 强制插入 deny 规则（保护基础设施文件不被 AI 修改）
                    foreach ($dPath in $denyPaths) {
                        $actionHash[$dPath] = "deny"
                    }
                    # 补充模板中有但用户没有的路径（含空值覆盖）
                    $tmplAction = $tmplJson.permission.$action
                    if ($tmplAction -is [PSCustomObject]) {
                        foreach ($prop in $tmplAction.PSObject.Properties) {
                            if (-not $actionHash.ContainsKey($prop.Name) -or [string]::IsNullOrEmpty($actionHash[$prop.Name])) {
                                $actionHash[$prop.Name] = $prop.Value
                            }
                        }
                    }
                    $mergedPermission[$action] = $actionHash
                }
            }
        }
        # 对 bash：补充模板中有但用户没有的条目
        if ($mergedPermission.ContainsKey("bash") -and $tmplJson.permission.bash) {
            $bashObj = $mergedPermission["bash"]
            $tmplBash = $tmplJson.permission.bash
            if ($bashObj -is [PSCustomObject]) {
                $bashHash = @{}
                foreach ($prop in $bashObj.PSObject.Properties) {
                    $bashHash[$prop.Name] = $prop.Value
                }
                foreach ($prop in $tmplBash.PSObject.Properties) {
                    if (-not $bashHash.ContainsKey($prop.Name) -or [string]::IsNullOrEmpty($bashHash[$prop.Name])) {
                        $bashHash[$prop.Name] = $prop.Value
                    }
                }
                $mergedPermission["bash"] = $bashHash
            }
        }
        # 写出合并结果（按模板 key 顺序，而非 ConvertTo-Json 的字母序）
        $mergedJson = ConvertTo-CanonicalJson -Permission $mergedPermission -TemplatePermission $tmplJson.permission
        if (-not $DryRun) {
            Set-Content -Path $ocJsonDst -Value $mergedJson -NoNewline -Encoding utf8 -ErrorAction Stop
            Write-Host (t "  ✓ .opencode\opencode.json（已合并）" "  ✓ .opencode\opencode.json (merged)") -ForegroundColor Green
            Write-Host (t "    - 工作流所需路径权限已按需设置" "    - Workflow path permissions set as required") -ForegroundColor Gray
            Write-Host (t "    - 用户自定义权限保留在对应块的末尾" "    - User custom permissions placed at the end of each block") -ForegroundColor Gray
            Write-Host (t "    ⚠ 请检查 .opencode\opencode.json 权限是否符合预期" "    ⚠ Verify opencode.json permissions meet expectations") -ForegroundColor Yellow
        }
        }  # end else (merge)
    } elseif (Test-Path $ocJsonSrc) {
        # 绿地：直接复制
        run -block { Copy-Item $ocJsonSrc $ocJsonDst -ErrorAction Stop } -description "复制 .opencode\opencode.json"
        $installedFiles += ".opencode\opencode.json"
        if (-not $DryRun) { Write-Host (t "  ✓ .opencode\opencode.json" "  ✓ .opencode\opencode.json") -ForegroundColor Green }
    }

    # commands/：棕地 y/N/a / 绿地部署
    $cmdSrcDir = Join-Path $opencodeSrc "commands"
    $cmdDstDir = Join-Path $opencodeDst "commands"
    if (Test-Path $cmdSrcDir) {
        $cmdDstExists = Test-Path $cmdDstDir
        if (-not $cmdDstExists) {
            run -block { New-Item -ItemType Directory -Path $cmdDstDir -Force | Out-Null } -description "创建 .opencode\commands/"
        }
        # 检查是否已有文件（棕地）、全部（绿地）
        $hasExistingCmds = $cmdDstExists -and ((Get-ChildItem $cmdDstDir -File | Measure-Object).Count -gt 0)
        $cmdOverwriteMode = "yes"  # 绿地默认全部覆盖
        if ($hasExistingCmds) {
            $cmdOverwriteMode = Prompt-YesNoAll -prompt (t "  .opencode\commands\ 已存在。全部覆盖/跳过/逐个询问？" "  .opencode\commands\ exists. Overwrite all/skip each/ask each?") -envOverride $envOverrideCommands
        }
        foreach ($file in Get-ChildItem $cmdSrcDir -File) {
            $dstPath = Join-Path $cmdDstDir $file.Name
            $shouldOverwrite = $false
            $decision = ""
            if ($cmdOverwriteMode -eq 'yes') {
                $shouldOverwrite = $true
                $decision = "overwrite"
            } elseif ($cmdOverwriteMode -eq 'no') {
                if (-not (Test-Path $dstPath)) {
                    $shouldOverwrite = $true
                    $decision = "overwrite"
                } else {
                    $decision = "skip"
                }
            } else { # 'ask' - 逐个询问
                if (Test-Path $dstPath) {
                    $ans = Read-Host ((t "    覆盖 .opencode\commands\$($file.Name)？" "    Overwrite .opencode\commands\$($file.Name)?") + " (y/N)")
                    if ($ans -eq 'y' -or $ans -eq 'Y') { $shouldOverwrite = $true; $decision = "overwrite" }
                    else { $decision = "skip" }
                } else {
                    $shouldOverwrite = $true
                    $decision = "overwrite"
                }
            }
            if ($shouldOverwrite) {
                run -block { Copy-Item $file.FullName $dstPath -ErrorAction Stop } -description "复制 .opencode\commands\$($file.Name)"
                $installedFiles += ".opencode\commands\$($file.Name)"
                $overwriteDecisions[".opencode\commands\$($file.Name)"] = $decision
                if (-not $DryRun) { Write-Host (t "  ✓ .opencode\commands\$($file.Name)" "  ✓ .opencode\commands\$($file.Name)") -ForegroundColor Green }
            } else {
                if (-not $DryRun) { Write-Host (t "  - .opencode\commands\$($file.Name)（$decision）" "  - .opencode\commands\$($file.Name) ($decision)") -ForegroundColor Gray }
                # 即使跳过也要记录，reset 时不删除
                $overwriteDecisions[".opencode\commands\$($file.Name)"] = $decision
            }
        }
    }

    # skills/：棕地 yes/no/ask / 绿地部署
    $skillSrcDir = Join-Path $opencodeSrc "skills"
    $skillDstDir = Join-Path $opencodeDst "skills"
    if (Test-Path $skillSrcDir) {
        $skillDstExists = Test-Path $skillDstDir
        if (-not $skillDstExists) {
            run -block { New-Item -ItemType Directory -Path $skillDstDir -Force | Out-Null } -description "创建 .opencode\skills/"
        }
        $hasExistingSkills = $skillDstExists -and ((Get-ChildItem $skillDstDir -Directory | Measure-Object).Count -gt 0)
        $skillOverwriteMode = "yes"
        if ($hasExistingSkills) {
            $skillOverwriteMode = Prompt-YesNoAll -prompt (t "  .opencode\skills\ 已存在。全部覆盖/跳过/逐个询问？" "  .opencode\skills\ exists. Overwrite all/skip each/ask each?") -envOverride $envOverrideSkills
        }
        foreach ($skillDir in Get-ChildItem $skillSrcDir -Directory) {
            $srcSkillMd = Join-Path $skillDir.FullName "SKILL.md"
            $dstSkillDirPath = Join-Path $skillDstDir $skillDir.Name
            $dstSkillMd = Join-Path $dstSkillDirPath "SKILL.md"
            if (-not (Test-Path $srcSkillMd)) { continue }
            $shouldOverwrite = $false
            $decision = ""
            $skillExists = Test-Path $dstSkillMd
            if ($skillOverwriteMode -eq 'yes') {
                $shouldOverwrite = $true
                $decision = "overwrite"
            } elseif ($skillOverwriteMode -eq 'no') {
                if (-not $skillExists) {
                    $shouldOverwrite = $true
                    $decision = "overwrite"
                } else {
                    $decision = "skip"
                }
            } else { # 'ask'
                if ($skillExists) {
                    $ans = Read-Host ((t "    覆盖 .opencode\skills\$($skillDir.Name)\SKILL.md？" "    Overwrite .opencode\skills\$($skillDir.Name)\SKILL.md?") + " (y/N)")
                    if ($ans -eq 'y' -or $ans -eq 'Y') { $shouldOverwrite = $true; $decision = "overwrite" }
                    else { $decision = "skip" }
                } else {
                    $shouldOverwrite = $true
                    $decision = "overwrite"
                }
            }
            if ($shouldOverwrite) {
                run -block {
                    if (-not (Test-Path $dstSkillDirPath)) { New-Item -ItemType Directory -Path $dstSkillDirPath -Force | Out-Null }
                    Copy-Item $srcSkillMd $dstSkillMd -ErrorAction Stop
                } -description "复制 .opencode\skills\$($skillDir.Name)\SKILL.md"
                $installedFiles += ".opencode\skills\$($skillDir.Name)\SKILL.md"
                $overwriteDecisions[".opencode\skills\$($skillDir.Name)\SKILL.md"] = $decision
                if (-not $DryRun) { Write-Host (t "  ✓ .opencode\skills\$($skillDir.Name)" "  ✓ .opencode\skills\$($skillDir.Name)") -ForegroundColor Green }
            } else {
                if (-not $DryRun) { Write-Host (t "  - .opencode\skills\$($skillDir.Name)（$decision）" "  - .opencode\skills\$($skillDir.Name) ($decision)") -ForegroundColor Gray }
                $overwriteDecisions[".opencode\skills\$($skillDir.Name)\SKILL.md"] = $decision
            }
        }
    }
}
Write-Host ""

# ---- 5. Git 文件 + AGENTS.md ----
Write-Host (t "[5/8] 部署 Git 配置 + AGENTS.md..." "[5/8] Deploying git config + AGENTS.md...") -ForegroundColor Yellow

    # AGENTS.md
    $agentsSrc = Join-Path $templateDir "_AGENTS.md"
    if (Test-Path $agentsSrc) {
        $agentsDst = Join-Path $projectRoot "AGENTS.md"
        $bridgeContent = Get-Content $agentsSrc -Raw
        if (Test-Path $agentsDst) {
            $existingContent = Get-Content $agentsDst -Raw
            $marker = '<!-- openspec-superpowers-opencode_instructions -->'
            # 必须同时存在开始和结束标记（至少 2 次出现）
            $markerCount = ([regex]::Matches($existingContent, $marker)).Count
            if ($markerCount -ge 2) {
                $answer = Prompt-YesNo -prompt (t "  AGENTS.md 已有 bridge 内容。替换？" "  AGENTS.md already has bridge content. Replace?") -envOverride $envOverrideAgents
                if ($answer -eq 'yes') {
                    $escaped = [regex]::Escape($marker)
                    $pattern = "$escaped[\s\S]*?$escaped"
                    $newContent = $existingContent -replace $pattern, $bridgeContent.TrimEnd()
                    if (-not $DryRun) {
                        Set-Content -Path $agentsDst -Value $newContent -NoNewline -Encoding utf8 -ErrorAction Stop
                    }
                    if (-not $DryRun) { $installedFiles += "AGENTS.md" }
                    Write-Host (t "  ✓ AGENTS.md（bridge 内容已替换）" "  ✓ AGENTS.md (bridge content replaced)") -ForegroundColor Green
                } else {
                    Write-Host (t "  - AGENTS.md（用户选择跳过）" "  - AGENTS.md (user skipped)") -ForegroundColor Gray
                }
            } else {
                # 无标记或仅有一个不完整标记 → 静默追加
                if (-not $DryRun) {
                    Add-Content -Path $agentsDst -Value "`n$bridgeContent" -NoNewline -Encoding utf8
                }
                if (-not $DryRun) { $installedFiles += "AGENTS.md" }
                Write-Host (t "  ✓ AGENTS.md（已追加 bridge 内容）" "  ✓ AGENTS.md (bridge content appended)") -ForegroundColor Green
            }
        } else {
            run -block { Set-Content -Path $agentsDst -Value $bridgeContent -NoNewline -Encoding utf8 } -description "创建 AGENTS.md"
            if (-not $DryRun) {
                $installedFiles += "AGENTS.md"
                Write-Host (t "  ✓ AGENTS.md" "  ✓ AGENTS.md") -ForegroundColor Green
            }
        }
    }

# .gitignore（marker 判定，同 AGENTS.md 模式）
# 注意：不依赖 $gitignoreSrc 是否存在 — 绕过 npm 11.x 下 .npmignore 对嵌套 .gitignore 的异常排除
$gitignoreSrc = Join-Path $templateDir "_gitignore"
$gitignoreDst = Join-Path $projectRoot ".gitignore"
$gitignoreMarker = '# <!-- openspec-superpowers-opencode_gitignore -->'

if (-not (Test-Path $gitignoreDst)) {
    # 绿地：优先从模板复制
    if (Test-Path $gitignoreSrc) {
        run -block { Copy-Item -Force $gitignoreSrc $gitignoreDst -ErrorAction Stop } -description "创建 .gitignore"
        if (-not $DryRun) { Write-Host (t "  ✓ .gitignore" "  ✓ .gitignore") -ForegroundColor Green }
    } else {
        # Fallback: 模板不存在时用 marker 包裹的基础规则创建
        if (-not $DryRun) {
            @"
$gitignoreMarker
# Worktree isolation
.worktrees/
$gitignoreMarker
"@ | Set-Content -Path $gitignoreDst -NoNewline -Encoding utf8
            Write-Host (t "  ✓ .gitignore（fallback 创建）" "  ✓ .gitignore (fallback created)") -ForegroundColor Green
        }
    }
    $installedFiles += ".gitignore"
} else {
    # 棕地：标记判定
    $content = Get-Content $gitignoreDst -Raw
    $markerCount = ([regex]::Matches($content, $gitignoreMarker)).Count
    if ($markerCount -ge 2) {
        # 已有完整桥接标记 → Prompt 替换/跳过
        $answer = Prompt-YesNo -prompt (t "  .gitignore 已有 bridge 内容。替换？" "  .gitignore already has bridge content. Replace?") -envOverride $envOverrideGitignore
        if ($answer -eq 'yes') {
            if (-not $DryRun) {
                $escaped = [regex]::Escape($gitignoreMarker)
                $bridgeContent = Get-Content $gitignoreSrc -Raw -ErrorAction SilentlyContinue
                if ($bridgeContent) {
                    $pattern = "$escaped[\s\S]*?$escaped"
                    $newContent = $content -replace $pattern, $bridgeContent.TrimEnd()
                    Set-Content -Path $gitignoreDst -Value $newContent -NoNewline -Encoding utf8 -ErrorAction Stop
                }
            }
            Write-Host (t "  ✓ .gitignore（bridge 内容已替换）" "  ✓ .gitignore (bridge content replaced)") -ForegroundColor Green
        } else {
            Write-Host (t "  - .gitignore（用户选择跳过）" "  - .gitignore (user skipped)") -ForegroundColor Gray
        }
    } else {
        # 无/不完整标记 → 静默追加
        if (-not $DryRun) {
            $bridgeContent = Get-Content $gitignoreSrc -Raw -ErrorAction SilentlyContinue
            if ($bridgeContent) {
                Add-Content -Path $gitignoreDst -Value "`n$bridgeContent" -NoNewline -Encoding utf8
            }
        }
        Write-Host (t "  ✓ .gitignore（已追加桥接规则）" "  ✓ .gitignore (bridge rules appended)") -ForegroundColor Green
    }
}

# .gitattributes（marker 判定，同 .gitignore 模式）
$gitattrSrc = Join-Path $templateDir "_gitattributes"
$gitattrDst = Join-Path $projectRoot ".gitattributes"
$gitattrMarker = '# <!-- openspec-superpowers-opencode_gitattributes -->'

if (-not (Test-Path $gitattrDst)) {
    # 绿地：从模板复制
    if (Test-Path $gitattrSrc) {
        run -block { Copy-Item -Force $gitattrSrc $gitattrDst -ErrorAction Stop } -description "创建 .gitattributes"
        $installedFiles += ".gitattributes"
        if (-not $DryRun) { Write-Host (t "  ✓ .gitattributes" "  ✓ .gitattributes") -ForegroundColor Green }
    }
} else {
    # 棕地：标记判定
    $content = Get-Content $gitattrDst -Raw
    $markerCount = ([regex]::Matches($content, $gitattrMarker)).Count
    if ($markerCount -ge 2) {
        # 已有完整桥接标记 → Prompt 替换/跳过
        $answer = Prompt-YesNo -prompt (t "  .gitattributes 已有 bridge 内容。替换？" "  .gitattributes already has bridge content. Replace?") -envOverride $envOverrideGitattr
        if ($answer -eq 'yes') {
            if (-not $DryRun) {
                $escaped = [regex]::Escape($gitattrMarker)
                $bridgeContent = Get-Content $gitattrSrc -Raw -ErrorAction SilentlyContinue
                if ($bridgeContent) {
                    $pattern = "$escaped[\s\S]*?$escaped"
                    $newContent = $content -replace $pattern, $bridgeContent.TrimEnd()
                    Set-Content -Path $gitattrDst -Value $newContent -NoNewline -Encoding utf8 -ErrorAction Stop
                }
            }
            Write-Host (t "  ✓ .gitattributes（bridge 内容已替换）" "  ✓ .gitattributes (bridge content replaced)") -ForegroundColor Green
        } else {
            Write-Host (t "  - .gitattributes（用户选择跳过）" "  - .gitattributes (user skipped)") -ForegroundColor Gray
        }
    } else {
        # 无/不完整标记 → 静默追加
        if (-not $DryRun) {
            $bridgeContent = Get-Content $gitattrSrc -Raw -ErrorAction SilentlyContinue
            if ($bridgeContent) {
                Add-Content -Path $gitattrDst -Value "`n$bridgeContent" -NoNewline -Encoding utf8
            }
        }
        Write-Host (t "  ✓ .gitattributes（已追加桥接规则）" "  ✓ .gitattributes (bridge rules appended)") -ForegroundColor Green
    }
}

# .editorconfig（marker 判定，同 .gitignore 模式）
$editorconfigSrc = Join-Path $templateDir "_editorconfig"
$editorconfigDst = Join-Path $projectRoot ".editorconfig"
$editorconfigMarker = '# <!-- openspec-superpowers-opencode_editorconfig -->'

if (-not (Test-Path $editorconfigDst)) {
    # 绿地：从模板复制
    if (Test-Path $editorconfigSrc) {
        run -block { Copy-Item -Force $editorconfigSrc $editorconfigDst -ErrorAction Stop } -description "创建 .editorconfig"
        $installedFiles += ".editorconfig"
        if (-not $DryRun) { Write-Host (t "  ✓ .editorconfig" "  ✓ .editorconfig") -ForegroundColor Green }
    }
} else {
    # 棕地：标记判定
    $content = Get-Content $editorconfigDst -Raw
    $markerCount = ([regex]::Matches($content, $editorconfigMarker)).Count
    if ($markerCount -ge 2) {
        # 已有完整桥接标记 → Prompt 替换/跳过
        $answer = Prompt-YesNo -prompt (t "  .editorconfig 已有 bridge 内容。替换？" "  .editorconfig already has bridge content. Replace?") -envOverride $envOverrideEditorconfig
        if ($answer -eq 'yes') {
            if (-not $DryRun) {
                $escaped = [regex]::Escape($editorconfigMarker)
                $bridgeContent = Get-Content $editorconfigSrc -Raw -ErrorAction SilentlyContinue
                if ($bridgeContent) {
                    $pattern = "$escaped[\s\S]*?$escaped"
                    $newContent = $content -replace $pattern, $bridgeContent.TrimEnd()
                    Set-Content -Path $editorconfigDst -Value $newContent -NoNewline -Encoding utf8 -ErrorAction Stop
                }
            }
            Write-Host (t "  ✓ .editorconfig（bridge 内容已替换）" "  ✓ .editorconfig (bridge content replaced)") -ForegroundColor Green
        } else {
            Write-Host (t "  - .editorconfig（用户选择跳过）" "  - .editorconfig (user skipped)") -ForegroundColor Gray
        }
    } else {
        # 无/不完整标记 → 静默追加
        if (-not $DryRun) {
            $bridgeContent = Get-Content $editorconfigSrc -Raw -ErrorAction SilentlyContinue
            if ($bridgeContent) {
                Add-Content -Path $editorconfigDst -Value "`n$bridgeContent" -NoNewline -Encoding utf8
            }
        }
        Write-Host (t "  ✓ .editorconfig（已追加桥接规则）" "  ✓ .editorconfig (bridge rules appended)") -ForegroundColor Green
    }
}

# ---- 语言文件清理（仅保留英文 + 所选语言，静默执行）----
if (-not $DryRun) {
    $schemaDir = Join-Path $projectRoot "openspec\schemas\superpowers-bridge-opencode"
    $patterns = @()
    if ($Lang -eq "en") {
        $patterns = @("*.zh-CN.*", "*.zh-TW.*")
    } elseif ($Lang -eq "zh-CN") {
        $patterns = @("*.zh-TW.*")
    } else { # zh-TW
        $patterns = @("*.zh-CN.*")
    }
    foreach ($p in $patterns) {
        $files = Get-ChildItem -Path $schemaDir -Recurse -Include $p -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            Remove-Item -Path $f.FullName -Force -ErrorAction SilentlyContinue | Out-Null
            # 静默删除，不输出
        }
    }
} elseif ($DryRun) {
    Write-Host (t "  [DRY-RUN] 清理非首选语言文件" "  [DRY-RUN] Clean non-preferred language files") -ForegroundColor DarkYellow
}

Write-Host (t "✓ 文件复制完成" "✓ File copy complete") -ForegroundColor Green
Write-Host ""

# ---- 6. 替换占位符 ----
Write-Host (t "[6/8] 替换路径占位符..." "[6/8] Replacing path placeholders...") -ForegroundColor Yellow

$replacement = "$superpowersBase\"
$filesToProcess = @(
    "openspec\schemas\superpowers-bridge-opencode\schema.yaml",
    "AGENTS.md",
    ".opencode\commands\opsx-apply.md",
    ".opencode\commands\opsx-finish.md"
)

foreach ($file in $filesToProcess) {
    $filePath = Join-Path $projectRoot $file
    if (Test-Path $filePath) {
        $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue
        if ($content -match '{{SUPERPOWERS_BASE_PATH}}') {
            $newContent = $content -replace '{{SUPERPOWERS_BASE_PATH}}', $replacement
            if (-not $DryRun) {
                $retries = 5
                $written = $false
                while ($retries -gt 0 -and -not $written) {
                    try {
                        Set-Content -Path $filePath -Value $newContent -NoNewline -Encoding utf8 -ErrorAction Stop
                        $written = $true
                    } catch {
                        $retries--
                        if ($retries -eq 0) { throw }
                        Start-Sleep -Milliseconds 200
                    }
                }
            }
            Write-Host (t "  ✓ $file" "  ✓ $file") -ForegroundColor Green
        } else {
            Write-Host (t "  - $file (无占位符)" "  - $file (no placeholder)") -ForegroundColor Gray
        }
    }
}

Write-Host (t "✓ 占位符替换完成" "✓ Placeholder replacement complete") -ForegroundColor Green
Write-Host ""

# ---- 7. 验证 schema ----
Write-Host (t "[7/8] 验证 schema..." "[7/8] Validating schema...") -ForegroundColor Yellow

$schemaResult = $true
if (-not $DryRun) {
    openspec schema validate superpowers-bridge-opencode
    if ($LASTEXITCODE -ne 0) {
        Write-Host (t "✗ Schema 验证失败" "✗ Schema validation failed") -ForegroundColor Red
        $schemaResult = $false
    } else {
        Write-Host (t "✓ Schema 验证通过" "✓ Schema validation passed") -ForegroundColor Green
    }
} else {
    Write-Host "  [DRY-RUN] openspec schema validate superpowers-bridge-opencode" -ForegroundColor DarkYellow
}
Write-Host ""

# ---- 8. 验证工作流 + 写入安装清单 ----
Write-Host (t "[8/8] 验证工作流 + 写入安装清单..." "[8/8] Validating workflow + writing manifest...") -ForegroundColor Yellow

$allOk = $true

if (-not $DryRun) {
    # 8a. 验证模板路径正确解析
    $templatesJson = openspec templates --json --schema superpowers-bridge-opencode 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host (t "✗ 模板解析失败" "✗ Template parsing failed") -ForegroundColor Red
        $allOk = $false
    } else {
        $projectSourceCount = ($templatesJson | Select-String -Pattern '"source": "project"' -AllMatches).Matches.Count
        if ($projectSourceCount -ge 8) {
            Write-Host (t "✓ 模板解析完成（$projectSourceCount 个 project 源模板）" "✓ Template parsing complete ($projectSourceCount project source templates)") -ForegroundColor Green
        } else {
            Write-Host (t "✗ 模板源检测异常（仅 $projectSourceCount 个 project 源）" "✗ Template source anomaly (only $projectSourceCount project sources)") -ForegroundColor Red
            $allOk = $false
        }
    }

    # 8b. 创建测试变更
    $testChangeName = "verify-deploy"
    openspec new change $testChangeName --description "部署验证" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host (t "✗ 测试变更创建失败" "✗ Test change creation failed") -ForegroundColor Red
        $allOk = $false
    } else {
        Write-Host (t "✓ 测试变更已创建" "✓ Test change created") -ForegroundColor Green
    }

    # 8c. 验证变更被正确列出
    if ($allOk) {
        # 尝试 JSON 解析；降级到目录存在检查
        $changeFound = $false
        $changeListRaw = openspec list --json 2>$null | Out-String
        try {
            $changeListObj = $changeListRaw | ConvertFrom-Json
            $changeNames = @($changeListObj.changes | ForEach-Object {
                if ($_ -is [string]) { $_ } else { $_.name }
            })
            $changeFound = $changeNames -contains $testChangeName
        } catch {
            # JSON 解析失败，保留 $false
        }
        if (-not $changeFound) {
            $changeFound = Test-Path "openspec\changes\$testChangeName"
        }
        if (-not $changeFound) {
            Write-Host (t "✗ 变更未被列出" "✗ Change not listed") -ForegroundColor Red
            $allOk = $false
        } else {
            Write-Host (t "✓ 变更列表正常" "✓ Change list OK") -ForegroundColor Green
        }
    }

    # 8d. 验证 artifact 依赖链完整
    if ($allOk) {
        $statusOut = openspec status --change $testChangeName 2>&1
        $artifactCount = ($statusOut | Select-String -Pattern '^\[' -AllMatches).Matches.Count
        if ($artifactCount -ge 8) {
            Write-Host (t "✓ Artifact 链完整（$artifactCount 个）" "✓ Artifact chain complete ($artifactCount)") -ForegroundColor Green
        } else {
            Write-Host (t "✗ Artifact 链不完整（仅 $artifactCount 个）" "✗ Artifact chain incomplete (only $artifactCount)") -ForegroundColor Red
            $allOk = $false
        }
    }

    # 8e. 验证指令生成正常
    if ($allOk) {
        $instructionsOut = openspec instructions brainstorm --change $testChangeName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host (t "✗ 指令生成失败" "✗ Instruction generation failed") -ForegroundColor Red
            $allOk = $false
        } else {
            Write-Host (t "✓ 指令生成正常" "✓ Instruction generation OK") -ForegroundColor Green
        }
    }

    # 8f. 清理测试变更
    Remove-Item "openspec\changes\$testChangeName" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host (t "✓ 测试变更已清理" "✓ Test change cleaned up") -ForegroundColor Green

    if ($allOk) {
        Write-Host (t "✓ OpenSpec 工作流验证通过" "✓ OpenSpec workflow validation passed") -ForegroundColor Green
    } else {
        Write-Host (t "✗ OpenSpec 工作流验证失败" "✗ OpenSpec workflow validation failed") -ForegroundColor Red
    }
} else {
    Write-Host (t "  [DRY-RUN] 跳过验证（--dry-run 模式）" "  [DRY-RUN] Skipping validation (--dry-run mode)") -ForegroundColor DarkYellow
}
Write-Host ""
Write-Host ""

# ---- 完成 ----

if (-not $DryRun) {
    $manifest = @{
        project = "openspec-superpowers-opencode"
        installedAt = (Get-Date -Format "o")
        language = $Lang
        opencodeVersion = if ($opencodeVer) { "$opencodeVer".Trim() } else { "unknown" }
        superpowersPath = $superpowersBase
        files = $installedFiles | Sort-Object -Unique
        overwriteDecisions = $overwriteDecisions
    }
    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    Set-Content -Path $manifestFile -Value $manifestJson -NoNewline -Encoding utf8 -ErrorAction Stop
    Write-Host (t "✓ 安装清单已写入: .opencode\install-manifest.json" "✓ Install manifest written: .opencode\install-manifest.json") -ForegroundColor Green
    Write-Host (t "  已记录 $($installedFiles.Count) 个文件" "  $($installedFiles.Count) files recorded") -ForegroundColor Gray
    if ($overwriteDecisions.Count -gt 0) {
        Write-Host (t "  已记录 $($overwriteDecisions.Count) 项覆盖决策" "  $($overwriteDecisions.Count) overwrite decisions recorded") -ForegroundColor Gray
    }
} else {
    Write-Host (t "  [DRY-RUN] 跳过的操作:" "  [DRY-RUN] Skipped operations:") -ForegroundColor DarkYellow
    Write-Host ("    - " + (t "写入安装清单 .opencode\install-manifest.json" "Write install manifest .opencode\install-manifest.json")) -ForegroundColor Gray
    Write-Host ("    - " + (t "所有文件复制操作" "All file copy operations")) -ForegroundColor Gray
    Write-Host "    - openspec schema validate" -ForegroundColor Gray
    Write-Host ("    - " + (t "OpenSpec 工作流验证" "OpenSpec workflow validation")) -ForegroundColor Gray
}
Write-Host ""

# ---- 完成 ----
if (-not $DryRun) {
    Write-Host (t "=== 安装完成 ===" "=== Installation Complete ===") -ForegroundColor Cyan
    if (-not $schemaResult) {
        Write-Host (t "⚠ Schema 验证失败。请修复后重新运行 setup 脚本。" "⚠ Schema validation failed. Fix and re-run setup script.") -ForegroundColor Yellow
    } elseif (-not $allOk) {
        Write-Host (t "⚠ 工作流验证未完全通过。请检查上方错误信息。" "⚠ Workflow validation incomplete. Check errors above.") -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host (t "下一步：" "Next steps:") -ForegroundColor White
    Write-Host (t "  0. 快速开始指南在安装目录 docs/QUICKSTART.md" "  0. Quick start guide at docs/QUICKSTART.md in installation directory") -ForegroundColor Gray
    Write-Host (t "  1. /opsx-ff <功能名> 创建第一个变更，或" "  1. /opsx-ff <feature-name> to create your first change, or") -ForegroundColor Gray
    Write-Host (t "  2. /opsx-onboard 进行引导式入门" "  2. /opsx-onboard for guided onboarding") -ForegroundColor Gray
    Write-Host ""
    Write-Host (t "重置： openspec-superpowers-opencode reset" "Reset: openspec-superpowers-opencode reset") -ForegroundColor Gray
    Write-Host (t "预览： openspec-superpowers-opencode dry-run" "Preview: openspec-superpowers-opencode dry-run") -ForegroundColor Gray
}
