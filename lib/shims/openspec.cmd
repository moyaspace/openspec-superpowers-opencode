@rem openspec shim for oso registry
@echo off
set TOOL_DIR={{TOOL_DIR}}

if "%TOOL_DIR%"=="" goto passthrough
if "%TOOL_DIR%"=="{{TOOL_DIR}}" goto passthrough
if not "%1"=="list" goto passthrough

node "%TOOL_DIR%\lib\registry-utils.js" list
exit /b %errorlevel%

:passthrough
openspec-orig %*
