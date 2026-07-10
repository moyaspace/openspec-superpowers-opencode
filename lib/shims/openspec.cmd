@rem openspec shim for oso registry
@echo off
set TOOL_DIR={{TOOL_DIR}}

rem Self-heal: package was removed, restore original openspec and clean up
if not exist "%TOOL_DIR%\lib\registry-utils.js" (
    if exist "%~dp0openspec-orig.cmd" (
        copy /Y "%~dp0openspec-orig.cmd" "%~dp0openspec.cmd" >nul
        del "%~dp0openspec-orig.cmd" >nul 2>&1
    )
    "%~dp0openspec.cmd" %*
    exit /b %errorlevel%
)

if "%TOOL_DIR%"=="" goto passthrough
if not "%1"=="list" goto passthrough

node "%TOOL_DIR%\lib\registry-utils.js" %*
exit /b %errorlevel%

:passthrough
openspec-orig %*
