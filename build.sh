#!/usr/bin/env bash
#
# build.sh — Build a standalone PWDTimer binary for macOS or Linux.
#
# Usage:
#   cd PWDTimer
#   ./build.sh
#
# Outputs:
#   dist/PWDTimer   (single executable)
#
set -euo pipefail
cd "$(dirname "$0")"

echo "=== PWDTimer Standalone Build ==="

# ── 1. Create / activate a dedicated build venv ──────────────────────────
VENV_DIR="build_env"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating build virtual environment..."
    python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── 2. Install Python dependencies ──────────────────────────────────────
echo "Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r backend/requirements.txt -q
pip install pyinstaller -q

# ── 3. Build the React frontend ─────────────────────────────────────────
echo "Building frontend..."
pushd frontend > /dev/null
npm ci --silent
npm run build
popd > /dev/null

if [ ! -f frontend/dist/index.html ]; then
    echo "ERROR: Frontend build failed — frontend/dist/index.html not found."
    exit 1
fi

# ── 4. Run PyInstaller ──────────────────────────────────────────────────
echo "Bundling with PyInstaller..."

# Clear any stale local build artifacts (avoid --clean which touches global cache)
rm -rf build/PWDTimer dist/PWDTimer dist/PWDTimer.app
pyinstaller --noconfirm pwdtimer.spec

# ── 5. Verify output ────────────────────────────────────────────────────
if [ -d dist/PWDTimer.app ]; then
    echo ""
    echo "Build complete!  Application: dist/PWDTimer.app"
    echo "Bundle size: $(du -sh dist/PWDTimer.app | cut -f1)"
    echo ""
    echo "Run it with:"
    echo "  open dist/PWDTimer.app                          # Double-click or open command"
    echo "  ./dist/PWDTimer.app/Contents/MacOS/PWDTimer     # From terminal"
    echo "  ./dist/PWDTimer.app/Contents/MacOS/PWDTimer --headless  # Browser mode"
elif [ -f dist/PWDTimer ]; then
    echo ""
    echo "Build complete!  Executable: dist/PWDTimer"
    echo "File size: $(du -sh dist/PWDTimer | cut -f1)"
    echo ""
    echo "Run it with:"
    echo "  ./dist/PWDTimer            # Desktop window"
    echo "  ./dist/PWDTimer --headless # Open in default browser"
else
    echo "ERROR: Build failed — output not found in dist/."
    exit 1
fi
