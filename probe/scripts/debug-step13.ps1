$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
& opencode run --print-logs --log-level DEBUG --model "routez-ai/glm-5.3-flash" "Say OK" 2>&1 | Out-File -Encoding utf8 "$p\runlog.txt"
Get-Content "$p\runlog.txt" | Select-String -SimpleMatch "oso-probe" | Select-Object -First 15 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(320, $_.Line.Length)) }
Write-Host "---- plugin lines ----"
Get-Content "$p\runlog.txt" | Select-String -SimpleMatch "plugin" | Select-Object -First 25 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(320, $_.Line.Length)) }
