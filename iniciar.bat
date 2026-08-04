@echo off
title CEM - Centro Educacional Milezi
cd /d "%~dp0"

echo.
echo   ============================================
echo    CEM - Centro Educacional Milezi
echo    ERP Escolar
echo   ============================================
echo.

if not exist "node_modules" (
  echo   Instalando dependencias, aguarde...
  call npm install
  echo.
)

if not exist ".env" (
  echo   Criando .env a partir do .env.example...
  copy ".env.example" ".env" >nul
  echo.
)

start "" http://localhost:3300/
node server.js

pause
