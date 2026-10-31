@echo off
rem Usado pela tarefa agendada (roda em segundo plano, sem janela).
cd /d "%~dp0"
set "NODE=node"
if exist "%~dp0runtime\node.exe" set "NODE=%~dp0runtime\node.exe"
if not exist "%~dp0data" mkdir "%~dp0data"
:loop
"%NODE%" server.js >> "%~dp0data\servidor.log" 2>&1
timeout /t 5 >nul
goto loop
