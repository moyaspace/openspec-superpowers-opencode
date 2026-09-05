$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"

Write-Host "=== TRY 1: relative path ==="
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json","plugin":["./node_modules/oso-probe"]}'
& opencode run --print-logs --model "routez-ai/glm-5.3-flash" "Say OK" 2>&1 | Out-File -Encoding utf8 "$p\try1.txt"
$hits = Get-Content "$p\try1.txt" | Select-String -SimpleMatch "oso-probe"
Write-Host "oso-probe mentions: $($hits.Count)"
$hits | Select-Object -First 5 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
Write-Host "events: $(if (Test-Path "$p\events.jsonl") { 'YES' } else { 'NO' })"

Write-Host "=== TRY 2: local plugin bridge (.opencode/plugins) ==="
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json"}'
New-Item -ItemType Directory -Force -Path "$p\.opencode\plugins" | Out-Null
Set-Content -Path "$p\.opencode\plugins\oso-probe-bridge.js" -Value 'export { default, osoProbePlugin } from "oso-probe";'
& opencode run --print-logs --model "routez-ai/glm-5.3-flash" "Call the probe_echo tool with message exactly 'phase-0a-host-check', then reply with only the tool result." 2>&1 | Out-File -Encoding utf8 "$p\try2.txt"
$hits2 = Get-Content "$p\try2.txt" | Select-String -SimpleMatch "oso-probe"
Write-Host "oso-probe mentions: $($hits2.Count)"
$hits2 | Select-Object -First 8 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
Write-Host "---- events ----"
if (Test-Path "$p\events.jsonl") { Get-Content "$p\events.jsonl" } else { Write-Host "NO-EVENTS" }
