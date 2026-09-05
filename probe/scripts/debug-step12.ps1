$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Write-Host "=== run with OPENCODE_LOG_LEVEL=DEBUG ==="
$env:OPENCODE_LOG_LEVEL = "DEBUG"
& opencode run --model "routez-ai/glm-5.3-flash" "Say OK" 2>&1 | Out-String -Width 200 | Write-Host
Remove-Item Env:\OPENCODE_LOG_LEVEL -ErrorAction SilentlyContinue
Write-Host "---- log tail with plugin/error ----"
Get-Content "C:\Users\rloessplateau\.local\share\opencode\log\opencode.log" -Tail 500 | Out-File -Encoding utf8 "$p\logtail.txt"
Get-Content "$p\logtail.txt" | Select-String -SimpleMatch "oso-probe" | Select-Object -First 10 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
Write-Host "---- error lines ----"
Get-Content "$p\logtail.txt" | Select-String -SimpleMatch "level=ERROR" | Select-Object -Last 8 | ForEach-Object { $_.Line.Substring(0, [Math]::Min(300, $_.Line.Length)) }
Write-Host "---- events ----"
if (Test-Path "$p\events.jsonl") { Get-Content "$p\events.jsonl" } else { Write-Host "NO-EVENTS" }
