@echo off
chcp 65001 >nul
title SISTEC Chamados - Servidor
cd /d "%~dp0"

set "NODE=node"
if exist "%~dp0runtime\node.exe" set "NODE=%~dp0runtime\node.exe"

:loop
"%NODE%" server.js
echo.
echo  O servidor parou. Reiniciando em 5 segundos... (feche esta janela para encerrar)
timeout /t 5 >nul
goto loop
