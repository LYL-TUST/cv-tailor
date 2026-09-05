@echo off
REM ============================================================
REM  AI Resume Builder - Backend starter (CMD / Batch)
REM  Pure-ASCII version to avoid GBK/UTF-8 mojibake on Windows.
REM
REM  Usage: double-click, or from server dir run: start-server.bat
REM
REM  IMPORTANT: this project requires Node >= 22 (better-sqlite3 13.x).
REM  The script checks your active Node version and reminds you to
REM  switch (e.g.  nvm use 22.12.0  or  nvm use 24.12.0) if needed.
REM ============================================================

chcp 65001 >nul 2>&1
setlocal

cd /d "%~dp0"

REM Bypass WorkBuddy sandbox NODE_OPTIONS shim.
set NODE_OPTIONS=

echo ============================================
echo   AI Resume Builder - Backend
echo   CWD: %cd%
echo ============================================
echo.

REM ---- Node version guard (needs major >= 22) ----
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] node not found on PATH. Install Node 22+ and retry.
    echo.
    pause
    exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 22 (
    echo [X] Active Node is v%NODE_MAJOR%.x but this server needs Node 22+.
    echo     better-sqlite3 13.x requires Node ^>= 22.
    echo.
    echo     If you use nvm-windows, run one of:
    echo        nvm use 22.12.0
    echo        nvm use 24.12.0
    echo     then re-run this script.
    echo.
    pause
    exit /b 1
)
echo [OK] Node version: %NODE_MAJOR%.x  (requirements met)
echo.

REM ---- Port guard ----
netstat -ano | findstr ":5000.*LISTENING" >nul
if %errorlevel% == 0 (
    echo [X] Port 5000 already in use.
    echo     Run: netstat -ano ^| findstr :5000
    echo     Then: taskkill /PID ^<pid^> /F
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    echo [!] .env not found - backend will use system env vars.
    echo.
)

if not exist "node_modules" (
    echo [X] node_modules not found. Run: npm install
    echo.
    pause
    exit /b 1
)

echo [OK] Starting backend...
echo     Ctrl+C to exit.
echo     ---
echo.

node src/index.js
set "EXITCODE=%errorlevel%"

if %EXITCODE% neq 0 (
    echo.
    echo [X] Process exit code: %EXITCODE%
    echo.
    if %EXITCODE% == -1073741819 (
        echo This is STATUS_ACCESS_VIOLATION ^(0xC0000005^).
        echo Usually caused by better-sqlite3 native module loading under
        echo an unsupported Node version.
        echo.
        echo Fix: switch to Node 22+ then retry:
        echo    nvm use 22.12.0
        echo    nvm use 24.12.0
        echo Then re-run this script. If it still fails, delete node_modules
        echo and reinstall with the active Node:
        echo    rmdir /s /q node_modules
        echo    npm install
    ) else (
        echo If the server stopped with no error, see the docs in the
        echo conversation that wrote this script.
    )
    echo.
    pause
)
endlocal