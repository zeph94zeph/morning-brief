@echo off
cd /d "%~dp0"
echo [RSS] Installing dependencies...
call npm install
echo.
echo [RSS] Fetching AI news from RSS feeds...
set USE_RSS=true
call npm start
echo.
echo Finished. (exit code: %ERRORLEVEL%)
pause
