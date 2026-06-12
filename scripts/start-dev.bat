@echo off
setlocal
chcp 65001 >nul

title Lyric Card Generator Dev Server
cd /d "%~dp0.."

echo ==================================================
echo   Lyric Card Generator Dev Server
echo ==================================================
echo.

if not exist package.json (
  echo [Error] package.json was not found.
  echo Please run this script from the project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [Error] Node.js was not found.
  echo Please install Node.js LTS first:
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Error] npm was not found.
  echo Please confirm Node.js is installed correctly.
  pause
  exit /b 1
)

echo [Info] Node version:
node -v
echo [Info] npm version:
call npm -v
echo.

if not exist node_modules (
  echo [Info] node_modules was not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo [Error] Failed to install dependencies.
    pause
    exit /b 1
  )
) else (
  echo [Info] node_modules found. Skipping dependency install.
)

echo.
echo [Info] Starting development server...
echo [Info] Default URL: http://localhost:3000
if not "%LGC_NO_OPEN%"=="1" echo [Info] A browser window will open automatically.
echo [Info] Press Ctrl+C in this window to stop the server.
echo.

if not "%LGC_NO_OPEN%"=="1" start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:3000'"
call npm run dev -- --hostname 127.0.0.1 --port 3000

echo.
echo [Info] Development server exited.
pause
endlocal
