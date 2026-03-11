# Firmware + Hardware Implementation Review (Legacy)

Date: 2026-03-11

This document reviews the existing (legacy) timer firmware variants and the accompanying hardware/PCB artifacts. It focuses on:

- firmware variants (ESP8266 + ESP32) and their status/health
- lane + start-gate pin mappings
- timing logic/state machine
- serial/TCP/WiFi configuration and message protocol
- hardware design files and the parts list

## 1) Firmware variants overview

| Variant | MCU / board | Lanes | Transport | Source | Notes / status |
|---|---:|---:|---|---|---|
| **Serial 4-lane (original)** | ESP8266 (Wemos D1 Mini / NodeMCU-style) | 4 | USB serial | `SunnysidePWDTimer/Arduino/SunnysidePWDTimer/SunnysidePWDTimer.ino` | Uses GPIO interrupts for lanes + start gate. Appears to be the most complete of the ESP8266 sketches. |
| **TCP 8-lane (ESP8266)** | ESP8266 | 8 | SoftAP + TCP :8080 (+ serial) | `SunnysidePWDTimer/Arduino/SunnysidePWDTimerTCP/SunnysidePWDTimerTCP.ino` | **Incomplete/buggy**: lane/gate interrupt attachment is present in code but commented out; additionally ISR indexing appears off-by-one (see §3). |
| **TCP 4-lane (ESP8266)** | ESP8266 | 4 | SoftAP + TCP :8080 (+ serial) | `SunnysidePWDTimer/Arduino/SunnysidePWDTimerTCP_4lane/SunnysidePWDTimerTCP_4lane.ino` | **Incomplete**: the intended interrupt approach is commented out; main loop contains a polling-based timing path (risk of missed events). |
| **ESP32 8-lane (PlatformIO project)** | ESP32 | 1–8 configurable | SoftAP + TCP :8080 + mDNS + serial | `SunnysidePWDTimer/Arduino/PWDTimer/` (`src/*.cpp`) | Most modern structure: split modules, FreeRTOS tasks, queues, `MDNS.begin("pwdtimer")`, supports `LANES,<n>*` command. |

## 2) Pin mappings (lane sensors + start gate)

### 2.1 ESP8266 (Serial 4-lane) — `SunnysidePWDTimer.ino`

```c
#define LANE1_PIN D1
#define LANE2_PIN D2
#define LANE3_PIN D5
#define LANE4_PIN D6
#define STARTGATE_PIN D7
```

- Lane pins are configured `INPUT_PULLUP` and trigger on `FALLING` (`attachInterrupt(..., FALLING)`), so sensors are expected to idle HIGH and go LOW when tripped.

### 2.2 ESP8266 (TCP 4-lane) — `SunnysidePWDTimerTCP_4lane.ino`

```c
const int LANE1_PIN = D1;
const int LANE2_PIN = D2;
const int LANE3_PIN = D5;
const int LANE4_PIN = D6;
const int STARTGATE_PIN = D7;
```

### 2.3 ESP8266 (TCP 8-lane) — `SunnysidePWDTimerTCP.ino`

```c
#define LANE1_PIN D0
#define LANE2_PIN D1
#define LANE3_PIN D2
#define LANE4_PIN D3
#define LANE5_PIN D4
#define LANE6_PIN D5
#define LANE7_PIN D6
#define LANE8_PIN D8
#define STARTGATE_PIN D7
```

### 2.4 ESP32 (PlatformIO 8-lane) — `Arduino/PWDTimer/src/gates.cpp`

```c
const int LANE1_PIN = 12;
const int LANE2_PIN = 14;
const int LANE3_PIN = 27;
const int LANE4_PIN = 26;
const int LANE5_PIN = 25;
const int LANE6_PIN = 33;
const int LANE7_PIN = 32;
const int LANE8_PIN = 23;

const int STARTGATE_PIN = 22;
```

Additional control pin:

```c
const int WIFI_MODE_PIN = 21; // Arduino/PWDTimer/src/communications.cpp
```

Notes:
- Gate/lane inputs are set to `INPUT_PULLUP`.
- Lane interrupts are attached via `attachInterruptArg(..., FALLING)`.

## 3) Timing logic + state machine

All variants share the same conceptual state machine:

```text
RESET  ->  SET  ->  IN_RACE  ->  FINISHED
```

