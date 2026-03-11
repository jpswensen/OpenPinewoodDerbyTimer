# PWDTimer Troubleshooting Guide

Quick reference for diagnosing and resolving common issues with the PWDTimer system.

## Table of Contents

- [Application Startup](#application-startup)
- [Hardware Connection](#hardware-connection)
- [Race Timing](#race-timing)
- [Heat Scheduling](#heat-scheduling)
- [WebSocket / Real-Time Updates](#websocket--real-time-updates)
- [PDF Export & Certificates](#pdf-export--certificates)
- [Frontend Issues](#frontend-issues)
- [Firmware Issues](#firmware-issues)
- [Database Issues](#database-issues)

---

## Application Startup

### Backend won't start

**Symptom:** `ModuleNotFoundError: No module named 'fastapi'`

**Solution:** Install backend dependencies:
```bash
cd PWDTimer
source env/bin/activate      # or create a venv first: python3 -m venv env
pip install -r backend/requirements.txt
```

---

**Symptom:** `Address already in use` on port 8000

**Solution:** Another process is using port 8000. Either stop it or use a different port:
```bash
# Find what's using port 8000
lsof -i :8000

# Use a different port
BACKEND_PORT=9000 ./start.sh
```

---

**Symptom:** `sqlite3.OperationalError: database is locked`

**Solution:** Only one backend process should access the SQLite database. Ensure you don't have multiple instances running. If the database file is corrupted:
```bash
# The database is auto-created on startup; removing it starts fresh
rm PWDTimer/backend/*.db
```

### Frontend won't start

**Symptom:** `npm ERR! missing script: dev`

**Solution:** Ensure you're in the correct directory and dependencies are installed:
```bash
cd PWDTimer/frontend
npm install
npm run dev
```

---

**Symptom:** Blank page in browser

**Solution:**
1. Check the browser console (F12) for JavaScript errors.
2. Verify the frontend is running: `curl http://localhost:5173`.
3. Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on macOS).
4. Clear browser cache and retry.

---

## Hardware Connection

### Timer not found (Serial)

**Symptom:** No serial ports listed, or connection fails.

**Checklist:**
1. ✅ USB cable is a **data cable** (not charge-only).
2. ✅ USB driver installed (CP2102 from Silicon Labs, or CH340 from WCH).
3. ✅ ESP32 is powered and the LED is on.
4. ✅ Check available ports:
   ```bash
   # macOS
   ls /dev/cu.usb*

   # Linux
   ls /dev/ttyUSB*

   # Windows: Device Manager → Ports
   ```
5. ✅ You have permission to access the serial port:
   ```bash
   # Linux: add yourself to the dialout group
   sudo usermod -a -G dialout $USER
   # then log out and back in
   ```

### Timer not found (WiFi)

**Symptom:** Can't connect via TCP or mDNS.

**Checklist:**
1. ✅ Your computer is connected to the **PWDTIMER** WiFi network.
2. ✅ The ESP32 blue LED is on (WiFi AP active).
3. ✅ Try the direct IP: `192.168.4.1:8080` (don't rely on mDNS).
4. ✅ mDNS may not work on all operating systems. On Linux, install `avahi-daemon`.
5. ✅ Check if the timer responds:
   ```bash
   nc -z 192.168.4.1 8080 && echo "Reachable" || echo "Not reachable"
   ```

### Connection drops frequently

**Possible causes:**
- **WiFi interference**: Move the ESP32 and computer closer together. The SoftAP has limited range.
- **Power supply**: Use a stable USB power source. Brown-outs cause ESP32 reboots.
- **Serial cable**: Try a shorter or higher-quality USB cable.

**The backend includes automatic reconnection** — it will attempt to reconnect if the connection drops and `auto_reconnect` was enabled.

---

## Race Timing

### Lane not detecting cars

1. **Check sensor alignment**: The IR beam should cross the track at the car's expected height.
2. **Adjust sensor sensitivity**: Most IR obstacle modules have a potentiometer for range adjustment.
3. **Verify wiring**: Check VCC, GND, and signal connections match the [pin mapping](firmware-setup.md#pin-mapping).
4. **Test manually**: Block the IR sensor by hand and watch the serial monitor for state changes.
5. **Check GPIO configuration**: Ensure the correct lane count is set (`SET_LANES` command).

### Times seem too fast or too slow

- Verify the **start gate sensor** triggers at the correct moment (when the gate releases, not when it starts moving).
- Check that `startTime` in the status message is non-zero during `IN_RACE`.
- Confirm lane sensors aren't triggering prematurely (cars haven't reached the sensor yet).
- Times are in **microseconds**. Divide by 1,000,000 to get seconds. A typical derby car finishes in 1.5–4.0 seconds.

### Race stuck in IN_RACE state

The timer stays in `IN_RACE` until all active lanes have registered a finish time. If a lane sensor misses a car:

1. **Check the sensor** for that lane.
2. **Send RESET** to clear the race and re-run the heat.
3. **Reduce lane count** if a lane is consistently failing: `SET_LANES:n` (where n excludes the bad lane).

### Finish times all show 0

This means the start gate sensor isn't triggering. Verify:
1. The start gate sensor is connected to **GPIO22**.
2. The sensor reads **LOW when closed** (gate down) and **HIGH when open** (gate released).
3. The timer was in **SET** state before the gate opened.

---

## Heat Scheduling

### Not enough heats generated

The scheduler creates `max(num_racers, num_lanes)` heats. If you have fewer racers than lanes, some lanes will have byes (empty).

Verify:
- All expected racers are registered.
- Group filter is not accidentally limiting the racer pool.
- The correct race is selected.

### Racer missing from schedule

- Check that the racer is registered and has a `name`.
- If using group filter during heat generation, verify the racer is in the selected group.
- Regenerate heats if racers were added after initial generation.

### Want to re-run a heat

Click the **Repeat** button on the heat row. This creates a new heat with the same lane assignments but blank times. The original heat's times are preserved.

### Heat order is wrong

Use the **Reorder** feature on the Heats page. Drag heats to the desired order, or use the `PUT /api/races/{id}/heats/reorder` API endpoint.

---

## WebSocket / Real-Time Updates

### Race page not updating in real-time

1. **Check connection indicator** in the top-right corner of the page.
2. **Open browser dev tools** → Network → WS tab. Verify the WebSocket connection to `/ws` is open.
3. **Check backend logs** for WebSocket errors.
4. **Verify hardware connection** — the backend must be connected to the timer to relay updates.

### WebSocket authentication error

If you've set the `PWD_TIMER_WS_TOKEN` environment variable, the frontend must include the token:

```bash
# Set on the backend
export PWD_TIMER_WS_TOKEN=mysecrettoken
```

The frontend sends the token as a query parameter: `ws://localhost:8000/ws?token=mysecrettoken`. Configure this in the frontend settings or environment.

### Multiple clients see different data

All WebSocket clients receive the same broadcast events. If clients show different data:
1. Check if one client connected after a state change (late-joining clients receive the last known status).
2. Verify all clients are connected to the same backend instance.
3. Hard-refresh clients that seem stale.

---

## PDF Export & Certificates

### PDF export returns empty or errors

1. **Verify ReportLab is installed**: `pip install reportlab`
2. **Check race has completed heats**: Results are only calculated for heats with `status = "completed"`.
3. **Check backend logs** for PDF generation errors.

### Certificate fonts look wrong

The certificate generator uses built-in ReportLab fonts by default. For custom fonts:
1. Place `.ttf` font files in `PWDTimer/backend/app/assets/fonts/`.
2. Restart the backend — fonts are auto-registered on startup.

### PDF is blank or has missing data

- Ensure the race has **completed heats** with recorded times.
- Check that **race results** have been calculated (this happens automatically when a heat is marked complete).
- Verify the `race_id` in the request is correct.

---

## Frontend Issues

### Dark mode not working

- Toggle via **Settings → Theme** or the theme button in the sidebar.
- Theme preference is stored in `localStorage`. Clear browser storage if it's stuck.
- Verify Tailwind's `darkMode: 'class'` is configured in `tailwind.config.js`.

### Drag-and-drop not working

- Drag-and-drop requires a modern browser (Chrome, Firefox, Edge, Safari 14+).
- On mobile/touch devices, drag-and-drop may behave differently.
- For heat reordering: only pending heats can be reordered.
- For racer group assignment: select racers first, then drag the selection to a group.

### Page loads but shows "Loading..." forever

1. **Check backend is running**: `curl http://localhost:8000/api/health`
2. **Check CORS**: The backend must allow requests from the frontend origin.
3. **Check Vite proxy**: `vite.config.ts` should proxy `/api` and `/ws` to the backend.
4. **Check browser console** for network errors.

### Build errors after updating dependencies

```bash
cd PWDTimer/frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## Firmware Issues

### Firmware won't compile

- Ensure PlatformIO is installed: `pip install platformio`
- Check that `platformio.ini` specifies the correct board: `esp32doit-devkit-v1`
- Run `pio run` from the `PWDTimer/firmware/` directory.

### ESP32 keeps rebooting

**Common causes:**
- **Watchdog timeout**: Both FreeRTOS tasks have a 10-second watchdog. If a task hangs, the ESP32 reboots.
- **Stack overflow**: Check serial output for stack overflow messages.
- **Brown-out**: Insufficient USB power. Use a powered USB hub or wall adapter.
- **Exception**: Check the serial monitor for crash dump. Use the `esp32_exception_decoder` monitor filter.

### WiFi AP not visible after flash

1. Check serial output for WiFi initialization messages.
2. Try a factory reset (hold GPIO21 LOW during boot for 2 seconds).
3. Verify the partition table is `min_spiffs.csv` (required for OTA + WiFi).

### OTA update fails

1. Ensure your computer is on the PWDTIMER WiFi network.
2. Try using the IP address directly: `--upload-port 192.168.4.1`
3. Check that the firmware image isn't too large for the OTA partition.
4. Fall back to USB flashing if OTA is unreliable.

---

## Database Issues

### Reset the database

The SQLite database is auto-created on backend startup. To start fresh:

```bash
# Stop the backend first
rm PWDTimer/backend/*.db
# Restart the backend — a new database is created automatically
```

### Recover from a corrupted database

SQLite databases can become corrupted if the backend crashes during a write. To recover:

```bash
cd PWDTimer/backend
# Try to dump and recreate
sqlite3 pwdtimer.db ".dump" > backup.sql
rm pwdtimer.db
sqlite3 pwdtimer.db < backup.sql
```

If that fails, delete the database and start fresh. Export your data (CSV) before deleting if possible.

### Foreign key constraints not enforced

SQLite requires `PRAGMA foreign_keys = ON` for each connection. The backend sets this automatically via an engine event listener. If you access the database directly (e.g., with `sqlite3` CLI), remember to run:

```sql
PRAGMA foreign_keys = ON;
```

---

## Getting Help

If you've tried the above solutions and still have issues:

1. Check the **backend logs** (terminal where `start.sh` is running).
2. Check the **browser console** (F12 → Console tab) for frontend errors.
3. Check the **serial monitor** for firmware debug output.
4. File an issue with:
   - Steps to reproduce
   - Error messages / logs
   - OS and browser version
   - Hardware configuration (board type, lane count)
