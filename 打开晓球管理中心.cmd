@echo off
setlocal
set "XIAOQIU_ADMIN_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%XIAOQIU_ADMIN_ROOT%scripts\start-admin-center.ps1"
set "XIAOQIU_ADMIN_EXIT=%ERRORLEVEL%"
if not "%XIAOQIU_ADMIN_EXIT%"=="0" pause
exit /b %XIAOQIU_ADMIN_EXIT%
