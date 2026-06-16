@echo off
chcp 65001 >nul
title MakoCode - Stopping
cd /d "%~dp0"

echo ==============================
echo   MakoCode - Stopping...
echo ==============================
echo.

rem ---- [Web] 端口 8080 (Node.js server.js) ----
echo [1/1] Stopping MakoCode server (port 8080)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080.*LISTENING" 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1 && echo       Server (PID %%a) killed.
)

echo.
echo ==============================
echo   MakoCode stopped.
echo ==============================
timeout /t 2 /nobreak >nul
