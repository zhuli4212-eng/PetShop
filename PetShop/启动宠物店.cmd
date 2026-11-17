@echo off
if not "%~1"=="" goto local
start "" "https://petshop-cloud-play.zhuli4212.chatgpt.site/"
exit /b %ERRORLEVEL%

:local
"%~dp0start-offline.cmd" %*
