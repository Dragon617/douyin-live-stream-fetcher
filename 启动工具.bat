@echo off
chcp 65001 >nul
title Douyin Live Tool

echo.
echo ========================================
echo    Douyin Live Stream Fetcher
echo ========================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install: https://nodejs.org/
    pause
    exit /b 1
)

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo        First run, installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
)

echo [2/3] Starting server...
echo.

start "DouyinTool" cmd /c "npm start"

echo [3/3] Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:1144

echo.
echo ========================================
echo  Service started: http://localhost:1144
echo  Press any key to close this window
echo ========================================
echo.
pause >nul
