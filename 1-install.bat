@echo off
cd /d "%~dp0"
echo Installing... (needs internet, takes a few minutes)
call npm run install:all
call npm run build
echo.
echo Done. Now start MySQL in XAMPP and double-click 2-start.bat
pause
