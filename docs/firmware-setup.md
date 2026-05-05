# Firmware Setup

The PWDTimer firmware targets an ESP32 DevKit-compatible board and the 8-lane hardware design in `hardware/PWDTimer_8Lane/`.

## Prerequisites

- PlatformIO 6+
- USB serial driver for your ESP32 board, if your operating system needs one
- A data-capable USB cable

Install PlatformIO CLI:

```bash
python3 -m pip install platformio
```

## Build and flash

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

The default environment is `esp32doit-devkit-v1`. The platform is pinned to the pioarduino ESP32 platform because the firmware depends on tested Arduino-ESP32 serial/Wi-Fi behavior.

## Firmware features

- ESP32 dual-core timing architecture.
- Core 1 runs the tight gate/lane polling task.
- Core 0 runs command parsing, state machine, serial TX/RX, and Wi-Fi/UDP tasks.
- Lane timing uses the Xtensa cycle counter extended to 64 bits.
- USB serial is always active.
- Wi-Fi SoftAP + UDP is enabled by `-DPWDTIMER_ENABLE_WIFI=1` in `platformio.ini`.

## Pin map

The source of truth is `firmware/src/gates.cpp`.

| Function | GPIO | Hardware net |
| --- | --- | --- |
| Lane 1 | GPIO12 | `OUT1` |
| Lane 2 | GPIO14 | `OUT2` |
| Lane 3 | GPIO27 | `OUT3` |
| Lane 4 | GPIO26 | `OUT4` |
| Lane 5 | GPIO25 | `OUT5` |
| Lane 6 | GPIO33 | `OUT6` |
| Lane 7 | GPIO32 | `OUT7` |
| Lane 8 | GPIO23 | `OUT8` |
| Start gate | GPIO22 | `GATE` |

Inputs use ESP32 internal pull-ups. Lane sensors are captured on falling edges. The start gate is considered **set** when GPIO22 reads HIGH; the race starts on the falling edge from HIGH to LOW.

## Wi-Fi / UDP settings

When Wi-Fi support is compiled in, the firmware creates a local SoftAP:

| Setting | Value |
| --- | --- |
| SSID | `PWDTimer` |
| Password | `pinewood2025` |
| Device IP | `192.168.4.1` |
| Channel | 6 |
| Max clients | 4 |
| Host-to-device commands | UDP `9100` |
| Device status broadcast | UDP `9101` |

Status frames are emitted on serial and UDP simultaneously.

## Serial and UDP protocol

Commands are newline-terminated ASCII:

| Command | Meaning |
| --- | --- |
| `RESET` | Return to reset/ready state and clear lane times |
| `ARM` | Accepted for host compatibility; current firmware auto-arms from gate state |
| `SET_LANES:n` | Set active lane count, 1 through 8 |
| `LANES,n` or `LANES n` | Legacy lane-count command accepted by parser |

Status frames:

```text
$state,startTime,currentTime,numLanes,t1,t2,t3,t4,t5,t6,t7,t8,gateSet*
```

Fields:

| Field | Meaning |
| --- | --- |
| `state` | `1=RESET`, `2=SET`, `3=IN_RACE`, `4=FINISHED` |
| `startTime` | Firmware `micros()` timestamp at start, or `-1` when idle |
| `currentTime` | Current firmware `micros()` timestamp or finish timestamp |
| `numLanes` | Active lane count |
| `t1` through `t8` | Raw firmware finish timestamps; inactive/missing lanes are `0` |
| `gateSet` | `1` when the gate input is set/armed, `0` when released/open |

The backend converts raw lane timestamps to race-relative durations before saving or displaying them.

## Hardware bench test

1. Flash the firmware.
2. Open `pio device monitor`.
3. Confirm boot text includes `PWDTimer firmware`.
4. Close the start gate and confirm status moves to `SET`.
5. Release the start gate and confirm status moves to `IN_RACE`.
6. Trigger each active lane sensor and confirm the corresponding lane timestamp becomes non-zero.
7. Confirm status moves to `FINISHED` when every active lane has triggered.
8. Send `RESET` from the monitor and confirm lane timestamps clear.

## Changing lane count

The UI normally sends lane count from Settings. For manual serial testing:

```text
SET_LANES:4
RESET
```

The firmware clamps accepted lane counts to 1 through 8.

## Notes for maintainers

- Keep `firmware/src/gates.cpp`, `hardware/README.md`, and `docs/firmware-setup.md` synchronized whenever pin assignments change.
- If disabling Wi-Fi, remove or comment `-DPWDTIMER_ENABLE_WIFI=1` in `firmware/platformio.ini`; serial remains available.
- The PlatformIO monitor intentionally uses `monitor_filters = send_on_enter` and not the pioarduino exception decoder filter because of the serial monitor issue documented in `platformio.ini`.
