# PWDTimer Firmware

ESP32 firmware for the Open Pinewood Derby Timer hardware. This firmware drives the start-gate and finish-line sensors, timestamps lane finishes, and streams timer state to the backend over USB serial and, when enabled, Wi-Fi UDP.

## Target hardware

- Board environment: `esp32doit-devkit-v1`
- Physical target: ESP32 DevKit-compatible 38-pin module on the `hardware/PWDTimer_8Lane` PCB
- MCU clock: 240 MHz
- Flash clock/mode: 80 MHz QIO
- Maximum lanes: 8
- Primary host connection: USB serial at 115200 baud
- Optional host connection: SoftAP + UDP

## Build, upload, and monitor

Install PlatformIO, then run:

```bash
cd firmware
pio run
pio run -t upload
pio device monitor
```

The default build enables Wi-Fi/UDP with `-DPWDTIMER_ENABLE_WIFI=1` in `platformio.ini`. Comment out that flag for a serial-only build.

## PlatformIO configuration

`platformio.ini` intentionally uses the pioarduino ESP32 platform archive:

```ini
platform = https://github.com/pioarduino/platform-espressif32/releases/download/stable/platform-espressif32.zip
board = esp32doit-devkit-v1
framework = arduino
```

The configuration optimizes for deterministic timing:

| Setting | Reason |
| --- | --- |
| `board_build.f_cpu = 240000000L` | Makes `240` CPU cycles exactly 1 microsecond and maximizes timing-loop resolution |
| `board_build.f_flash = 80000000L` and `flash_mode = qio` | Faster instruction/data fetch from flash |
| `-O2` | Favors speed for the timing hot path |
| `-flto` | Link-time optimization for size and speed |
| `-fno-exceptions`, `-fno-rtti` | Removes unused C++ runtime overhead |
| `-DCORE_DEBUG_LEVEL=0` | Removes ESP-IDF log overhead |

`monitor_filters = send_on_enter` is used because the pioarduino exception-decoder monitor filter has been observed to drop the first character of serial lines.

## Source layout

| File | Responsibility |
| --- | --- |
| `src/main.cpp` | FreeRTOS task setup, high-level state machine, periodic status broadcasting |
| `src/gates.cpp`, `src/gates.h` | Start-gate/lane GPIO polling and timestamp conversion |
| `src/comms.cpp`, `src/comms.h` | Serial RX, command parsing, status-frame formatting, transport fan-out |
| `src/udp_comms.cpp`, `src/udp_comms.h` | UDP command receive and status broadcast bridge |
| `src/wifi_ap.cpp`, `src/wifi_ap.h` | ESP32 SoftAP startup and fixed race-day Wi-Fi settings |
| `src/state.cpp`, `src/state.h` | Global timer state enum and shared state variable |

## Pin map

The firmware pin map matches the `PWDTimer_8Lane` schematic.

| Function | Net | GPIO | Notes |
| --- | --- | --- | --- |
| Start gate | `GATE` | GPIO22 | Internal pull-up; set when HIGH, race starts on HIGH-to-LOW edge |
| Lane 1 | `OUT1` | GPIO12 | Falling edge capture |
| Lane 2 | `OUT2` | GPIO14 | Falling edge capture |
| Lane 3 | `OUT3` | GPIO27 | Falling edge capture |
| Lane 4 | `OUT4` | GPIO26 | Falling edge capture |
| Lane 5 | `OUT5` | GPIO25 | Falling edge capture |
| Lane 6 | `OUT6` | GPIO33 | Falling edge capture |
| Lane 7 | `OUT7` | GPIO32 | Falling edge capture |
| Lane 8 | `OUT8` | GPIO23 | Falling edge capture |

Inputs are configured as `INPUT_PULLUP`, so sensors should present an active-low output.

## Task architecture

The firmware splits time-critical sensor work from I/O and state management.

| Task | Core | Priority | Purpose |
| --- | ---: | ---: | --- |
| `gatesCoreTask` | 1 | `configMAX_PRIORITIES - 1` | Tight GPIO polling loop and CCOUNT timestamp capture |
| Arduino `loopTask` | 1 | default low priority | Suspended permanently; no application work runs here |
| `commsCoreTask` | 0 | 5 | Serial RX accumulator and command injection |
| `udpRxTask` | 0 | 4 | UDP command receive and line splitting |
| `stateMachineTask` | 0 | 3 | Command processing, race state transitions, status broadcasts |
| `wifiInitTask` | 0 | 1 | One-shot SoftAP/UDP startup; self-deletes after initialization |

This layout keeps the high-priority timing loop on core 1 away from serial, Wi-Fi, and backend communication work on core 0.

## Timing design and performance

The timing hot path is in `gatesCoreTask`.

1. The task snapshots the Xtensa `CCOUNT` register.
2. It immediately reads GPIO bank 0 (`GPIO_IN_REG`) and GPIO bank 1 (`GPIO_IN1_REG`).
3. All bank-0 lane pins and the start gate are sampled in one register read.
4. GPIO32/GPIO33 lanes are sampled in the second bank read only a few nanoseconds later.
5. Falling edges are detected by comparing the previous and current GPIO snapshots.
6. Finish timestamps are stored as 64-bit cycle counts and converted to microsecond timestamps when core 0 reads the snapshot.

Important performance characteristics:

