$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Location $p
Write-Host "CWD: $PWD"
Write-Host "=== project opencode.json ==="
Get-Content "$p\opencode.json"
Write-Host "=== debug config (probe project) ==="
& opencode debug config 2>&1 | Out-File -Encoding utf8 "$p\debugconfig.txt"
$raw = Get-Content "$p\debugconfig.txt" -Raw
$i = $raw.IndexOf('"plugin"')
if ($i -ge 0) { Write-Host $raw.Substring($i, 500) } else { Write-Host "NO-PLUGIN-KEY" }
$i2 = $raw.IndexOf('"model"')
if ($i2 -ge 0) { Write-Host $raw.Substring($i2, 200) } else { Write-Host "NO-MODEL-KEY" }
