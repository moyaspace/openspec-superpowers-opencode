$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Write-Host "=== C: run with --model + oso-probe plugin ==="
& opencode run --model "routez-ai/glm-5.3-flash" "Call the probe_echo tool with message exactly 'phase-0a-host-check', then reply with only the tool result." 2>&1 | Out-String -Width 250 | Write-Host
Write-Host "EXIT: $LASTEXITCODE"
Write-Host "---- events ----"
if (Test-Path "$p\events.jsonl") { Get-Content "$p\events.jsonl" } else { Write-Host "NO-EVENTS" }
