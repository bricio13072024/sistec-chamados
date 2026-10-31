@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data (
  echo  Ainda nao existe nenhum dado para copiar.
  pause
  exit /b
)
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "STAMP=%%d"
if not exist backups mkdir backups
xcopy /e /i /y /q data "backups\backup_%STAMP%" >nul
echo.
echo  Backup criado em: backups\backup_%STAMP%
echo  (contem todos os chamados, mensagens do chat, anexos e configuracoes)
echo.
pause
