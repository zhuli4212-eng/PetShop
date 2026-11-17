@echo off
if not "%~1"=="" goto local
start "" "https://petshop-trial.pages.dev/"
exit /b %ERRORLEVEL%

:local
"%~dp0start-offline.cmd" %*
