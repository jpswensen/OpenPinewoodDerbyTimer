# PWDTimer — Pinewood Derby Timer Management System

A modern, full-stack race management system for Pinewood Derby events. PWDTimer combines a **FastAPI** backend, a **React** web frontend, and custom **ESP32 firmware** to deliver real-time timing, automatic heat scheduling, and professional results & certificate generation — all from a browser.

## Features

| Feature | Description |
|---------|-------------|
| **Participant Management** | Organize racers into groups (Tiger Cubs, Wolf, Bear, Webelos, etc.) with CSV import/export |
| **Automatic Heat Scheduling** | Fair round-robin lane rotation ensuring every racer competes in every lane |
| **Real-time Race Display** | Live timing via WebSocket with place indicators as cars finish |
| **Serial & WiFi** | USB serial (primary) and UDP-over-SoftAP (optional) for the timing hardware |
| **Results & Rankings** | Automatic average/best time calculation, overall and per-group standings |
| **PDF Export** | Professional race results documents (letter/A4, portrait/landscape) |
| **Award Certificates** | Decorative winner and participation certificates with batch generation |
| **Dark Mode** | Full light/dark theme support with persistent preference |
| **Projector Mode** | Fullscreen race display optimized for venue projection |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web Browser                               │
│  React + TypeScript + Tailwind CSS + TanStack Query              │
│  Pages: Home │ Racers │ Heats │ Race │ Results │ Certs │ Settings│
└──────────────────┬───────────────────────┬───────────────────────┘
                   │ REST API (HTTP)       │ WebSocket (/ws)
                   ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  SQLAlchemy + SQLite │ Pydantic │ ReportLab (PDF/Certificates)   │
│  Routers: races, racers, groups, connection, certificates, ws    │
│  Services: heat_scheduler, connection_manager, timer_protocol    │
└──────────────────┬───────────────────────────────────────────────┘
                   │ Serial (USB), TCP (WiFi), or UDP (SoftAP)
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ESP32 Firmware                                 │
│  FreeRTOS: Core 1 (timing ISRs) │ Core 0 (comms + OTA)          │
│  HAL → GPIO interrupts, μs precision                             │
│  Protocol: $state,startTime,currentTime,numLanes,t0,...*         │
└──────────────────────────────────────────────────────────────────┘
```

## Prerequisites

| Requirement | Minimum Version | Purpose |
|-------------|-----------------|---------|
| **Python** | 3.11+ | Backend server |
| **Node.js** | 18+ | Frontend build and dev server |
| **npm** | 9+ | Frontend dependency management |
| **PlatformIO** | 6+ | Firmware compilation and flashing (optional — only needed for hardware) |

## Quick Start

### 1. Clone and enter the project

```bash
cd PWDTimer
```

### 2. Set up the Python environment

```bash
python3 -m venv env
source env/bin/activate        # macOS / Linux
# env\Scripts\activate         # Windows
pip install -r backend/requirements.txt
```

### 3. Start the application

```bash
./start.sh
```

This launches both the **backend** (Uvicorn on `http://localhost:8000`) and the **frontend** dev server (Vite on `http://localhost:5173`). Open your browser to **http://localhost:5173**.

> **Tip:** You can override ports with environment variables:
> ```bash
> BACKEND_PORT=9000 FRONTEND_PORT=3000 ./start.sh
> ```

### 4. (Optional) Start services individually

```bash
# Backend only
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend only (in another terminal)
cd frontend
npm install   # first time only
npm run dev
```

## Project Structure

