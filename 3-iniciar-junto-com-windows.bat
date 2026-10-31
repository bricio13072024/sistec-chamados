@echo off
chcp 65001 >nul
title SISTEC Chamados - Iniciar junto com o Windows

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  Este script precisa de permissao de administrador.
  echo  Clique com o botao direito no arquivo e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

schtasks /create /tn "SISTEC Chamados" /tr "\"%~dp0servico.bat\"" /sc onstart /ru SYSTEM /rl HIGHEST /f
if %errorlevel% neq 0 (
  echo  Nao foi possivel criar a tarefa agendada.
  pause
  exit /b 1
)
schtasks /run /tn "SISTEC Chamados" >nul
echo.
echo  Pronto! O SISTEC Chamados agora inicia sozinho quando o computador liga,
echo  mesmo sem ninguem fazer login. Ele ja foi iniciado em segundo plano.
echo.
echo  Para desfazer, execute "remover-inicio-automatico.bat" como administrador.
echo.
pause
