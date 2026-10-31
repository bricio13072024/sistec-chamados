@echo off
chcp 65001 >nul
title SISTEC Chamados - Liberar firewall

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  Este script precisa de permissao de administrador.
  echo  Clique com o botao direito no arquivo e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="SISTEC Chamados" >nul 2>&1
netsh advfirewall firewall add rule name="SISTEC Chamados" dir=in action=allow protocol=TCP localport=3000 profile=any
echo.
echo  Pronto! A porta 3000 foi liberada no Firewall do Windows.
echo  As estacoes ja podem acessar o sistema pela rede.
echo.
pause
