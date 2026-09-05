$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Write-Host "=== D: plugin list debug ==="
& opencode debug 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "=== E: check config loading with plugin, print what opencode sees ==="
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json","plugin":["oso-probe"]}'
& opencode debug config 2>&1 | Out-String -Width 250 | Write-Host
