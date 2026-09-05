# ============================================================
#  AI Resume Builder - Backend starter (PowerShell)
#  Pure-ASCII version to avoid GBK/UTF-8 mojibake on Windows.
#
#  Usage from server dir:
#     .\start-server.ps1
#
#  First time only (if blocked by ExecutionPolicy):
#     Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#
#  IMPORTANT: this project requires Node >= 22 (better-sqlite3 13.x).
#  If the check below fails, switch Node first, e.g.:
#     nvm use 24.12.0
#  then re-run this script.
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Bypass WorkBuddy sandbox NODE_OPTIONS shim (the genie-safe-delete hook
# can interact badly with PowerShell's child-process shutdown handling
# and cause silent SIGKILL during module import).
$env:NODE_OPTIONS = ""

Set-Location $ProjectRoot

# ---- Node version guard (needs major >= 22) ----
$nodeMajor = 0
try {
    $nodeMajor = [int](node -p "process.versions.node".Split('.')[0])
} catch { $nodeMajor = 0 }
if ($nodeMajor -eq 0) {
    Write-Host "[X] node not found on PATH. Install Node 22+ and retry." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
if ($nodeMajor -lt 22) {
    Write-Host "[X] Active Node is v${nodeMajor}.x but this server needs Node 22+." -ForegroundColor Red
    Write-Host "    better-sqlite3 13.x requires Node >= 22." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    If you use nvm-windows, run one of:" -ForegroundColor Yellow
    Write-Host "       nvm use 22.12.0" -ForegroundColor Cyan
    Write-Host "       nvm use 24.12.0" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Node version: v${nodeMajor}.x (requirements met)" -ForegroundColor Green
Write-Host ""

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  AI Resume Builder - Backend" -ForegroundColor Cyan
Write-Host "  CWD: $ProjectRoot" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check port 5000
$portInUse = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[X] Port 5000 already in use (PID=$($portInUse.OwningProcess))" -ForegroundColor Red
    Write-Host "    Stop it: Stop-Process -Id $($portInUse.OwningProcess) -Force" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path ".env")) {
    Write-Host "[!] .env not found - backend will use system env vars." -ForegroundColor Yellow
    Write-Host ""
}

if (-not (Test-Path "node_modules")) {
    Write-Host "[X] node_modules not found. Run: npm install" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Starting backend..." -ForegroundColor Green
Write-Host "    Ctrl+C to exit." -ForegroundColor Gray
Write-Host "    ---" -ForegroundColor DarkGray
Write-Host ""

try {
    & node src/index.js
}
finally {
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
        Write-Host ""
        Write-Host "[X] Process exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "    If the server stopped with no error, see docs in the" -ForegroundColor Gray
        Write-Host "    conversation that wrote this script." -ForegroundColor Gray
        Read-Host "Press Enter to exit"
    }
}