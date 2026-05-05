# Troubleshooting

## Application startup

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `ModuleNotFoundError: No module named 'fastapi'` | Backend dependencies are not installed | `python3 -m venv env && source env/bin/activate && pip install -r backend/requirements.txt` |
| `npm: command not found` | Node.js is missing | Install Node.js 18+ and rerun `npm install` in `frontend/` |
| `Address already in use` | Another process is using port 8000 or 5173 | Stop that process or run `BACKEND_PORT=9000 FRONTEND_PORT=3000 ./scripts/start.sh` |
| Browser shows a blank page | Frontend failed to build/load or backend API is unreachable | Open browser dev tools, check terminal logs, and run `npm run build` in `frontend/` |
| CORS error after changing frontend port | Backend allows the default Vite port only unless configured | Set `PWD_TIMER_CORS_ORIGINS=http://localhost:3000` or the port you use |

## Desktop app and packaging

| Symptom | Fix |
| --- | --- |
| `./scripts/run-desktop.sh` opens a browser instead of a native window | Install backend requirements; `pywebview` is in `backend/requirements.txt` |
| Packaged app opens with no UI | Rebuild the frontend first, or use `./scripts/build.sh` which builds it automatically |
| App has no saved data after moving machines | Copy the SQLite database file or launch with `--db /path/to/file.db` |
| macOS blocks the app | Control-click and choose Open, or sign/notarize for distribution |

## Serial connection

| Symptom | What to check |
| --- | --- |
| No serial ports listed | Use a data USB cable, install CP210x/CH340 driver if needed, refresh ports |
| Permission denied on Linux | Add the user to the serial group, often `dialout`, then log out/in |
| Connect succeeds but no status appears | Open `pio device monitor`, confirm firmware is running and baud rate is `115200` |
| Random disconnects | Try a shorter USB cable and stable power source |
| Status output stops after 10-20 seconds while armed or racing | Firmware is likely old enough to still hit the Core 1 task watchdog during the tight timing loop | Pull the latest firmware, re-flash the ESP32, and confirm boot output shows the updated build |

## Wi-Fi UDP connection

Default firmware settings:

| Setting | Value |
| --- | --- |
| SSID | `PWDTimer` |
| Password | `pinewood2025` |
| Device IP | `192.168.4.1` |
| Command port | `9100` |
| Status port | `9101` |

Common fixes:

- Confirm the computer is connected to the timer Wi-Fi network, not the venue Wi-Fi.
- Expect no internet while connected to the timer SoftAP.
- Leave UDP host as `192.168.4.1` unless you changed firmware networking.
- Keep the computer close to the timer; SoftAP range is limited.
- If UDP is unreliable at the venue, use USB serial.

## Sensor and timing problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Race page stays Ready | Start gate input is not reading set/armed | Check the GPIO22 gate wiring and sensor polarity |
| Race starts before the gate moves | Gate sensor is noisy, inverted, or still coupling noise despite the firmware's short start-gate low filter | Adjust the switch/sensor so set state is stable; use a shorter/shielded gate cable if needed |
| Race never finishes | One or more active lanes did not trigger | Check alignment, mark DNF, or reduce active lane count |
| A lane always shows DNF/missing | Bad sensor, cable, connector, or wrong lane count | Swap sensors/cables to isolate the issue |
| Times are impossible | Finish sensor triggered early/late or gate sensor fired at wrong moment | Re-align sensors and rerun the heat before accepting |

The firmware considers the start gate **set** when GPIO22 reads HIGH and starts the race only after GPIO22 remains LOW for 16 consecutive hot-loop samples.

## Heat scheduling

| Symptom | Fix |
| --- | --- |
| Generate heats says no racers are available | Import/add racers first; check group filter if scheduling one group |
| Wrong number of lanes in heats | Set the race lane count before generating heats |
| Need to change a lane assignment | Drag pending lane cells on the Heats page before running |
| Need to rerun a heat | Use Reset before accepting, or Repeat from the Heats page after preserving the original |

## Results and certificates

| Symptom | Fix |
| --- | --- |
| Results are empty | Accept completed heats first |
| A racer is missing from standings | Confirm the racer was assigned to generated heats and did not remain disabled |
| PDF/certificate generation fails | Check backend logs; confirm `reportlab` and `Pillow` are installed |
| Group winners look wrong | Confirm racers are assigned to the expected groups before generating/announcing |

## Cleaning local build artifacts

```bash
./scripts/clean.sh
./scripts/clean.sh --all
```

The full clean removes `frontend/node_modules/` and `build_env/`, so the next build will reinstall dependencies.