Common meanings:
- **RESET**: idle; waiting for gate to be "armed" (closed / set)
- **SET**: gate is armed; waiting for it to open
- **IN_RACE**: start time captured; waiting for lane sensors to trip
- **FINISHED**: all lanes have end times (or some logic decides the race is complete)

### 3.1 ESP8266 Serial 4-lane: interrupt-driven end times

- `startGateInterrupt()` transitions `SET -> IN_RACE` and records `startTime = micros()`.
- Each lane ISR records `endTime[i] = micros()` once.
- After all 4 `endTime[]` values are non-zero, firmware sets `state = FINISHED`.

Implementation highlights (from `SunnysidePWDTimer.ino`):
- Lane ISRs: `lane1Interrupt()`, `lane2Interrupt()`, `lane3Interrupt()`, `lane4Interrupt()`
- Start gate ISR: `startGateInterrupt()`
- Finish time used for display/message in `FINISHED`: `max(endTime[])`

### 3.2 ESP8266 TCP 8-lane: intended interrupt design, but incomplete

In `SunnysidePWDTimerTCP.ino`, the generic lane ISR exists:

```c
void IRAM_ATTR laneInterrupt(int num) { ... endTime[num] = micros(); ... }
```

…but the actual interrupt attachment uses templated ISRs:

```c
attachInterrupt(LANE1_PIN, laneInterruptISR<1>, FALLING);
...
attachInterrupt(LANE8_PIN, laneInterruptISR<8>, FALLING);
```

This is problematic for two reasons:

1. **Off-by-one / out-of-bounds risk**: `endTime` is `endTime[NUM_TIMERS]` where `NUM_TIMERS = 8`, valid indices `0..7`. Calling `laneInterrupt(8)` would write `endTime[8]` (OOB). Similarly lane 1 uses index 1, leaving index 0 unused.
2. **The interrupt attachment appears commented out / disabled** in the TCP 4-lane variant and partially in the TCP sketches; verify before relying on these.

Given the current code, the ESP8266 TCP sketches should be treated as **experimental**.

### 3.3 ESP8266 TCP 4-lane: polling-based timing path

`SunnysidePWDTimerTCP_4lane.ino` includes a polling loop that reads lane pins and records the first time each lane reads LOW:

```c
uint8_t lanes[4] = {digitalRead(LANE1_PIN), ...};
if (lanes[num] == 0 && endTime[num] == 0) endTime[num] = currentTime;
```

Risks:
- Polling intervals and WiFi/IO delays can miss fast pulses.
- No debouncing/edge-detection; repeated LOW may be treated as a valid event unless guarded.

### 3.4 ESP32 (PlatformIO): split modules + FreeRTOS tasks

Relevant modules:
- `src/gates.cpp`: attaches interrupts and maintains `startTime` + `endTime[]`
- `src/main.cpp`: state machine and periodic outbound message
- `src/communications.cpp`: serial/TCP send+receive, mDNS, queueing

Concurrency model:
- **Gate interrupts on Core 1**: `gatepinsInterruptCoreTask` pinned to core 1, priority 10 (`GATES_TASK_PRIO`).
- **Communications on Core 0**: `communicationsCoreTask` (and `networkInitCoreTask`) pinned to core 0, priority 5.

In `gates.cpp`, lane ISRs record `endTime[num] = micros()`; the state transitions to `FINISHED` are handled in `main.cpp` by checking whether all lanes (up to `numGates`) have non-zero end times.

## 4) Communications: WiFi + TCP + Serial

### 4.1 ESP8266 TCP sketches

- SoftAP configuration:
  - `ssid = "PWDTIMER"`
  - `password = "PWDTIMER"`
  - TCP port `8080`
  - Uses `WiFi.softAP(ssid, password)` and a `WiFiServer server(8080)`.

### 4.2 ESP32 (PlatformIO) project

- SoftAP configuration (compiled with `#define ALWAYS_AP`):
  - `ssid = "PWDTIMER"`, `password = "PWDTIMER"`
  - TCP port `8080`
  - `WiFi.softAP(ssid, password)`
- mDNS:
  - `MDNS.begin("pwdtimer")` (host can try `pwdtimer.local`)

Message send/receive behavior:
- Outbound messages are queued (`xQueueSendMessages`) and periodically flushed to:
  - serial (`Serial.println(...)`)
  - TCP client 0 (`serverClients[0].println(...)`) if connected
