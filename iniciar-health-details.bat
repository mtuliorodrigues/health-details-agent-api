@echo off
setlocal EnableExtensions

set "PROJECT_DIR=%~dp0"
set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "CADDY_EXE="

for /f "delims=" %%I in ('where caddy.exe 2^>nul') do if not defined CADDY_EXE set "CADDY_EXE=%%I"
if not defined CADDY_EXE if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe" set "CADDY_EXE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"

if not exist "%NODE_EXE%" (
  echo [ERRO] Node.js nao foi encontrado. Instale Node.js LTS e execute este arquivo novamente.
  pause
  exit /b 1
)

if not defined CADDY_EXE (
  echo [ERRO] Caddy nao foi encontrado. Instale-o com: winget install CaddyServer.Caddy
  pause
  exit /b 1
)

if not exist "%PROJECT_DIR%node_modules\express" (
  echo Instalando dependencias do agente...
  call "%NPM_CMD%" install
  if errorlevel 1 (
    echo [ERRO] Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)

netstat -ano | findstr /I /C:":8002" | findstr /I "LISTENING" >nul
if errorlevel 1 (
  echo Iniciando agente local...
  start "Health Details Agent" /min "%NODE_EXE%" "%PROJECT_DIR%server.js"
) else (
  echo Agente local ja esta em execucao.
)

tasklist /FI "IMAGENAME eq caddy.exe" | findstr /I "caddy.exe" >nul
if errorlevel 1 (
  echo Iniciando HTTPS publico...
  start "Health Details HTTPS" /min "%CADDY_EXE%" run --config "%PROJECT_DIR%Caddyfile" --adapter caddyfile
) else (
  echo HTTPS publico ja esta em execucao.
)

echo.
echo Projeto iniciado.
echo Painel: https://health-details-web.vercel.app
echo Agente: https://hosthealthdetails.ddns.net/health
echo.
pause
