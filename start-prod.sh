#!/usr/bin/env bash
# start-prod.sh — Production startup for PWDTimer (without Docker)
#
# Builds the frontend, then serves everything from the FastAPI backend.
# The backend serves the built frontend static files directly.
#
# Usage:
#   ./start-prod.sh                     # defaults
#   PWD_TIMER_PORT=9000 ./start-prod.sh # custom port
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuration (override via environment variables) ────────────────────────
PYTHON_BIN="${PYTHON_BIN:-python3}"
PWD_TIMER_HOST="${PWD_TIMER_HOST:-0.0.0.0}"
PWD_TIMER_PORT="${PWD_TIMER_PORT:-8000}"
PWD_TIMER_WORKERS="${PWD_TIMER_WORKERS:-1}"
PWD_TIMER_LOG_LEVEL="${PWD_TIMER_LOG_LEVEL:-info}"
PWD_TIMER_DB_URL="${PWD_TIMER_DB_URL:-sqlite+aiosqlite:///${ROOT_DIR}/data/pwdtimer.db}"
PWD_TIMER_STATIC_DIR="${PWD_TIMER_STATIC_DIR:-${ROOT_DIR}/frontend/dist}"
PWD_TIMER_WS_TOKEN="${PWD_TIMER_WS_TOKEN:-}"

export PWD_TIMER_DB_URL PWD_TIMER_STATIC_DIR PWD_TIMER_WS_TOKEN

# ── Verify prerequisites ─────────────────────────────────────────────────────
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "ERROR: ${PYTHON_BIN} not found on PATH" >&2
  exit 1
fi

# ── Install backend dependencies if missing ──────────────────────────────────
cd "${ROOT_DIR}/backend"
if ! "${PYTHON_BIN}" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  echo "Installing backend dependencies..." >&2
  "${PYTHON_BIN}" -m pip install -r requirements.txt
fi

# Install gunicorn if not present
if ! "${PYTHON_BIN}" -c "import gunicorn" >/dev/null 2>&1; then
  echo "Installing gunicorn..." >&2
  "${PYTHON_BIN}" -m pip install gunicorn
fi

# ── Build frontend if dist is missing or stale ───────────────────────────────
DIST_DIR="${ROOT_DIR}/frontend/dist"
if [[ ! -f "${DIST_DIR}/index.html" ]]; then
  echo "Building frontend production bundle..." >&2
  cd "${ROOT_DIR}/frontend"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  npm run build
fi

# ── Create data directory for SQLite ─────────────────────────────────────────
mkdir -p "${ROOT_DIR}/data"

# ── Start the production server ──────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PWDTimer — Production Mode"
echo "  URL:     http://${PWD_TIMER_HOST}:${PWD_TIMER_PORT}"
echo "  Workers: ${PWD_TIMER_WORKERS}"
echo "  DB:      ${PWD_TIMER_DB_URL}"
echo "  Static:  ${PWD_TIMER_STATIC_DIR}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "${ROOT_DIR}/backend"
exec "${PYTHON_BIN}" -m gunicorn app.main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --workers "${PWD_TIMER_WORKERS}" \
  --bind "${PWD_TIMER_HOST}:${PWD_TIMER_PORT}" \
  --log-level "${PWD_TIMER_LOG_LEVEL}" \
  --access-logfile - \
  --error-logfile -
