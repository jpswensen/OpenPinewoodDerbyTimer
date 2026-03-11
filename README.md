# PWDTimer - Pinewood Derby Timer Management System

A modern race management system for Pinewood Derby events with real-time timing, automatic heat scheduling, and professional results/certificates generation.

## Features

- **Participant Management**: Organize racers into groups (Tiger Cubs, Wolf, Bear, Webelos, etc.)
- **Automatic Heat Scheduling**: Fair lane rotation ensuring each racer competes in each lane
- **Real-time Race Display**: Live timing with place indicators as cars finish
- **Multiple Connection Methods**: USB Serial and WiFi/mDNS support
- **Results & Rankings**: Automatic calculation of averages, bests, and overall standings
- **PDF Export**: Professional race results documents
- **Award Certificates**: Fancy certificates for winners and participants
- **Dark Mode**: Full light/dark theme support

## System Components

- **Backend**: FastAPI + SQLite (Python)
- **Frontend**: React + TypeScript + Tailwind CSS
- **Firmware**: ESP32 with PlatformIO

## Quick Start

```bash
./start.sh
```

Then open http://localhost:5173 in your browser.

## Documentation

See the `docs/` folder for:
- User Guide
- API Reference
- Firmware Setup
- Troubleshooting

## Hardware

This system works with custom ESP32-based timing hardware supporting 4-8 lanes.
See `SunnysidePWDTimer/Board/` for hardware designs.

## License

MIT
