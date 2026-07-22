@echo off
title RoboMate-X1 Control Center

echo ========================================
echo   RoboMate-X1 Control Center v1.0
echo ========================================
echo.

cd /d "%~dp0"

if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Dependency install failed. Check if Node.js is installed.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies ready.
)

echo [2/2] Starting server...
start "RoboMate-Server" /MIN node server\index.js

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

start http://localhost:3000

echo.
echo Server is running!
echo URL: http://localhost:3000
echo.
echo Close this window to stop the server.
echo Or close the "RoboMate-Server" window.
echo.

pause
