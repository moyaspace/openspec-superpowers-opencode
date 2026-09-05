$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
if (Test-Path $p) { Remove-Item -Recurse -Force $p }
New-Item -ItemType Directory -Path $p | Out-Null
Set-Content -Path "$p\package.json" -Value '{"name":"debug-host","version":"0.0.0","private":true}'
Set-Content -Path "$p\opencode.json" -Value '{"$schema":"https://opencode.ai/config.json","model":"routez-ai/glm-5.3-flash","plugin":["oso-probe"]}'
Write-Host "project prepared: $p"
& cmd /d /s /c "cd /d $p && npm install L:\moyaspace\oso\openspec-superpowers-opencode\.worktrees\oso-typescript-esm-foundation-and-host-feasibility\probe --no-audit --no-fund" 2>&1 | Select-Object -Last 4
Write-Host "INSTALL_EXIT: $LASTEXITCODE"
Write-Host "pkg-present: $(Test-Path "$p\node_modules\oso-probe\dist\opencode-plugin\index.js")"
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
& opencode run "Reply with exactly: PROBE-OK" 2>&1 | Out-String -Width 300 | Write-Host
Write-Host "RUN_EXIT: $LASTEXITCODE"
Write-Host "---- events ----"
if (Test-Path "$p\events.jsonl") { Get-Content "$p\events.jsonl" } else { Write-Host "NO-EVENTS" }