- Inbound messages are read from serial or TCP as newline-delimited strings (`readStringUntil('\n')`) and queued (`xQueueRecvMessages`).

## 5) Protocol: timer -> host messages and host -> timer commands

### 5.1 Timer -> host message framing

All firmware variants use a `$...*` framed message; most also send messages line-delimited with `println()`.

#### ESP32 format (preferred / modern)

From `Arduino/PWDTimer/src/main.cpp`:

```c
sprintf(msgBuffer,
  "$%d,%ld,%ld,%d,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld*",
  state, startTime, currentTime, numGates,
  endTimes[0], ... endTimes[7]);
```

Fields:
1. `state` (0..4)
2. `startTime` (microseconds, `micros()`)
3. `currentTime` (microseconds)
4. `numGates` (lane count, 1..8)
5. `endTimes[0..7]` (microseconds; 0 means "not finished")

#### ESP8266 legacy formats

- Serial 4-lane and TCP 4/8-lane sketches emit `$state,startTime,currentTime,<endTimes...>*` **without** including a lane-count field.
- This means host parsing must either:
  - know the lane count out-of-band, or
  - infer it by field count, or
  - support both formats.

### 5.2 Host -> timer commands

#### ESP32 command parsing (`Arduino/PWDTimer/src/communications.cpp`)

Incoming messages are classified by prefix:

- `RESET` → `RESET_MSG`
- `LANES,...` → `SET_LANES_MSG`

Lane count parsing:

```c
int idxStart = message.indexOf(',')+1;
int idxEnd = message.indexOf('*');
String lanesStr = message.substring(idxStart,idxEnd);
return lanesStr.toInt();
```

So a typical lane command is expected to look like:

- `LANES,8*\n`

#### ESP8266 command parsing (legacy)

ESP8266 sketches often check `readString.equals("RESET")`, which is stricter and may fail if the host includes `*` or CRLF. Treat this as a compatibility risk.

## 6) Hardware artifacts (schematics, boards, parts list)

Hardware design files live in `SunnysidePWDTimer/Board/`:

- `SunnysideTimerV1.sch` / `SunnysideTimerV1.brd` / `SunnysideTimerV1.pro` — Eagle schematic/board/project
- `PWDTimer_8Lane/` — Eagle files for an 8-lane board (`PWDTimer_8Lane.sch`, `PWDTimer_8Lane.brd`, etc.)
- `SunnysideTimersDigikey.csv` — parts list export

`SunnysidePWDTimer/Board/README.md` notes:
- the 8-lane PCB design **has not been tested yet**
- the project was originally based on a 4-lane hand-soldered board
- suggested major parts include:
  - Wemos D1 Mini (ESP8266)
  - IR obstacle sensors (1 per lane)
  - a normally-closed limit switch for the start gate

### 6.1 Parts list highlights

From `SunnysideTimersDigikey.csv` (selected items):
- Molex-style connector headers and receptacles (4-pos and 2-pos)
- female crimp terminals (22–28 AWG)
- 2.1mm barrel power jack + 5V wall adapter
- shielded 4-conductor cable and 2-conductor speaker cable

The README estimates about **$80** for an 8-lane timer in low volume, potentially lower with bulk purchasing.

## 7) Gaps / risks relevant to modernization

1. **Protocol inconsistency**: some firmware variants omit `numLanes/numGates` in the `$...*` message.
2. **ESP8266 TCP variants appear incomplete**:
   - interrupt attachment commented out
   - ISR indexing issues (TCP 8-lane)
   - polling-based timing path (TCP 4-lane) risks missing short sensor events
3. **No CRC/checksum**: `$...*` framing only; corrupted frames may be misparsed.
4. **Debounce/edge conditioning**: firmware assumes clean FALLING edges; IR modules / switches can bounce.
5. **State reset behavior**: FINISHED state persists until a host RESET is received; host must be robust.

## 8) Recommendations for the modern firmware baseline

- Standardize on the ESP32 modular design (PlatformIO) as baseline.
- Keep the message format **always**: `$state,startTime,currentTime,numLanes,endTimes...*`.
- Define and test a strict command set (`RESET`, `LANES,<n>*`, and any future commands).
- Add debouncing and/or hardware filtering guidance for lane sensors and gate switch.
- Add framing hardening (e.g., CRC, sequence numbers) and a deterministic newline/terminator rule.
