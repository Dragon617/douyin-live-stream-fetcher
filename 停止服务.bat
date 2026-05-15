@echo off
chcp 65001 >nul
title Stop Service

echo.
echo Stopping service...
echo.

taskkill /FI "WINDOWTITLE eq DouyinTool*" /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1

echo Done!
echo.
pause
