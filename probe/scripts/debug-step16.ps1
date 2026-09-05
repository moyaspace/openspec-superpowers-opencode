$ErrorActionPreference = "Continue"
$p = "$env:TEMP\oso-debug-hostprobe2"
Set-Location $p
$env:OSO_PROBE_EVENT_LOG = "$p\events.jsonl"
if (Test-Path "$p\events.jsonl") { Remove-Item "$p\events.jsonl" }
Set-Content -Path "$p\.opencode\plugins\oso-probe-bridge.js" -Value 'import { osoProbeTypedPlugin } from "oso-probe/plugin/typed"; export { default } from "oso-probe/plugin/typed"; export const osoProbePlugin = osoProbeTypedPlugin;'
& opencode run --model "routez-ai/glm-5.3-flash" "Call the probe_typed_echo tool with message exactly 'phase-0a-typed-check', then reply with only the tool result." 2>&1 | Out-String -Width 220 | Write-Host
Write-Host "---- key events ----"
if (Test-Path "$p\events.jsonl") {
  $events = Get-Content "$p\events.jsonl" | ForEach-Object { $_ | ConvertFrom-Json }
  $events | Where-Object type -eq 'tool-call' | ForEach-Object { $_ | ConvertTo-Json -Compress }
  Write-Host "plugin-called: $(($events | Where-Object type -eq 'plugin-called').Count)"
} else { Write-Host "NO-EVENTS" }
