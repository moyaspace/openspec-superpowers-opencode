$ErrorActionPreference = "Continue"
$probePkg = "L:\moyaspace\oso\openspec-superpowers-opencode\.worktrees\oso-typescript-esm-foundation-and-host-feasibility\probe"
$p = "$env:TEMP\oso-debug-hostprobe2"
& cmd /d /s /c "cd /d $probePkg && npm run typecheck && npm run build" 2>&1 | Out-Null
Write-Host "TYPECHECK+BUILD done"
& cmd /d /s /c "cd /d $probePkg && npm pack --pack-destination $p" 2>&1 | Out-Null
$tgz = Get-ChildItem $p -Filter "oso-probe-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
& cmd /d /s /c "cd /d $p && npm install $($tgz.FullName) --no-audit --no-fund --force" 2>&1 | Select-Object -Last 1
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Write-Host "=== chat.message hook probe ==="
& opencode run --model "routez-ai/glm-5.3-flash" "Call the probe_echo tool with message exactly 'phase-0a-host-check', then reply with only the tool result." 2>&1 | Out-String -Width 220 | Write-Host
Write-Host "RUN_EXIT: $LASTEXITCODE"
Write-Host "---- key events ----"
if (Test-Path "$p\events.jsonl") {
  $events = Get-Content "$p\events.jsonl" | ForEach-Object { $_ | ConvertFrom-Json }
  Write-Host "chat.message hooks: $(($events | Where-Object type -eq 'chat-message-hook').Count)"
  $events | Where-Object type -eq 'chat-message-hook' | ForEach-Object { $_ | ConvertTo-Json -Compress }
  Write-Host "tool.execute.after hooks: $(($events | Where-Object type -eq 'tool-execute-after-hook').Count)"
  Write-Host "tool-calls: $(($events | Where-Object type -eq 'tool-call').Count)"
  Write-Host "plugin-init: $(($events | Where-Object type -eq 'plugin-init').Count)"
  Write-Host "session.idle seen: $(($events | Where-Object { $_.type -eq 'host-event' -and $_.name -eq 'session.idle' }).Count)"
} else { Write-Host "NO-EVENTS" }
