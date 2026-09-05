$ErrorActionPreference = "Continue"
$probePkg = "L:\moyaspace\oso\openspec-superpowers-opencode\.worktrees\oso-typescript-esm-foundation-and-host-feasibility\probe"
$p = "$env:TEMP\oso-debug-hostprobe2"
& cmd /d /s /c "cd /d $probePkg && npm pack --pack-destination $p" 2>&1 | Out-Null
$tgz = Get-ChildItem $p -Filter "oso-probe-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host "tgz: $($tgz.FullName)"
& cmd /d /s /c "cd /d $p && npm install $($tgz.FullName) --no-audit --no-fund --force" 2>&1 | Select-Object -Last 2
$installedExports = Get-Content "$p\node_modules\oso-probe\package.json" -Raw | ConvertFrom-Json
Write-Host "installed exports '.': $($installedExports.exports.'.'.default)"
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
$longTemp = [System.IO.Path]::GetFullPath("$env:TEMP\oso-debug-hostprobe2")
$pluginUrl = "file:///" + ($longTemp -replace '\\', '/') + "/node_modules/oso-probe"
Set-Content -Path "$p\opencode.json" -Value ('{"$schema":"https://opencode.ai/config.json","plugin":["' + $pluginUrl + '"]}')
Write-Host "PLUGIN_URL: $pluginUrl"
& opencode run --model "routez-ai/glm-5.3-flash" "Call the probe_echo tool with message exactly 'phase-0a-host-check', then reply with only the tool result." 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "RUN_EXIT: $LASTEXITCODE"
Write-Host "---- events ----"
if (Test-Path "$p\events.jsonl") { Get-Content "$p\events.jsonl" } else { Write-Host "NO-EVENTS" }
