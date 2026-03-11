# PWDTimer User Guide

This guide walks you through running a complete Pinewood Derby event using PWDTimer.

## Table of Contents

- [Overview](#overview)
- [Starting the Application](#starting-the-application)
- [Setting Up a Race Event](#setting-up-a-race-event)
- [Managing Participants](#managing-participants)
- [Connecting the Timer Hardware](#connecting-the-timer-hardware)
- [Generating the Heat Schedule](#generating-the-heat-schedule)
- [Running Races](#running-races)
- [Viewing Results](#viewing-results)
- [Generating Certificates](#generating-certificates)
- [Tips for Race Day](#tips-for-race-day)

---

## Overview

PWDTimer manages the full lifecycle of a Pinewood Derby event:

1. **Setup** — Register racers, organize into groups, configure hardware
2. **Schedule** — Auto-generate a fair heat schedule with lane rotation
3. **Race** — Real-time timing with live display for the audience
4. **Results** — Automatic standings calculation and PDF export
5. **Awards** — Generate winner and participation certificates

## Starting the Application

```bash
cd PWDTimer
./start.sh
```

Open **http://localhost:5173** in your browser. The home page shows quick-action cards for each workflow step.

> The backend API runs on port 8000 and the frontend dev server on port 5173. In production, the frontend can be served as static files by the backend.

## Setting Up a Race Event

### Create Groups

1. Navigate to **Racers** from the sidebar.
2. Click **Add Group** in the left panel.
3. Enter a group name (e.g., "Tiger Cubs", "Wolf Den 3", "Open Class").
4. Optionally add a description.
5. Repeat for each age group or den.

### Add Racers

There are three ways to add racers:

#### Manual Entry

1. Select a group in the left panel (or "All" for ungrouped).
2. Click **Add Racer**.
3. Fill in the racer's name, car name, and car number.
4. Click **Save**.

#### CSV Import

1. Click the **Import CSV** button.
2. Upload a CSV file with columns: `name`, `car_name`, `car_number`, `group` (or `group_name`).
3. Preview the import — the dialog shows a preview table and any errors.
4. Map columns if headers differ from the defaults.
5. Click **Import** to create all racers. Groups are auto-created if they don't exist.

**Example CSV:**
```csv
name,car_name,car_number,group
John Smith,Lightning,42,Tiger Cubs
Jane Doe,Thunderbolt,17,Wolf
Bob Wilson,Speed Demon,8,Bear
```

#### Bulk Entry

Use the **Add Multiple** button to add several racers at once with the same group assignment.

### Organize Racers

- **Move between groups**: Select one or more racers, then drag onto a group name in the sidebar.
- **Unassign from group**: Drag selected racers onto "All" to remove group assignment.
- **Search**: Use the search bar to filter racers by name, car name, or car number.
- **Delete**: Select racers and click **Delete**, or use the delete button on individual rows.

## Connecting the Timer Hardware

Navigate to **Settings** to configure the hardware connection.

### USB Serial Connection

1. Connect the ESP32 timer board via USB.
2. In Settings → Connection, select **Serial** mode.
3. Click **Refresh** to scan for available serial ports.
4. Select the correct port (typically `/dev/ttyUSB0` on Linux, `/dev/cu.usbserial-*` on macOS, or `COM3` on Windows).
5. Click **Connect**.
6. The status indicator turns green when connected.

### WiFi / TCP Connection

1. Power on the ESP32 timer (it creates a WiFi access point).
2. Connect your computer to the **PWDTIMER** WiFi network (default password: `PWDTIMER`).
3. In Settings → Connection, select **Network** mode.
4. Either:
   - Click **Discover** to find the timer via mDNS (`pwdtimer.local`), or
   - Manually enter the IP address `192.168.4.1` and port `8080`.
5. Click **Connect**.

### Connection Status

The connection indicator appears in the top-right of every page:
- 🔴 **Disconnected** — No connection to timer
- 🟡 **Connecting** — Attempting to connect
- 🟢 **Connected** — Receiving timer data

### Lane Configuration

In Settings, set the number of active lanes (4, 6, or 8) to match your track. Click **Apply to Timer** to send the `SET_LANES` command to the hardware.

## Generating the Heat Schedule

1. Navigate to **Heats**.
2. Select or create a **Race** (e.g., "Pack 123 Annual Derby").
3. Set the **number of lanes** (must match the physical track).
4. Optionally filter by **group** to schedule only one group at a time.
5. Click **Generate Heats**.

### How the Schedule Works

The heat scheduler uses a **round-robin lane rotation** algorithm:

- **Every racer races once in every lane** — This ensures lane bias (fast vs. slow lanes) is eliminated.
- **Number of heats** = max(number of racers, number of lanes).
- **Bye lanes** (empty spots) appear when the racer count doesn't evenly fill all lanes.

**Example** — 6 racers on a 4-lane track:

| Heat | Lane 1 | Lane 2 | Lane 3 | Lane 4 |
|------|--------|--------|--------|--------|
| 1 | Racer A | Racer B | Racer C | Racer D |
| 2 | Racer B | Racer C | Racer D | Racer E |
| 3 | Racer C | Racer D | Racer E | Racer F |
| 4 | Racer D | Racer E | Racer F | Racer A |
| 5 | Racer E | Racer F | Racer A | Racer B |
| 6 | Racer F | Racer A | Racer B | Racer C |

### Managing Heats

- **Reorder**: Drag heats to change the running order.
- **Reassign lanes**: For pending heats, drag racer names between lane cells.
- **Repeat**: If a heat had a problem (false start, sensor issue), click **Repeat** to create a duplicate heat with the same lane assignments.
- **Print**: Click the **Print** button for a physical heat sheet to hand to race marshals.

## Running Races

1. Navigate to the **Race** page.
2. The current heat is displayed at the top with racer assignments per lane.
3. **Race states** are shown with color-coded indicators:
   - ⬜ **Ready** (RESET) — Waiting for cars to be placed
   - 🟨 **Set** — Start gate is closed, cars are positioned
   - 🟩 **Racing** (IN_RACE) — Gate opened, timing in progress
   - 🟦 **Finished** — All cars have crossed the finish line

### Timer Controls

- **Arm** — Send the ARM command to prepare the timer for a race start
- **Reset** — Send RESET to clear times and prepare for the next heat

### During a Race

- Lane cards show racer names and update with **real-time elapsed times** via WebSocket.
- As each car finishes, its **place** (1st, 2nd, 3rd…) and **finish time** appear.
- The **elapsed timer** in the center shows the race duration.

### Projector / Audience Display

Click the **Fullscreen** button (⛶) in the top-right of the Race page for a large-format display suitable for projector or big-screen viewing.

### Sound Effects

Enable race start and finish sounds in **Settings → Sound**. Adjust volume or provide custom sound file URLs.

## Viewing Results

1. Navigate to **Results**.
2. Select a race from the dropdown.
3. Results show overall standings sorted by average time.

### Standings Table

| Column | Description |
|--------|-------------|
| Place | Overall ranking |
| Name | Racer name |
| Car | Car name |
| Group | Group assignment |
| Lane 1–8 | Best time in each lane (seconds, 4 decimal places) |
| Average | Mean of all lane times |
| Best | Single fastest time |

### Features

- **Group filter** — View results for a specific group only.
- **Sort** — Click column headers to sort by place, name, average, or best time.
- **Top 3 highlighting** — Gold, silver, bronze styling for the top three positions.
- **Expandable rows** — Click a racer row to see all individual heat/lane/time/place details.
- **Statistics** — Summary stats at the top: fastest single time, closest finish margin, participation count.

### Exporting Results

- **PDF Download** — Click **Export PDF** for a professional results document with race metadata, standings table, and formatted times.
- **Print** — Use the browser's print function; a print-friendly stylesheet hides navigation elements.

## Generating Certificates

1. Navigate to **Certificates**.
2. Select a **race**.
3. Choose the certificate type:
   - **Winner** — 1st, 2nd, 3rd place (overall and/or per-group)
   - **Participation** — For all racers who participated
   - **Custom** — Participation layout with a custom message
4. Select recipients:
   - **All participants** — Everyone in the race
   - **Group** — Only racers in a specific group
   - **Individual** — Select specific racers
5. Customize fields: event name, date, issued-by name, custom message.
6. Click **Preview** to see a sample certificate.
7. Click **Generate & Download** to create a multi-page PDF (one certificate per page).

### Certificate Styles

- **Winner certificates** include place (1st/2nd/3rd), racer name, car name, and event details with decorative border and seal.
- **Participation certificates** include racer name, event name, and date with the same decorative styling.

## Tips for Race Day

### Before the Event

- [ ] Import all racers via CSV or manual entry
- [ ] Verify group assignments are correct
- [ ] Generate the heat schedule and print heat sheets
- [ ] Test the timer connection (USB or WiFi)
- [ ] Run a test race to verify all lanes detect properly
- [ ] Set up a projector connected to the Race page in fullscreen mode

### During the Event

- Keep the **Heats** page open on the organizer's laptop for heat management
- Display the **Race** page in fullscreen on the projector for the audience
- After each heat, times are automatically recorded — advance to the next heat
- If a heat needs to be re-run (sensor miss, false start), use the **Repeat** button
- Check **Results** periodically to see current standings

### After the Event

- Review final **Results** and verify standings
- Export results as **PDF** for records
- Generate **winner certificates** for top 3 in each group
- Generate **participation certificates** for all racers
- Export racer data as **CSV** for your records

### Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| Timer not connecting | Check USB cable / WiFi network, see [Troubleshooting](troubleshooting.md) |
| Lane not detecting | Check IR sensor alignment, verify GPIO connection |
| Times look wrong | Ensure lane count matches track; check for sensor bounce |
| Heat schedule wrong | Delete and regenerate heats; verify racer count and lane count |
| WebSocket disconnects | Check network stability; the frontend auto-reconnects |
