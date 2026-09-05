$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json"}'
Write-Host "=== A: opencode models (list) ==="
& opencode models 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "MODELS_EXIT: $LASTEXITCODE"