```
PWDTimer/
├── backend/                    # FastAPI application
│   ├── app/
│   │   ├── main.py             # App entry point, CORS, startup events
│   │   ├── models/
│   │   │   ├── database.py     # Async SQLAlchemy engine + session
│   │   │   ├── models.py       # ORM models (Group, Racer, Race, Heat, ...)
│   │   │   └── schemas.py      # Pydantic request/response schemas
│   │   ├── routers/            # API route handlers
│   │   │   ├── races.py        # Race & heat management
│   │   │   ├── racers.py       # Racer CRUD
│   │   │   ├── groups.py       # Group management
│   │   │   ├── certificates.py # PDF certificate generation
│   │   │   ├── connection.py   # Hardware connection control
│   │   │   ├── websocket.py    # Real-time WebSocket endpoint
│   │   │   └── import_export.py# CSV import/export
│   │   └── services/           # Business logic
│   │       ├── heat_scheduler.py       # Round-robin heat generation
│   │       ├── race_results.py         # Results calculation
│   │       ├── connection_manager.py   # Hardware connection state
│   │       ├── timer_protocol.py       # Message parsing/formatting
│   │       ├── event_bus.py            # WebSocket event broadcasting
│   │       ├── pdf_generator.py        # PDF results export
│   │       ├── certificate_generator.py# Decorative certificates
│   │       ├── serial_connection.py    # Serial port handling
│   │       ├── tcp_connection.py       # TCP socket handling
│   │       └── mdns_discovery.py       # mDNS device discovery
│   ├── tests/                  # pytest test suite (253+ tests, 90%+ coverage)
│   ├── Dockerfile              # Backend container image
│   └── requirements.txt
├── frontend/                   # React + TypeScript application
│   ├── src/
│   │   ├── pages/              # 7 main page components
│   │   ├── components/         # Reusable UI components
│   │   ├── hooks/              # Custom React hooks (WebSocket, etc.)
│   │   ├── context/            # React context providers (theme)
│   │   ├── api/                # Typed API client functions
│   │   └── lib/                # Utilities (settings, helpers)
│   ├── Dockerfile              # Frontend container image (nginx)
│   ├── nginx.conf              # Production nginx configuration
│   ├── package.json
│   └── vite.config.ts
├── firmware/                   # ESP32 PlatformIO project
│   ├── src/
│   │   ├── hal/                # Hardware abstraction layer
│   │   ├── comm/               # Communication protocol
│   │   ├── app/                # Application controller
│   │   ├── config/             # NVS persistent configuration
│   │   └── main.cpp            # Firmware entry point
│   ├── test/                   # Native unit tests (78+ tests)
│   └── platformio.ini
├── deploy/                     # Deployment configuration files
│   ├── pwdtimer.service        # systemd unit file (Linux)
│   └── com.pwdtimer.server.plist # launchd plist (macOS)
├── docs/                       # Documentation
├── docker-compose.yml          # Single-command Docker deployment
├── .env.example                # Environment variable template
├── start.sh                    # Development startup script
├── start-prod.sh               # Production startup script
├── run-desktop.sh              # Desktop app launcher (pywebview)
├── clean.sh                    # Remove build artifacts (build/, dist/, frontend/dist/)
├── build.sh                    # Standalone binary build (macOS/Linux)
├── build.bat                   # Standalone binary build (Windows)
├── pwdtimer.spec               # PyInstaller spec file
└── .gitignore
```

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/user-guide.md) | Step-by-step usage instructions for running a derby event |
| [API Reference](docs/api-reference.md) | Complete REST API and WebSocket endpoint documentation |
| [Firmware Setup](docs/firmware-setup.md) | Flashing instructions, hardware connections, pin mappings |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |
| [Python Implementation Review](docs/01_python_implementation_review.md) | Analysis of the legacy PyQt5 application |
| [Firmware/Hardware Review](docs/02_firmware_hardware_review.md) | Analysis of legacy firmware and board designs |
| [Code Review Findings](docs/03_code_review_findings.md) | Issues found and fixed during quality review |

### Lane Count

The number of active lanes is a **global setting** (Settings → Lane Count) rather than a per-race option. Set it once to match your track hardware and it applies to every race and heat automatically.

### Connecting over Wi-Fi (UDP)

The firmware brings up a SoftAP **simultaneously** with the existing serial
transport — both stay live at all times, so the operator never loses the
serial fallback.

* **SSID:** `PWDTimer`
* **Password:** `pinewood2025` (WPA2)
* **Device IP:** `192.168.4.1`
* **Ports:** UDP `9100` (host → device commands), UDP `9101` (device → host
  status broadcasts)

Steps:

1. Flash the firmware (`pio run -t upload` from `firmware/`).
2. On the host computer, join the `PWDTimer` Wi-Fi network. The host has
   no internet while joined — the UI is fully self-contained and works
   offline.
3. In **Settings → Connection → Wi-Fi (UDP)**, click **Connect**. The
   defaults match the firmware out of the box.

