# PWDTimer Firmware Setup Guide

This guide covers flashing the ESP32 firmware, hardware connections, and pin mappings for the PWDTimer timing system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Hardware Overview](#hardware-overview)
- [Pin Mapping](#pin-mapping)
- [Wiring Diagram](#wiring-diagram)
- [Building the Firmware](#building-the-firmware)
- [Flashing the ESP32](#flashing-the-esp32)
- [WiFi Configuration](#wifi-configuration)
- [OTA Updates](#ota-updates)
- [Boot Modes](#boot-modes)
- [Communication Protocol](#communication-protocol)
- [Firmware Architecture](#firmware-architecture)
- [Testing Without Hardware](#testing-without-hardware)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **PlatformIO** | 6+ | Build system and board support |
| **USB Driver** | Latest | CP2102 or CH340 driver for your ESP32 dev board |
| **Python** | 3.8+ | PlatformIO dependency |

Install PlatformIO:
```bash
pip install platformio
# or as a VS Code extension: "PlatformIO IDE"
```

## Hardware Overview

The PWDTimer V2 board uses an **ESP32-DOIT-DevKit-V1** (or compatible) with:

- **8 lane sensors** — IR obstacle avoidance modules (active LOW when car passes)
- **1 start gate sensor** — Detects when the start gate opens (active LOW)
- **WiFi mode select button** — Connected to GPIO21 (held LOW during boot for config reset)
- **Status LED** — GPIO2 (built-in blue LED on most ESP32 dev boards)

### Supported Track Configurations

| Configuration | Lanes | Description |
|---------------|-------|-------------|
| 4-lane | 4 | Standard Cub Scout derby track |
| 6-lane | 6 | Extended track |
| 8-lane | 8 | Full-size tournament track |

The firmware auto-detects lane count from the `SET_LANES` command or NVS-stored configuration.

## Pin Mapping

### ESP32 8-Lane (PWDTimer V2 — Primary Target)

```
┌─────────────────────────────────────────┐
│              ESP32 DevKit               │
│                                         │
│  GPIO12 ── Lane 1 sensor (IR)           │
│  GPIO14 ── Lane 2 sensor (IR)           │
│  GPIO27 ── Lane 3 sensor (IR)           │
│  GPIO26 ── Lane 4 sensor (IR)           │
│  GPIO25 ── Lane 5 sensor (IR)           │
│  GPIO33 ── Lane 6 sensor (IR)           │
│  GPIO32 ── Lane 7 sensor (IR)           │
│  GPIO23 ── Lane 8 sensor (IR)           │
│                                         │
│  GPIO22 ── Start gate sensor            │
│  GPIO21 ── WiFi mode select button      │
│  GPIO2  ── Status LED (built-in)        │
│                                         │
│  USB    ── Serial communication         │
│  WiFi   ── TCP on port 8080             │
└─────────────────────────────────────────┘
```

### Pin Configuration Details

| GPIO | Function | Mode | Interrupt | Notes |
|------|----------|------|-----------|-------|
| 12 | Lane 1 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 14 | Lane 2 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 27 | Lane 3 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 26 | Lane 4 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 25 | Lane 5 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 33 | Lane 6 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 32 | Lane 7 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 23 | Lane 8 | INPUT_PULLUP | FALLING | IR sensor, active LOW |
| 22 | Start gate | INPUT_PULLUP | — | Polled; LOW = gate closed |
| 21 | Config button | INPUT_PULLUP | — | Hold LOW during boot = factory reset |
| 2 | Status LED | OUTPUT | — | WiFi status indicator |

### Legacy ESP8266 4-Lane (SunnysideTimer V1)

For reference, the original 4-lane ESP8266 board used:

| GPIO | Function |
|------|----------|
| D1 (GPIO5) | Lane 1 |
| D2 (GPIO4) | Lane 2 |
| D5 (GPIO14) | Lane 3 |
| D6 (GPIO12) | Lane 4 |
| D7 (GPIO13) | Start gate |

## Wiring Diagram

### Lane Sensor Connection (per lane)

```
ESP32 GPIO ──────┐
                 │
  3.3V ──[IR Module VCC]
  GND  ──[IR Module GND]
  GPIO ──[IR Module OUT]──── (to ESP32 input pin)
                 │
              ┌──┴──┐
              │ IR  │  ← mounted at finish line,
              │ Mod │    beam broken by passing car
              └─────┘
```

Each IR obstacle avoidance module:
- **VCC** → 3.3V (or 5V if module supports it)
- **GND** → Ground
- **OUT** → ESP32 GPIO pin (with internal pull-up enabled)
- Output goes **LOW** when an obstacle (car) blocks the IR beam

### Start Gate Sensor

```
ESP32 GPIO22 ────┐
                 │
              ┌──┴──┐
              │Reed │  ← or microswitch at start gate
              │Sw.  │    closes when gate is down (armed)
              └──┬──┘
                 │
  GND  ──────────┘
```

The start gate sensor should be:
- **Closed (LOW)** when the gate is in the down/closed/armed position
- **Open (HIGH via pullup)** when the gate is released/open

## Building the Firmware

### Using PlatformIO CLI

```bash
cd PWDTimer/firmware

# Compile for ESP32
pio run

# Compile and upload
pio run --target upload

# Open serial monitor
pio device monitor
```

### Using PlatformIO IDE (VS Code)

1. Open the `PWDTimer/firmware` folder in VS Code.
2. PlatformIO auto-detects `platformio.ini`.
3. Click the **Build** button (✓) in the bottom toolbar.
4. Click **Upload** (→) to flash to a connected ESP32.

### Build Configuration

The `platformio.ini` file defines two environments:

```ini
[env:esp32dev]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
board_build.partitions = min_spiffs.csv  # Required for OTA support

[env:native]
platform = native
build_flags = -DMOCK_HAL -std=c++17 -Isrc
test_framework = unity
```

## Flashing the ESP32

### First-Time Flash (USB)

1. Connect the ESP32 via USB.
2. Ensure the USB driver is installed (CP2102 or CH340).
3. Identify the serial port:
   ```bash
   # macOS
   ls /dev/cu.usb*

   # Linux
   ls /dev/ttyUSB*

   # Windows
   # Check Device Manager → Ports (COM & LPT)
   ```
4. Flash:
   ```bash
   cd PWDTimer/firmware
   pio run --target upload --upload-port /dev/cu.usbserial-0001
   ```
5. Monitor output:
   ```bash
   pio device monitor --port /dev/cu.usbserial-0001
   ```

### Expected Boot Output

```
[INFO] PWDTimer Firmware v1.0
[INFO] Lane count: 4 (from NVS)
[INFO] WiFi AP started: SSID=PWDTIMER
[INFO] mDNS: pwdtimer.local
[INFO] TCP server on port 8080
[INFO] OTA ready: hostname=pwdtimer
[INFO] Timing task started on core 1
[INFO] Comm task started on core 0
[INFO] State: RESET
```

## WiFi Configuration

### Default Settings

| Setting | Value |
|---------|-------|
| SSID | `PWDTIMER` |
| Password | `PWDTIMER` |
| IP Address | `192.168.4.1` |
| TCP Port | `8080` |
| mDNS Hostname | `pwdtimer.local` |

The ESP32 runs as a **WiFi Access Point** (SoftAP). Connect your computer directly to the `PWDTIMER` network.

### Connecting to the Timer via WiFi

1. Power on the ESP32.
2. Wait for the blue LED to indicate WiFi is ready.
3. On your computer, connect to the `PWDTIMER` WiFi network.
4. The timer is reachable at:
   - **IP:** `192.168.4.1:8080`
   - **mDNS:** `pwdtimer.local:8080` (if your OS supports mDNS/Bonjour)

### Customizing WiFi Credentials

WiFi SSID and password are stored in ESP32 **NVS (Non-Volatile Storage)**. To change them:

1. Modify the defaults in firmware source before flashing, or
2. Use the factory reset procedure (see [Boot Modes](#boot-modes)) and re-configure.

## OTA Updates

The firmware supports **Over-The-Air (OTA)** updates via the ArduinoOTA library.

### Requirements

- ESP32 and your computer must be on the same network (connect to the PWDTIMER AP).
- PlatformIO with OTA support.

### Performing an OTA Update

```bash
cd PWDTimer/firmware
pio run --target upload --upload-port pwdtimer.local
# or by IP:
pio run --target upload --upload-port 192.168.4.1
```

### OTA Notes

- The partition table uses `min_spiffs.csv` to provide enough space for OTA.
- OTA hostname is `pwdtimer`.
- Progress and errors are logged to serial.
- If OTA fails, USB flashing always works as a fallback.

## Boot Modes

### Normal Boot

Power on the ESP32 normally. It loads the stored configuration (lane count, WiFi credentials) from NVS and starts the timing and communication tasks.

### Factory Reset

To reset all configuration to defaults:

1. Hold **GPIO21** (WiFi mode select button) **LOW** during boot.
2. Keep holding for **2 seconds** after power-on.
3. The LED blinks rapidly to confirm the reset.
4. Release the button.

This resets:
- Lane count → 4 (default)
- WiFi SSID → `PWDTIMER`
- WiFi password → `PWDTIMER`

## Communication Protocol

### Status Messages (Firmware → Host)

Format: `$state,startTime,currentTime,numLanes,endTime[0],endTime[1],...,endTime[n-1]*`

All times are in **microseconds** (`uint32_t`).

| Field | Type | Description |
|-------|------|-------------|
| `state` | uint | Timer state: 1=RESET, 2=SET, 3=IN_RACE, 4=FINISHED |
| `startTime` | uint32 | Microseconds when start gate opened |
| `currentTime` | uint32 | Current time reading |
| `numLanes` | uint | Number of active lanes (1–8) |
| `endTime[i]` | uint32 | Finish time for lane i (0 = not finished) |

**Example Messages:**

```
# Reset state, 4 lanes, no times
$1,0,0,4,0,0,0,0*

# Set state (gate closed), 4 lanes
$2,0,5000000,4,0,0,0,0*

# In race, lane 1 finished at 1.52s, lane 3 at 1.55s
$3,1000000,2500000,4,1523400,0,1550200,0*

# Finished, all lanes done
$4,1000000,3000000,4,1523400,1610500,1550200,1580100*
```

### Status Update Frequency

| State | Broadcast Rate |
|-------|---------------|
| RESET | 1 Hz |
| SET | 10 Hz |
| IN_RACE | 10 Hz |
| FINISHED | 1 Hz |

### Commands (Host → Firmware)

| Command | Description |
|---------|-------------|
| `RESET` | Transition to RESET state, clear all times |
| `ARM` | Arm the timer (SET → ready for gate release) |
| `SET_LANES:n` | Set number of active lanes (1–8) |

**Legacy command (backward compatible):**

| Command | Description |
|---------|-------------|
| `LANES,n*` | Alternative lane-setting format |

Commands are case-insensitive with optional leading whitespace. The legacy `*` terminator is tolerated.

### Transport Layers

| Transport | Configuration | Delimiter |
|-----------|--------------|-----------|
| USB Serial | 115200 baud, 8N1 | Newline (`\n`) |
| TCP | Port 8080 | Newline (`\n`) |

Both transports can be active simultaneously — the firmware broadcasts status messages to all connected clients.

## Firmware Architecture

### Dual-Core FreeRTOS Design

```
┌─────────────────────────────┐  ┌─────────────────────────────┐
│         Core 1              │  │         Core 0              │
│   (Timing — Max Priority)   │  │   (Communication)           │
│                             │  │                             │
│  ┌───────────────────────┐  │  │  ┌───────────────────────┐  │
│  │    TimingTask          │  │  │  │    CommTask            │  │
│  │  - HAL.updateState()  │  │  │  │  - Parse commands      │  │
│  │  - ISR: lane sensors  │  │  │  │  - Send status msgs    │  │
│  │  - ISR: start gate    │  │  │  │  - Serial transport    │  │
│  │  - micros() timing    │  │  │  │  - TCP transport       │  │
│  └───────────────────────┘  │  │  │  - OTA updates         │  │
│                             │  │  │  - mDNS                │  │
│                             │  │  └───────────────────────┘  │
└─────────────────────────────┘  └─────────────────────────────┘
            │                                │
            └──── FreeRTOS Queue ────────────┘
              (cross-core command dispatch)
```

### State Machine

```
    ┌─────────┐  close gate   ┌─────────┐  gate opens   ┌──────────┐
    │  RESET  │ ────────────▶ │   SET   │ ────────────▶ │ IN_RACE  │
    │  (1)    │               │   (2)   │               │   (3)    │
    └────▲────┘               └─────────┘               └────┬─────┘
         │                                                    │
         │              RESET command                         │ all lanes
         │◀───────────────────────────────────────────────────│ finished
         │                                                    │
         │                                              ┌─────▼─────┐
         │◀─────────────────────────────────────────────│ FINISHED  │
                          RESET command                 │   (4)     │
                                                        └───────────┘
```

### Key Design Decisions

- **Timing ISRs on Core 1**: GPIO interrupts for lane sensors run on Core 1 at maximum priority, isolated from WiFi and communication processing on Core 0. This minimizes timing jitter to ~1–2 μs.
- **First-write-wins**: Each lane records only the first interrupt trigger per race. Subsequent sensor bounces are ignored.
- **Atomic snapshots**: The `getSnapshot()` method provides a consistent copy of all timing data for the communication layer.
- **Watchdog timer**: Both cores have a 10-second watchdog to auto-recover from crashes.
- **Thread-safe queue**: Commands from Core 0 (comms) are dispatched to Core 1 (timing) via a FreeRTOS queue.

## Testing Without Hardware

The firmware includes a **Mock HAL** and **Mock Comm** layer for testing on a desktop computer without any ESP32 hardware.

### Running Native Tests

```bash
cd PWDTimer/firmware

# Using PlatformIO (if available)
pio test -e native

# Using g++ directly
g++ -std=c++17 -Isrc -Ilib/unity/src \
  test/test_mock_hal.cpp src/hal/mock_hal.cpp lib/unity/src/unity.c \
  -o test_hal && ./test_hal

g++ -std=c++17 -Isrc -Ilib/unity/src \
  test/test_comm.cpp src/comm/mock_comm.cpp src/comm/message_protocol.cpp \
  lib/unity/src/unity.c -o test_comm && ./test_comm

g++ -std=c++17 -Isrc -Ilib/unity/src \
  test/test_app_controller.cpp src/app/app_controller.cpp \
  src/hal/mock_hal.cpp src/comm/mock_comm.cpp src/comm/message_protocol.cpp \
  src/config/nvs_config.cpp lib/unity/src/unity.c \
  -o test_app && ./test_app
```

### Test Coverage

| Test Suite | Tests | Description |
|-----------|-------|-------------|
| HAL tests | 16 | State transitions, lane timing, edge cases |
| Comm tests | 34 | Message formatting, command parsing, queue, round-trip |
| App controller | 28 | Init, timing, commands, dual transport, NVS, full race |
| **Total** | **78** | |

## Troubleshooting

### Firmware won't upload

- **Check USB cable**: Use a data cable, not charge-only.
- **Press boot button**: Hold BOOT button on ESP32 while uploading starts.
- **Check serial port**: `ls /dev/cu.usb*` (macOS) or `ls /dev/ttyUSB*` (Linux).
- **Install driver**: CP2102 driver from Silicon Labs or CH340 from WCH.

### No WiFi AP visible

- Verify the blue LED is on (indicates WiFi active).
- Try factory reset (hold GPIO21 during boot).
- Check serial monitor for WiFi error messages.

### Lane not detecting cars

- **Sensor alignment**: Ensure IR beam crosses the track at the correct height.
- **Sensor distance**: IR obstacle modules have an adjustable potentiometer for detection range.
- **Wiring**: Verify VCC, GND, and signal connections.
- **Test with serial monitor**: Watch for state changes when manually triggering sensors.

### Timing seems inaccurate

- Ensure lane sensors trigger cleanly (no bounce). The firmware uses first-write-wins to ignore bounce, but excessively noisy sensors may trigger early.
- Verify start gate sensor triggers at the correct moment (gate release, not gate opening).
- Check that timing ISRs are on Core 1 by verifying serial output during boot.

### OTA upload fails

- Ensure your computer is connected to the PWDTIMER WiFi network.
- Check that the ESP32 has enough flash space (min_spiffs partition required).
- Try specifying the IP address directly: `--upload-port 192.168.4.1`
- Fall back to USB upload if OTA is unreliable.
