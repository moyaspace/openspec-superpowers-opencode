# openspec shim for oso registry
$TOOL_DIR = "{{TOOL_DIR}}"

# Self-heal: package was removed, restore original openspec and clean up
$healthCheck = Join-Path $TOOL_DIR "lib" "registry-utils.js"
if (-not (Test-Path $healthCheck)) {
    $here = Split-Path -Parent $PSCommandPath
    $origCmd = Join-Path $here "openspec-orig.cmd"
    if (Test-Path $origCmd) {
        Move-Item $origCmd (Join-Path $here "openspec.cmd") -Force -ErrorAction SilentlyContinue
    }
    # Self-destruct: our .ps1 shim is no longer needed
    Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
    & (Join-Path $here "openspec.cmd") @args
    exit $LASTEXITCODE
}

if ($null -ne $TOOL_DIR -and $TOOL_DIR -ne "") {
    if ($args[0] -eq "list") {
        $rutilsJs = Join-Path $TOOL_DIR "lib" "registry-utils.js"
        & node $rutilsJs @args
        exit $LASTEXITCODE
    }
}

& openspec-orig @args
exit $LASTEXITCODE
