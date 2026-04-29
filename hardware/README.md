# PWDTimer Hardware

This directory contains the current 8-lane circuit design used by the upgraded PWDTimer ESP32 firmware and web UI.

## Active board

`PWDTimer_8Lane/` is the board that matches the firmware in `../firmware/`.

| File | Purpose |
| --- | --- |
| `PWDTimer_8Lane.pro` | Autodesk EAGLE project file |
| `PWDTimer_8Lane.sch` | Schematic |
| `PWDTimer_8Lane.brd` | PCB layout; upload this to a board house such as OSH Park |
| `PartsList.xlsx` | Parts/source list used for the prototype build |

EAGLE backup intermediates such as `*.b#*` and `*.s#*` are intentionally not included.

## What changed from the older SunnysideTimer board

The older top-level `SunnysidePWDTimer/Board` README described an untested Wemos D1 Mini / ESP8266-era board. This design is different:

- MCU target is an ESP32 DevKit-style module (`ESP32-DEVKITC-32D`/compatible 38-pin board), not a Wemos D1 Mini.
- Firmware supports USB serial and optional SoftAP UDP at the same time.
- The firmware timing loop is optimized for the ESP32 dual-core architecture and uses the Xtensa cycle counter for lane timestamps.
- The PCB is laid out for 8 lanes and has two ESP32 header rows to accommodate common 0.9-inch and 1.0-inch-wide 38-pin ESP32 boards.
- Lane sensors use 3-pin JST-XH style connectors; the start gate uses a 2-pin connector.

## Connector and GPIO map

The firmware pin map is defined in `firmware/src/gates.cpp` and should be kept synchronized with the schematic.

| Function | Schematic net | ESP32 GPIO | Connector |
| --- | --- | --- | --- |
| Start gate | `GATE` | GPIO22 | `P1` 2-pin JST |
| Lane 1 finish sensor | `OUT1` | GPIO12 | `J1` 3-pin JST |
| Lane 2 finish sensor | `OUT2` | GPIO14 | `J2` 3-pin JST |
| Lane 3 finish sensor | `OUT3` | GPIO27 | `J3` 3-pin JST |
| Lane 4 finish sensor | `OUT4` | GPIO26 | `J4` 3-pin JST |
| Lane 5 finish sensor | `OUT5` | GPIO25 | `J5` 3-pin JST |
| Lane 6 finish sensor | `OUT6` | GPIO33 | `J6` 3-pin JST |
| Lane 7 finish sensor | `OUT7` | GPIO32 | `J7` 3-pin JST |
| Lane 8 finish sensor | `OUT8` | GPIO23 | `J8` 3-pin JST |

Each lane connector carries signal, ground, and regulated 3.3 V for a sensor module. The start gate input uses the ESP32 internal pull-up and expects the gate sensor to present the level described in `firmware/src/gates.cpp`.

## Main parts

The included parts list captures the prototype sourcing. Equivalent parts can be substituted if the footprint and electrical requirements match.

| Item | Notes |
| --- | --- |
| ESP32 DevKit board | 38-pin ESP32 DevKit-compatible module |
| IR obstacle sensor modules | One per active lane |
| JST-XH connector set | 3-pin lane connectors and 2-pin gate connector |
| LD1117V33 regulator | Regulated 3.3 V sensor rail |
| 0.1 uF and 10 uF capacitors | Regulator/input-output decoupling |
| 0.1-inch female headers | ESP32 carrier headers |

## Fabrication notes

Open the project in Autodesk EAGLE 9.6.x or later. For typical low-volume fabrication, upload `PWDTimer_8Lane/PWDTimer_8Lane.brd` directly to the PCB manufacturer and review the generated board preview before ordering.

Before race-day use, bench-test every lane sensor and the start gate with the firmware monitor (`pio device monitor`) and then through the web UI's **Settings** and **Race** pages.
