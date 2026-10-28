@echo off
cd /d "%~dp0"
node "%~dp0scripts\start-edition.mjs" original
if errorlevel 1 (
  echo.
  echo The server could not start. See the message above.
  pause
  exit /b 1
)
