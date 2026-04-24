@echo off
cd /d "%~dp0"
echo [MOCK] Installing dependencies...
call npm install
echo.
echo [MOCK] Running with sample data...
set USE_SAMPLE_DATA=true
call npm start
echo.
echo Finished. (exit code: %ERRORLEVEL%)
pause
