# openspec shim for oso registry
$TOOL_DIR = "{{TOOL_DIR}}"

if ($null -ne $TOOL_DIR -and $TOOL_DIR -ne "" -and $TOOL_DIR -ne "{{TOOL_DIR}}") {
    if ($args[0] -eq "list") {
        $rutilsJs = Join-Path $TOOL_DIR "lib" "registry-utils.js"
        & node $rutilsJs "list"
        exit $LASTEXITCODE
    }
}

& openspec-orig @args
exit $LASTEXITCODE
