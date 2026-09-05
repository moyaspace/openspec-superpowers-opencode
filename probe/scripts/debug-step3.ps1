$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json"}'
Write-Host "=== B: run with --model flag ==="
& opencode run --model "routez-ai/glm-5.3-flash" "Reply with exactly: PROBE-OK" 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "EXIT: $LASTEXITCODE"
