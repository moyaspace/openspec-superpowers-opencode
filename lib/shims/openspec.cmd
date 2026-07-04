@rem openspec shim for oso registry
@echo off
set TOOL_DIR={{TOOL_DIR}}

if "%TOOL_DIR%"=="" goto passthrough
if "%TOOL_DIR%"=="{{TOOL_DIR}}" goto passthrough
if not "%1"=="list" goto passthrough

setlocal enabledelayedexpansion
set "ROOT="
set "DIR=%CD%"

:findroot
if exist "%DIR%\openspec\changes.json" (
    set "ROOT=%DIR%"
    goto runshim
)
echo "%DIR%" | findstr /R "^^\"[a-zA-Z]:\\\"$" >nul
if %errorlevel% equ 0 goto passthrough
for %%I in ("%DIR%") do set "PARENT=%%~dpI"
set "PARENT=%PARENT:~0,-1%"
if /i "%PARENT%"=="%DIR%" goto passthrough
set "DIR=%PARENT%"
goto findroot

:runshim
node "%TOOL_DIR%\lib\registry-utils.js" list "%ROOT%"
exit /b %errorlevel%

:passthrough
openspec-orig %*
