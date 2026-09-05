$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Write-Host "=== STEP 1: no plugin, model specified ==="
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json","model":"routez-ai/glm-5.3-flash"}'
& opencode run "Reply with exactly: PROBE-OK" 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "EXIT: $LASTEXITCODE"
