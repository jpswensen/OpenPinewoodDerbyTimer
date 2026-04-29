@echo off
REM build.bat — Build a standalone PWDTimer binary for Windows.
REM
REM Usage:
REM   cd PWDTimer
REM   scripts\build.bat
REM
REM Outputs:
REM   dist\PWDTimer.exe   (single executable)

setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo === PWDTimer Standalone Build ===

REM ── 1. Create / activate a dedicated build venv ──────────────────────
set VENV_DIR=build_env
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo Creating build virtual environment...
    python -m venv %VENV_DIR%
)
call %VENV_DIR%\Scripts\activate.bat

REM ── 2. Install Python dependencies ──────────────────────────────────
echo Installing Python dependencies...
pip install --upgrade pip -q
pip install -r backend\requirements.txt -q
pip install pyinstaller -q

REM ── 3. Build the React frontend ────────────────────────────────────
echo Building frontend...
pushd frontend
call npm ci --silent
call npm run build
popd

if not exist frontend\dist\index.html (
    echo ERROR: Frontend build failed — frontend\dist\index.html not found.
    exit /b 1
)

REM ── 4. Run PyInstaller ─────────────────────────────────────────────
echo Bundling with PyInstaller...
pyinstaller --clean --noconfirm packaging\pyinstaller\pwdtimer.spec

REM ── 5. Verify output ──────────────────────────────────────────────
if exist dist\PWDTimer.exe (
    echo.
    echo Build complete!  Executable: dist\PWDTimer.exe
    echo.
    echo Run it with:
    echo   dist\PWDTimer.exe              Desktop window
    echo   dist\PWDTimer.exe --headless   Open in default browser
) else (
    echo ERROR: Build failed — dist\PWDTimer.exe not found.
    exit /b 1
)

endlocal
