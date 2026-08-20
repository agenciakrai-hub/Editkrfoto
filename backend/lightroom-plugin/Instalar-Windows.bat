@echo off
setlocal
title RAW AI Studio - Instalador para Lightroom Classic

set "SRC=%~dp0rawai_studio.lrplugin"
set "DEST=%APPDATA%\Adobe\Lightroom\Modules"

echo ============================================
echo   RAW AI Studio - Instalador de plugin
echo ============================================
echo.

if not exist "%SRC%" (
  echo ERROR: No se encuentra la carpeta rawai_studio.lrplugin junto a este instalador.
  echo Asegurate de descomprimir el ZIP completo antes de ejecutar.
  echo.
  pause
  exit /b 1
)

echo Instalando en: %DEST%
if not exist "%DEST%" mkdir "%DEST%"

xcopy /E /I /Y "%SRC%" "%DEST%\rawai_studio.lrplugin" >nul

if %errorlevel% neq 0 (
  echo.
  echo ERROR al copiar el plugin. Ejecuta este instalador como Administrador.
  echo.
  pause
  exit /b 1
)

echo.
echo Plugin instalado correctamente.
echo Abre (o reinicia) Lightroom Classic: RAW AI Studio se cargara automaticamente.
echo Luego pega tu token en: RAW AI Studio ^> Configurar (token).
echo.
pause
