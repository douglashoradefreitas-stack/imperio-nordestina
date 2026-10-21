@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title Painel Imperio Nordestina - criar acesso
echo.
echo ============================================
echo  IMPERIO NORDESTINA - criar acesso ao painel
echo ============================================
echo.
cd /d "%~dp0"
if not exist "configurar.cjs" (
  echo [ERRO] Esta pasta nao contem o sistema.
  echo Abra a PASTA EXTRAIDA do pacote e rode este arquivo de dentro dela.
  goto fim
)
node --version >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e rode de novo.
  goto fim
)
echo Etapa 1 de 3: instalando dependencias ^(aguarde 30-60 segundos, nao feche^)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [ERRO] Falha ao instalar dependencias. Verifique sua internet e rode de novo.
  goto fim
)
echo Dependencias instaladas.
echo.
echo Etapa 2 de 3: sua connection string do Neon
set "DATABASE_URL="
set /p DBURL="Cole a connection string (ou aperte Enter para pasta local): "
if not "%DBURL%"=="" set "DATABASE_URL=%DBURL%"
echo.
echo Etapa 3 de 3: cadastro do acesso
node configurar.cjs
:fim
echo.
pause
