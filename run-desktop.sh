#!/usr/bin/env bash
#
# run-desktop.sh — Launch PWDTimer as a desktop app (development mode).
#
# Builds the frontend if needed, then starts the FastAPI backend inside
# a native pywebview window.
#
# Usage:
#   cd PWDTimer
#   ./run-desktop.sh              # pywebview window
#   ./run-desktop.sh --headless   # opens in default browser instead
#
set -euo pipefail
cd "$(dirname "$0")"

# Build frontend if dist is missing or stale
if [ ! -f frontend/dist/index.html ]; then
    echo "Building frontend..."
    pushd frontend > /dev/null
    npm ci --silent
    npm run build
    popd > /dev/null
fi

# Activate project venv if it exists
if [ -f env/bin/activate ]; then
    # shellcheck disable=SC1091
    source env/bin/activate
elif [ -f build_env/bin/activate ]; then
    # shellcheck disable=SC1091
    source build_env/bin/activate
fi

cd backend
exec python3 run.py "$@"
