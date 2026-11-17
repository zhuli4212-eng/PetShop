@echo off
setlocal
node.exe "%~dp0tools\start-multiplayer.mjs"
if errorlevel 1 pause
