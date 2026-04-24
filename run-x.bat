@echo off
cd /d "%~dp0"
echo [X API] Installing dependencies...
call npm install
echo.
echo [X API] Fetching AI news from X timeline...
call npm start
echo.
echo Finished. (exit code: %ERRORLEVEL%)
pause