Status frames are emitted on serial and UDP simultaneously, so it is safe
to keep a USB cable plugged in for monitoring while the UI talks UDP.

## Running Tests

### Backend

```bash
cd backend
source ../env/bin/activate      # if not already active
pip install -r requirements.txt # includes pytest, pytest-asyncio, pytest-cov
python -m pytest tests/ -v --cov=app --cov-report=term-missing
```

### Frontend

```bash
cd frontend
npm install
npm run test                    # Vitest unit/integration tests (97+ tests)
npm run lint                    # ESLint
npm run build                   # TypeScript + production build check
```

### Firmware (native tests, no hardware required)

```bash
cd firmware
# With PlatformIO:
pio test -e native

# Or with system g++/clang++:
g++ -std=c++17 -Isrc -Ilib/unity/src \
  test/test_mock_hal.cpp src/hal/mock_hal.cpp lib/unity/src/unity.c \
  -o test_hal && ./test_hal
```

## Hardware

This system works with custom ESP32-based timing hardware supporting **4–8 lanes**. See the [Firmware Setup Guide](docs/firmware-setup.md) for detailed hardware connection information and the `SunnysidePWDTimer/Board/` directory for Eagle schematic and PCB designs.

### Supported Boards

| Board | MCU | Lanes | Connection |
|-------|-----|-------|------------|
| PWDTimer V2 (primary) | ESP32 | 8 | USB Serial + WiFi AP |
| SunnysideTimer V1 | ESP8266 | 4 | USB Serial only |

## Deployment

PWDTimer supports several deployment options depending on your needs.

### Option 1: Production Script (Simplest)

A single `start-prod.sh` script builds the frontend and starts a production-grade Gunicorn server that serves both the API and the web interface:

```bash
# Build frontend & start production server on port 8000
./start-prod.sh
```

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PWD_TIMER_HOST` | `0.0.0.0` | Bind address |
| `PWD_TIMER_PORT` | `8000` | Server port |
| `PWD_TIMER_WORKERS` | `1` | Gunicorn worker count |
| `PWD_TIMER_LOG_LEVEL` | `info` | Log level (debug/info/warning/error) |
| `PWD_TIMER_DB_URL` | `sqlite+aiosqlite:///data/pwdtimer.db` | Database URL |
| `PWD_TIMER_STATIC_DIR` | `frontend/dist` | Path to built frontend |
| `PWD_TIMER_WS_TOKEN` | *(empty)* | Optional WebSocket auth token |

### Option 2: Docker Compose

Run the entire stack in containers with a single command:

```bash
# Start everything
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The frontend is served by **nginx** on port 80 (configurable via `FRONTEND_PORT`), which proxies API and WebSocket requests to the backend container on port 8000.

To connect the timer hardware via USB serial from within Docker, uncomment the `devices` section in `docker-compose.yml`.

Copy `.env.example` to `.env` to customize settings:

```bash
cp .env.example .env
# Edit .env as needed, then:
docker compose up -d
```

### Option 3: Systemd (Linux auto-start)

Install as a system service for headless deployment (e.g., a dedicated Raspberry Pi):

```bash
# 1. Copy application to /opt/pwdtimer
sudo mkdir -p /opt/pwdtimer
sudo cp -r . /opt/pwdtimer/

# 2. Create dedicated user
sudo useradd -r -s /bin/false pwdtimer
sudo mkdir -p /opt/pwdtimer/data
sudo chown -R pwdtimer:pwdtimer /opt/pwdtimer

# 3. Set up Python venv and install deps
cd /opt/pwdtimer
sudo -u pwdtimer python3 -m venv env
sudo -u pwdtimer env/bin/pip install -r backend/requirements.txt gunicorn

# 4. Build frontend
cd /opt/pwdtimer/frontend && npm ci && npm run build

# 5. Install and start the service
sudo cp deploy/pwdtimer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pwdtimer

# Check status
sudo systemctl status pwdtimer
```

### Option 4: macOS launchd (auto-start)

For macOS deployments:

```bash
# 1. Copy application to /opt/pwdtimer and set up (same as steps 1-4 above)

# 2. Install the launch agent
cp deploy/com.pwdtimer.server.plist ~/Library/LaunchAgents/

# 3. Load and start
launchctl load ~/Library/LaunchAgents/com.pwdtimer.server.plist

# Check status
launchctl list | grep pwdtimer

# Stop
launchctl unload ~/Library/LaunchAgents/com.pwdtimer.server.plist
```

Logs are written to `/opt/pwdtimer/data/pwdtimer.log`.

### Option 5: Desktop App (pywebview)

Run PWDTimer as a native desktop application with a chromeless window — no browser address bar, no tab management. The app uses the OS-native webview (WebKit on macOS, Edge WebView2 on Windows, WebKitGTK on Linux).

**First-time setup:**

```bash
cd PWDTimer
python3 -m venv env
source env/bin/activate        # macOS / Linux
pip install -r backend/requirements.txt
cd frontend && npm ci && npm run build && cd ..
```

**Launch:**

```bash
./run-desktop.sh               # Native window (pywebview)
./run-desktop.sh --headless    # Opens in default browser instead
```

The launcher automatically:
- Picks a free port (no port conflicts)
- Starts the FastAPI server in the background
- Opens a native window (or browser in headless mode)
- Shuts down the server when the window is closed

> **Tip:** If pywebview is not installed, the launcher gracefully falls back to opening your default browser.

### Option 6: Standalone Binary (PyInstaller)

Package PWDTimer into a **self-contained application** — Python, all dependencies, the backend, and the built frontend are all bundled together. Transfer the app to any compatible machine with no Python installation required.

**Build:**

```bash
# macOS / Linux
cd PWDTimer
./build.sh

# Windows
cd PWDTimer
build.bat
```

The build script creates a dedicated virtual environment, installs dependencies, builds the frontend, and runs PyInstaller. Output:

| Platform | Output |
|----------|--------|
| macOS | `dist/PWDTimer.app` |
| Linux | `dist/PWDTimer` |
| Windows | `dist\PWDTimer.exe` |

**Run:**

```bash
# macOS — double-click in Finder, or from Terminal:
open dist/PWDTimer.app
./dist/PWDTimer.app/Contents/MacOS/PWDTimer            # native desktop window
./dist/PWDTimer.app/Contents/MacOS/PWDTimer --headless # opens in default browser

# Linux / Windows
./dist/PWDTimer                # native desktop window
./dist/PWDTimer --headless     # opens in default browser
./dist/PWDTimer --port 8080    # use a specific port
```

**Database location:**

The database is stored in a persistent, platform-specific directory so data survives app updates and rebuilds:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/PWDTimer/pwdtimer.db` |
| Windows | `%APPDATA%\PWDTimer\pwdtimer.db` |
| Linux | `~/.local/share/PWDTimer/pwdtimer.db` |

**Multiple databases (e.g., different congregations):**

Use the `--db` flag to point the app at any SQLite file. The directory is created automatically and the filename appears in the window title so you always know which database is loaded.

```bash
# macOS
./dist/PWDTimer.app/Contents/MacOS/PWDTimer --db ~/races/ward1.db
./dist/PWDTimer.app/Contents/MacOS/PWDTimer --db ~/races/ward2.db

# Linux / Windows
./dist/PWDTimer --db ~/races/ward1.db
./dist/PWDTimer --db ~/races/ward2.db
```

> **Tip:** Create a small shell script (or `.command` file on macOS) for each congregation so volunteers can double-click to open the right database without touching a terminal.
>
> ```bash
> #!/bin/bash
> # Ward1.command — make executable with: chmod +x Ward1.command
> /Applications/PWDTimer.app/Contents/MacOS/PWDTimer --db ~/races/ward1.db
> ```

**Zoom / scaling:**

In the desktop window, standard browser zoom shortcuts work:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl` + `=` or `+` | Zoom in |
| `Cmd/Ctrl` + `-` | Zoom out |
| `Cmd/Ctrl` + `0` | Reset to 100% |

Zoom level is saved to the browser's `localStorage` and restored on the next launch.

**Cleaning build artifacts:**

```bash
./clean.sh         # removes build/, dist/, frontend/dist/
./clean.sh --all   # also removes node_modules/ and build_env/ (full reset)
```

> **Note:** The standalone binary must be built on the same OS/architecture as the target machine (build on macOS for macOS, build on Windows for Windows).

## License

MIT
