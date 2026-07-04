# openspec shim for oso registry
$TOOL_DIR = "{{TOOL_DIR}}"

if ($null -eq $TOOL_DIR -or $TOOL_DIR -eq "" -or $TOOL_DIR -eq "{{TOOL_DIR}}") {
    & openspec-orig @args
    exit $LASTEXITCODE
}

function Find-ProjectRoot {
    param([string]$Dir)
    $current = $Dir
    while ($true) {
        $marker = Join-Path $current "openspec" "changes.json"
        if (Test-Path $marker -PathType Leaf) {
            return $current
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { return $null }
        $current = $parent
    }
}

if ($args[0] -eq "list") {
    $root = Find-ProjectRoot (Get-Location).Path
    if ($root) {
        $rutilsJs = Join-Path $TOOL_DIR "lib" "registry-utils.js"
        & node $rutilsJs "list" $root
        exit $LASTEXITCODE
    }
}

& openspec-orig @args
exit $LASTEXITCODE
