@echo off
setlocal
cd /d "%~dp0"

echo Building Everwood...
call npm.cmd run build
if errorlevel 1 (
    echo.
    echo Build failed. The server was not started.
    pause
    exit /b 1
)

echo.
echo Starting Everwood...
call npm.cmd start -- --host 0.0.0.0 --port 3000
if errorlevel 1 (
    echo.
    echo The server could not start.
    pause
    exit /b 1
)
endlocal

