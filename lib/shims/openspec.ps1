# openspec shim for oso registry
$TOOL_DIR = "{{TOOL_DIR}}"

# Self-heal: package was removed, restore original openspec
$healthCheck = Join-Path $TOOL_DIR "lib" "registry-utils.js"
if (-not (Test-Path $healthCheck)) {
    $here = Split-Path -Parent $PSCommandPath
    $origCmd = Join-Path $here "openspec-orig.cmd"
    if (Test-Path $origCmd) {
        Copy-Item $origCmd (Join-Path $here "openspec.cmd") -Force
    }
    $origPs1 = Join-Path $here "openspec-orig.ps1"
    if (Test-Path $origPs1) {
        Copy-Item $origPs1 (Join-Path $here "openspec.ps1") -Force
    }
    & (Join-Path $here "openspec") @args
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
