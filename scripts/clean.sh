#!/usr/bin/env bash
#
# clean.sh — Remove all build intermediate and final products.
#
# Usage:
#   cd PWDTimer
#   ./scripts/clean.sh       # remove build artifacts only
#   ./scripts/clean.sh --all # also remove node_modules and build_env venv
#
set -euo pipefail
cd "$(dirname "$0")/.."

ALL=false
for arg in "$@"; do
    [ "$arg" = "--all" ] && ALL=true
done

echo "=== PWDTimer Clean ==="

# ── PyInstaller outputs ─────────────────────────────────────────────────
echo "Removing PyInstaller build artifacts..."
rm -rf build/ dist/

# ── Frontend build output ───────────────────────────────────────────────
echo "Removing frontend dist..."
rm -rf frontend/dist/

# ── Python cache files ──────────────────────────────────────────────────
echo "Removing Python cache..."
find . -type d -name "__pycache__" \
    -not -path "./.git/*" \
    -not -path "./build_env/*" \
    -not -path "./env/*" \
    -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -o -name "*.pyo" \
    -not -path "./.git/*" | xargs rm -f 2>/dev/null || true

if $ALL; then
    echo "Removing node_modules..."
    rm -rf frontend/node_modules/

    echo "Removing build virtual environment (build_env/)..."
    rm -rf build_env/

    echo "Done (full clean)."
else
    echo "Done. (Run './scripts/clean.sh --all' to also remove node_modules and build_env/)"
fi
