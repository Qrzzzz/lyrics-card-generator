@echo off
setlocal
chcp 65001 >nul

call "%~dp0scripts\start-dev.bat"
if errorlevel 1 (
  echo.
  echo [Error] The launcher script failed.
  pause
  exit /b 1
)

endlocal
