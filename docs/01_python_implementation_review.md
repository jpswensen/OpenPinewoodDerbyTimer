# Legacy Python/PyQt5 Implementation Review

This document summarizes the previous **Python + PyQt5** implementation located at `SunnysidePWDTimer/Python/`.
It is intended as **read-only reference** for feature parity and protocol compatibility.

## High-level architecture

**Entrypoint:** `SunnysidePWDTimer/Python/pwdtimer.py`

- Main window class: `PWDTimer(QtWidgets.QMainWindow)`
- Loads Qt Designer UI at runtime: `uic.loadUi(resource_path('mainwindow.ui'), self)`
- Owns the application state via `self.racedata = RaceData()` (from `racefiles.py`).
- Owns comms client: `self.client = PWDTimerClient()` (from `pwdtimer_communications.py`).
- Polls the hardware at ~40Hz using a `QTimer`:
  - `self.timer.start(25)`
  - `monitorTimerThread()` reads one message and updates the current-race UI.

### UI layout (tabs)
The main window (`mainwindow.ui`) is a `QTabWidget` with 3 tabs:

1. **Groups** (`RaceGroupsWidget`, `race_groups_widget.py` / `.ui`)
2. **Heats** (`RaceHeatsWidget`, `race_heats_widget.py` / `.ui`)
3. **Current Race** (`CurrentRaceWidget`, `current_race_widget.py` / `.ui`)

## Data model and persistence

**File:** `SunnysidePWDTimer/Python/racefiles.py`

### Objects
- `Racer`
  - `name: str`
  - `car_name: str`
  - `car_number: int` (note: CSV import passes a string)
  - `times: list` (per-lane times; representation differs depending on source)
- `Group`
  - `name: str`
  - `racers: list[Racer]`
- `RaceData`
  - `num_lanes: int`
  - `groups: list[Group]`
  - optional `filename` used only for loading

### JSON save/load format
- Save path is handled by the main window (`pwdtimer.py`):
  - `json.dump(self.racedata.dict(), outfile, indent=4, sort_keys=True)`
- Load path is handled by `RaceData(filename)` using `json.load()` + `dotmap.DotMap`.

`RaceData.dict()` produces:

```json
{
  "num_lanes": 8,
  "groups": [
    {
      "name": "Tiger Cubs",
      "racers": [
        {
          "name": "Jim Bob",
          "car_name": "The Flash",
          "car_number": 1,
          "times": [0, 0, 0, 0, 0, 0, 0, 0]
        }
      ]
    }
  ]
}
```

Notes:
- `times` is persisted exactly as stored; in the legacy app it’s used both as:
  - **seconds** formatted in UI (`f'{racetime:0.4f}'`), and
  - values originating from the timer protocol (**microseconds**) converted to seconds for display.

### CSV import
**Entry point:** `PWDTimer.on_import_from_csv()` → `RaceData.import_from_csv(csv_filename)`

Expected CSV row format (by position):
- `row[0]`: group name
- `row[1]`: racer name
- `row[2]`: car name
- `row[3]`: car number (stored without conversion)

Grouping behavior:
- When `row[0]` changes, a new `Group` is created and appended.

## Group and racer management (Groups tab)

**File:** `SunnysidePWDTimer/Python/race_groups_widget.py`

- Left side: group list in a `QTreeView`.
- Right side: racers table in a `QTableView` (Name / Car Name / Number).
- Supports:
  - add/remove group
  - add/remove racer within selected group
  - inline edits propagate back into `RaceData` via `dataChanged` handlers.

## Heat scheduling and display (Heats tab)

**File:** `SunnysidePWDTimer/Python/race_heats_widget.py`

Model:
- Columns represent **heats**.
- Rows represent **lanes**.
- Each cell contains the racer assigned to that lane for that heat.

Scheduling algorithm used (round-robin lane rotation):
- For racer index `i` and lane `j`, the heat column is:
  - `col = (i + j) % num_racers`

This implies that for a given heat number `h` and lane `j`, the racer index is:
- `i = (h - j) mod num_racers`

This same mapping is used in the Current Race view (see `CurrentRaceWidget.heat_to_participants`).

## Current race view and timing (Current Race tab)

**File:** `SunnysidePWDTimer/Python/current_race_widget.py`

- Renders a table with columns: Name, Lane, Time, Place.
- `update_heat_data(group, heat)` populates the racer names for the selected group/heat.
- `set_current_race_state(msg)` updates a status banner and fills in the live time values while in race.

UI elements present in `current_race_widget.ui`:
- **ACCEPT HEAT** button
- **RESET TIMER** button

(Their end-to-end behavior appears incomplete in the checked-in Python glue code.)

## Hardware communication (serial + network)

**File:** `SunnysidePWDTimer/Python/pwdtimer_communications.py`

### States
`PWDTimerState`:
- `RESET = 1`
- `SET = 2`
- `IN_RACE = 3`
- `FINISHED = 4`

### Message format
`PWDTimerMessage` expects bytes that decode to a string containing a leading `$` and a terminating `*`:

```
$state,startTime,currentTime,numLanes,endTime0,endTime1,...*\n
```

- `startTime`, `currentTime`, and `endTime*` are interpreted as **microseconds**.
- `get_lane_times()` converts to seconds:
  - if `endTime[i] == 0`, uses `(currentTime - startTime) / 1e6`
  - else uses `(endTime[i] - startTime) / 1e6`

### Serial
- Uses `pyserial` at 115200 baud: `serial.Serial(port, 115200)`

### Network
- Intended TCP host/port defaults:
  - `DEFAULT_HOST = '192.168.4.1'`
  - `DEFAULT_TCP_PORT = 8080`
- UI suggests mDNS hostname default: `pwdtimer.local` (`commdialog.ui`).

## Notable implementation gaps / issues (useful when modernizing)

These are observed directly in the checked-in legacy code and may represent unfinished work or regressions:

- **TCP connect bug:** `connect_wifi()` calls `self.sock.connect(...)` but `self.sock` is never created (`socket.socket(...)` is missing).
- **Framing/parsing bug:** `recv_message()` clears the buffer when it reads `$` but never appends `$` to the returned byte string, yet later checks `retval[0:1] != b'$'`.
- **Command naming mismatch:** `set_lane_count()` sends `LANES,{lanes}*` while the broader project context describes commands like `SET_LANES:n`.
- **Heat icon placement code path appears incomplete:** `race_heats_widget.py` references `self.participantLaneToRowCol(...)`, which is not defined on that widget class.

## Packaging / deployment

- `resources.py` provides `resource_path()` supporting PyInstaller’s `_MEIPASS` extraction directory.
- `SunnysidePWDTimer/Python/Readme.md` indicates building a contained app via `pyinstaller --windowed --add-data ... pwdtimer.py`.
