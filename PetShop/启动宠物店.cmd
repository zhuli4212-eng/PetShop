@echo off
setlocal
where.exe node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js and run this launcher again.
  if "%~1"=="" pause
  exit /b 1
)
node.exe "%~dp0tools\start.mjs" %*
set "launcherResult=%ERRORLEVEL%"
if not "%launcherResult%"=="0" if "%~1"=="" pause
exit /b %launcherResult%
