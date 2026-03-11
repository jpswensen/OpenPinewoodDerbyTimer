FROM python:3.12-slim AS base

LABEL maintainer="PWDTimer Team"
LABEL description="PWDTimer Backend — FastAPI race management server"

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system deps (needed by some Python packages)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn

# Copy application code
COPY app/ app/

# Create data directory for SQLite database
RUN mkdir -p /data

# Default environment variables
ENV PWD_TIMER_DB_URL="sqlite+aiosqlite:///data/pwdtimer.db"
ENV PWD_TIMER_HOST="0.0.0.0"
ENV PWD_TIMER_PORT="8000"
ENV PWD_TIMER_WORKERS="1"
ENV PWD_TIMER_LOG_LEVEL="info"

# Optional: serve frontend static files from this path
ENV PWD_TIMER_STATIC_DIR=""

EXPOSE 8000

VOLUME ["/data"]

# Use gunicorn with uvicorn workers for production
CMD gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers ${PWD_TIMER_WORKERS} \
    --bind ${PWD_TIMER_HOST}:${PWD_TIMER_PORT} \
    --log-level ${PWD_TIMER_LOG_LEVEL} \
    --access-logfile - \
    --error-logfile -