| Characteristic | Detail |
| --- | --- |
| Raw counter resolution | 1 CPU cycle, about 4.17 ns at 240 MHz |
| Stored finish resolution | Cycle-count based until converted for host protocol |
| Protocol resolution | Integer microseconds |
| Race status update rate | 10 Hz in `SET` and `IN_RACE` |
| Idle status update rate | 1 Hz in `RESET` and `FINISHED` |
| State-machine loop cadence | About 100 Hz (`vTaskDelay(10 ms)`) |
| Serial RX poll cadence | About 200 Hz (`vTaskDelay(5 ms)`) |
| UDP RX poll cadence | About 200 Hz (`vTaskDelay(5 ms)`) |
| CCOUNT wrap handling | 32-bit CCOUNT is extended to 64 bits, avoiding the native ~17.9 s wrap problem |

The public protocol reports microseconds because the backend/UI and stored results use microseconds. Internally, lane ordering uses the cycle counter before conversion, so cars finishing in the same microsecond still preserve the sensor-capture ordering before the status frame is emitted.

## Cross-core data safety

Timing data is written by core 1 and read/reset by core 0. Shared timing fields are protected by a FreeRTOS `portMUX_TYPE` spinlock:

- `s_startUs`
- `s_startCycles64`
- `s_endCycles64[]`
- `s_laneFinished[]`

The lane-count value is an aligned 32-bit integer and is treated as atomically readable/writable on the ESP32 Xtensa LX6. The hot path uses task-local `localFinished[]` flags to avoid taking locks on every polling iteration except when a real timing event occurs.

## Race state machine

The state enum is:

| Value | State | Meaning |
| ---: | --- | --- |
| 1 | `RESET` | Timer is ready/idle; no active race |
| 2 | `SET` | Start gate is in the set/armed position |
| 3 | `IN_RACE` | Gate has released and active lanes are being timed |
| 4 | `FINISHED` | Every active lane has recorded a finish |

Flow:

```text
RESET --gate reads HIGH--> SET --gate falling edge--> IN_RACE --all active lanes finish--> FINISHED
```

`RESET` command returns the firmware to `RESET` and clears all lane timing data. `SET_LANES:n` changes the active lane count used to decide when a race is complete.

## Host protocol

Commands are newline-terminated ASCII. They can arrive over serial or UDP.

| Command | Effect |
| --- | --- |
| `RESET` | Clear timings and return to `RESET` |
| `ARM` | Accepted as a no-op for backend compatibility |
| `SET_LANES:n` | Set active lane count, 1 through 8 |
| `LANES,n` / `LANES n` | Legacy lane-count formats |

Status frames are emitted as:

```text
$state,startTime,currentTime,numLanes,t1,t2,t3,t4,t5,t6,t7,t8,gateSet*
```

Fields:

| Field | Meaning |
| --- | --- |
| `state` | Numeric `TimerState_t` |
| `startTime` | Firmware `micros()` timestamp when the race started, or `-1` outside a race |
| `currentTime` | Current `micros()` during race, or final max finish timestamp in `FINISHED` |
| `numLanes` | Active lane count |
| `t1`-`t8` | Raw firmware finish timestamps for each lane; inactive/untriggered lanes are `0` |
| `gateSet` | `1` when the start gate input is set/armed, `0` when released/open |

The backend converts raw finish timestamps into race-relative lane durations before displaying or saving results.

## Wi-Fi / UDP mode

When `PWDTIMER_ENABLE_WIFI` is defined, the firmware starts a SoftAP and UDP bridge. Failure to start Wi-Fi is non-fatal; serial remains active.

| Setting | Value |
| --- | --- |
| SSID | `PWDTimer` |
| Password | `pinewood2025` |
| Channel | 6 |
| Max clients | 4 |
| Device IP | ESP32 SoftAP default, normally `192.168.4.1` |
| Host-to-device command port | UDP `9100` |
| Device-to-host status broadcast port | UDP `9101` |
| Broadcast address | `255.255.255.255` |

UDP commands are split into lines and injected into the same command parser used by serial. Status frames are written to serial and broadcast over UDP from the state-machine task.

## Bench-test checklist

After flashing:

1. Open `pio device monitor`.
2. Confirm boot output says `PWDTimer firmware`.
3. Confirm `DEBUG: ready`.
4. If Wi-Fi is enabled, confirm SoftAP and UDP startup messages.
5. Send `SET_LANES:4` or the lane count you are testing.
6. Send `RESET`.
7. Move the gate to the set position and confirm state changes to `SET`.
8. Release the gate and confirm state changes to `IN_RACE`.
9. Trigger every active lane sensor and confirm lane timestamps become non-zero.
10. Confirm state changes to `FINISHED` after all active lanes trigger.
11. Send `RESET` and confirm lane fields clear.

## Design tradeoffs and limitations

- The protocol is intentionally simple ASCII for easy debugging with a serial terminal.
- Only one pending command is stored at a time. This is adequate for UI-driven commands (`RESET`, `SET_LANES`) but is not a general command queue.
- Sensor inputs assume clean active-low transitions. Mechanical/sensor bounce should be handled in hardware or by sensor alignment; the firmware records the first falling edge per lane.
- Wi-Fi credentials are compiled in for race-day simplicity, not runtime configurability.
- Status frames always include eight lane fields for parser compatibility even when fewer lanes are active.
