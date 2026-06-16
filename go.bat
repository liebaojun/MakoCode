@echo off
title MakoCode
cd /d "%~dp0"

rem ===== API Config (首次运行时会引导用户配置) =====
set ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
set ANTHROPIC_AUTH_TOKEN=
set ANTHROPIC_MODEL=deepseek-v4-flash
set ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro
set ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-flash
set ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash

echo ==============================
echo   MakoCode - Starting...
echo ==============================
echo.

echo [1/3] Cleaning old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080.*LISTENING" 2^>nul') do taskkill /PID %%a /F 2>nul

echo [2/3] Launching MakoCode backend...
start "MakoCode" node server.js 8080

echo [3/3] Waiting for server...
:waitloop
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:8080/api/projects >nul 2>&1
if errorlevel 1 goto waitloop

echo         Server ready.
echo ============================================
echo   MakoCode is running on port 8080
echo ============================================
echo.

