@echo off
chcp 65001 >nul
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo  Execute como administrador: botao direito - Executar como administrador.
  pause
  exit /b 1
)
schtasks /end /tn "SISTEC Chamados" >nul 2>&1
schtasks /delete /tn "SISTEC Chamados" /f
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*servico.bat*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo.
echo  Inicio automatico removido e servidor encerrado.
pause
