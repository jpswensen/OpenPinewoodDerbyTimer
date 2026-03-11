#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "ERROR: ${PYTHON_BIN} not found on PATH" >&2
  exit 1
fi

start_backend() {
  cd "${ROOT_DIR}/backend"

  if ! "${PYTHON_BIN}" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    echo "Backend dependencies missing; installing into current Python environment..." >&2
    "${PYTHON_BIN}" -m pip install -r requirements.txt
  fi

  "${PYTHON_BIN}" -m uvicorn app.main:app --reload --host "${BACKEND_HOST}" --port "${BACKEND_PORT}"
}

start_frontend() {
  cd "${ROOT_DIR}/frontend"
  if [[ ! -d node_modules ]]; then
    npm install
  fi
  npm run dev -- --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}"
}

start_backend &
BACKEND_PID=$!

start_frontend &
FRONTEND_PID=$!

cleanup() {
  kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait
