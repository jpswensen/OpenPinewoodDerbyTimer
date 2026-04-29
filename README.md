# Open Pinewood Derby Timer

PWDTimer is a modern Pinewood Derby timing and race-management system. It combines an ESP32-based 8-lane timer board, PlatformIO firmware, a FastAPI backend, and a React web UI for race setup, live timing, results, and certificates.

This repository is intended to be published as `OpenPinewoodDerbyTimer`.

## Highlights

| Area | What it provides |
| --- | --- |
| Race management | Groups, racers, CSV import/export, race creation, and heat generation |
| Live race UI | WebSocket updates, lane timing, DNF handling, heat acceptance, and fullscreen/projector mode |
| Results | Overall and group standings, per-lane times, PDF results export |
| Awards | Winner and participation certificate generation |
| Hardware | ESP32 8-lane board design with USB serial and optional Wi-Fi UDP transport |
| Packaging | Development scripts, production server script, Docker Compose, and PyInstaller desktop app build |

## Repository layout

```text
PWDTimer/
├── assets/branding/          # Source logo/branding assets
├── backend/                  # FastAPI app, database models, services, tests
├── docs/                     # User, API, firmware, troubleshooting, and roadmap docs
├── example_racer_files/      # Example CSV imports, including racers_demo.csv
├── firmware/                 # ESP32 PlatformIO firmware
├── frontend/                 # React + TypeScript + Tailwind UI
├── hardware/                 # Current Eagle schematic/board design
├── packaging/
│   ├── deploy/               # systemd/launchd examples
│   ├── icons/                # App icons for packaged builds
│   └── pyinstaller/          # PyInstaller spec
├── scripts/                  # Build, run, clean, and serial smoke-test scripts
├── docker-compose.yml
└── README.md
```

Generated local folders such as `build/`, `dist/`, `build_env/`, `frontend/dist/`, `frontend/node_modules/`, firmware `.pio/`, local databases, and cache files are intentionally ignored.

## Quick start for development

Prerequisites:

- Python 3.11+
- Node.js 18+ and npm 9+
- PlatformIO 6+ only if you are building/flashing firmware

```bash
cd PWDTimer
python3 -m venv env
source env/bin/activate
pip install -r backend/requirements.txt

cd frontend
npm install
cd ..

./scripts/start.sh
```

Open `http://localhost:5173`. The backend runs at `http://localhost:8000`.

Useful overrides:

```bash
BACKEND_PORT=9000 FRONTEND_PORT=3000 ./scripts/start.sh
PWD_TIMER_CORS_ORIGINS=http://localhost:3000 ./scripts/start.sh
```

## Race-day / packaged use

For a race runner who is not modifying code, see the [User Manual](docs/user-guide.md). It explains importing `example_racer_files/racers_demo.csv`, setting lanes, connecting the timer, generating heats, running races, and exporting results/certificates.

Desktop-style launch from source:

```bash
./scripts/run-desktop.sh
./scripts/run-desktop.sh --headless
```

Standalone package build:

```bash
./scripts/build.sh        # macOS/Linux
scripts\build.bat        # Windows
```

Outputs:

| Platform | Output |
| --- | --- |
| macOS | `dist/PWDTimer.app` |
| Linux | `dist/PWDTimer` |
| Windows | `dist\PWDTimer.exe` |

The packaged app stores its default database in the platform application-data directory. Use `--db /path/to/race.db` to keep separate race databases.

## Firmware and hardware

The active hardware design is `hardware/PWDTimer_8Lane/`. It matches the firmware pin map in `firmware/src/gates.cpp`.

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

Default Wi-Fi UDP firmware settings when `PWDTIMER_ENABLE_WIFI=1` is enabled:

| Setting | Value |
| --- | --- |
| SSID | `PWDTimer` |
| Password | `pinewood2025` |
| Device IP | `192.168.4.1` |
| Command port | UDP `9100` |
| Status broadcast port | UDP `9101` |

USB serial remains available even when Wi-Fi is enabled.

## Validation commands

```bash
cd backend
python3 -m pytest tests

cd ../frontend
npm run lint
npm run test
npm run build

cd ../firmware
pio run
```

## Documentation

| Document | Purpose |
| --- | --- |
| [User Manual](docs/user-guide.md) | Race-runner workflow for an already-built system |
| [Firmware Setup](docs/firmware-setup.md) | Flashing, pin map, protocol, and hardware connection notes |
| [Hardware README](hardware/README.md) | Eagle files, connector map, and board fabrication notes |
| [API Reference](docs/api-reference.md) | Main REST/WebSocket endpoints |
| [Troubleshooting](docs/troubleshooting.md) | Startup, hardware, timing, and packaging issues |
| [Review and Roadmap](docs/code-review-roadmap.md) | Known risks, fixes made during prep, and recommended future work |

## Preparing a remote repository while preserving history

`PWDTimer` is already a Git repository. To publish it to the empty remote while retaining this history:

```bash
cd PWDTimer
git remote add origin https://github.com/jpswensen/OpenPinewoodDerbyTimer.git
git push -u origin main
```

Do this only after reviewing the final diff.

## License

MIT
