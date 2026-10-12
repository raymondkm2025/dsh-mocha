@echo off
rem dsh-mocha installer wrapper.
rem The profile registration step cannot be done by the agent (its sandbox only
rem writes inside the workspace), so run this from a normal terminal or by
rem double-clicking. It picks pwsh when present and falls back to Windows
rem PowerShell otherwise, so no shell-specific command has to be remembered.
rem
rem Usage:  install.cmd              install
rem         install.cmd -DryRun      show what would change
rem         install.cmd -Uninstall   remove the registration
setlocal
set "HERE=%~dp0"

where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%HERE%install.ps1" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%install.ps1" %*
)

echo.
pause
