@echo off
if not "%~1"=="" goto local
start "" "https://www.petshop-trial.fun/petshop/"
exit /b %ERRORLEVEL%

:local
"%~dp0start-offline.cmd" %*
