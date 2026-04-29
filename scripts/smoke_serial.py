#!/usr/bin/env python3
"""
PWDTimer serial smoke test
==========================
Validates firmware ↔ host communication without needing the web UI.
Run this first after flashing new firmware to confirm the serial protocol
is working before starting the full backend + frontend.

Usage:
    python smoke_serial.py /dev/cu.YOUR_PORT        # macOS
    python smoke_serial.py /dev/ttyUSB0             # Linux
    python smoke_serial.py COM3                     # Windows

Requirements: pyserial (already installed in the project venv)
    source env/bin/activate     # from SunnysidePWDTimer_ralph/
    python PWDTimer/smoke_serial.py /dev/cu.YOUR_PORT
"""
from __future__ import annotations

import sys
import time
import re

try:
    import serial
except ImportError:
    print("ERROR: pyserial not installed.  Run:  pip install pyserial")
    sys.exit(1)

BAUD = 115200
PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
WARN = "\033[33mWARN\033[0m"


def drain(ser: serial.Serial, timeout: float = 0.3) -> list[str]:
    """Read all available lines within `timeout` seconds."""
    lines: list[str] = []
    deadline = time.time() + timeout
    while time.time() < deadline:
        if ser.in_waiting:
            raw = ser.readline()
            try:
                line = raw.decode("ascii", errors="replace").strip()
            except Exception:
                line = repr(raw)
            if line:
                lines.append(line)
        else:
            time.sleep(0.02)
    return lines


def send(ser: serial.Serial, cmd: str, wait: float = 0.3) -> list[str]:
    cmd_clean = cmd.strip()
    print(f"  >> {cmd_clean}")
    ser.write((cmd_clean + "\n").encode("ascii"))
    resp = drain(ser, wait)
    for line in resp:
        prefix = "  << "
        print(f"{prefix}{line}")
    return resp


def parse_status(line: str) -> dict | None:
    """Parse $state,startTime,currentTime,numLanes,t0..t7* frame."""
    m = re.match(r"^\$(.+)\*$", line)
    if not m:
        return None
    parts = m.group(1).split(",")
    if len(parts) < 4:
        return None
    try:
        return {
            "state": int(parts[0]),
            "start_time": int(parts[1]),
            "current_time": int(parts[2]),
            "num_lanes": int(parts[3]),
            "lane_times": [int(p) for p in parts[4:]],
        }
    except ValueError:
        return None


def wait_for_status(ser: serial.Serial, timeout: float = 3.0) -> dict | None:
    """Block until we receive a valid $...* status frame."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if ser.in_waiting:
            raw = ser.readline().decode("ascii", errors="replace").strip()
            if raw.startswith("$"):
                parsed = parse_status(raw)
                if parsed:
                    return parsed
        time.sleep(0.02)
    return None


def check(label: str, condition: bool, detail: str = "") -> bool:
    tag = PASS if condition else FAIL
    msg = f"  [{tag}] {label}"
    if detail:
        msg += f"  ({detail})"
    print(msg)
    return condition


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    port = sys.argv[1]
    print(f"\nPWDTimer Serial Smoke Test")
    print(f"Port: {port}  Baud: {BAUD}\n")

    try:
        ser = serial.Serial(port, BAUD, timeout=2)
    except serial.SerialException as e:
        print(f"ERROR: Could not open {port}: {e}")
        return 1

    passed = 0
    failed = 0

    def record(ok: bool) -> None:
        nonlocal passed, failed
        if ok:
            passed += 1
        else:
            failed += 1

    # ── 1. Boot banner ────────────────────────────────────────────────────
    print("=== 1. Boot banner ===")
    print("  (reset the ESP32 now if you don't see output in 3 s)")
    banner_lines = drain(ser, timeout=3.5)
    got_banner = any("PWDTimer" in l for l in banner_lines)
    got_ready  = any("ready" in l.lower() for l in banner_lines)
    record(check("Firmware banner received", got_banner,
                 "saw: " + "; ".join(banner_lines[:3]) if banner_lines else "nothing received"))
    record(check("DEBUG: ready received", got_ready))

    # ── 2. Idle status frame at 1 Hz ──────────────────────────────────────
    print("\n=== 2. Idle status frame ===")
    st = wait_for_status(ser, timeout=3.0)
    record(check("Status frame received", st is not None,
                 repr(st) if st else "no $...* frame seen within 3 s"))
    if st:
        record(check("State == RESET (1)", st["state"] == 1,
                     f"got state={st['state']}"))
        record(check("startTime == -1", st["start_time"] == -1,
                     f"got {st['start_time']}"))
        record(check("8 lane fields present", len(st["lane_times"]) == 8,
                     f"got {len(st['lane_times'])} fields"))
        record(check("All lane times are 0", all(t == 0 for t in st["lane_times"]),
                     str(st["lane_times"])))

    # ── 3. SET_LANES command ──────────────────────────────────────────────
    print("\n=== 3. SET_LANES command ===")
    send(ser, "SET_LANES:4", wait=0.1)
    st = wait_for_status(ser, timeout=2.0)
    if st:
        record(check("SET_LANES:4 → num_lanes == 4", st["num_lanes"] == 4,
                     f"got {st['num_lanes']}"))
    else:
        record(check("Status frame after SET_LANES:4", False, "no frame received"))

    send(ser, "SET_LANES:6", wait=0.1)
    st = wait_for_status(ser, timeout=2.0)
    if st:
        record(check("SET_LANES:6 → num_lanes == 6", st["num_lanes"] == 6,
                     f"got {st['num_lanes']}"))
    else:
        record(check("Status frame after SET_LANES:6", False, "no frame received"))

    # ── 4. Legacy LANES,n alias ───────────────────────────────────────────
    print("\n=== 4. Legacy LANES,n alias ===")
    send(ser, "LANES,4", wait=0.1)
    st = wait_for_status(ser, timeout=2.0)
    if st:
        record(check("LANES,4 → num_lanes == 4", st["num_lanes"] == 4,
                     f"got {st['num_lanes']}"))
    else:
        record(check("Status frame after LANES,4", False, "no frame received"))

    # ── 5. RESET command ─────────────────────────────────────────────────
    print("\n=== 5. RESET command ===")
    send(ser, "RESET", wait=0.2)
    st = wait_for_status(ser, timeout=2.0)
    if st:
        record(check("RESET → state == 1", st["state"] == 1,
                     f"got state={st['state']}"))
        record(check("RESET → startTime == -1", st["start_time"] == -1,
                     f"got {st['start_time']}"))
    else:
        record(check("Status frame after RESET", False, "no frame received"))

    # ── 6. ARM command (no-op, should not crash) ──────────────────────────
    print("\n=== 6. ARM command (no-op) ===")
    send(ser, "ARM", wait=0.2)
    st = wait_for_status(ser, timeout=2.0)
    record(check("ARM does not crash firmware", st is not None,
                 "no status frame after ARM — possible crash"))

    # ── 7. Unknown command (should not crash) ─────────────────────────────
    print("\n=== 7. Unknown command (robustness) ===")
    send(ser, "INVALID_XYZ_123", wait=0.2)
    st = wait_for_status(ser, timeout=2.0)
    record(check("Unknown command does not crash firmware", st is not None,
                 "no status frame — possible crash"))

    # ── 8. Continuous status — verify 1 Hz rate ───────────────────────────
    print("\n=== 8. Status rate @ RESET (expect ~1 Hz) ===")
    frames: list[float] = []
    deadline = time.time() + 4.0
    while time.time() < deadline:
        if ser.in_waiting:
            raw = ser.readline().decode("ascii", errors="replace").strip()
            if raw.startswith("$"):
                frames.append(time.time())
    if len(frames) >= 2:
        intervals = [frames[i+1] - frames[i] for i in range(len(frames)-1)]
        avg_interval = sum(intervals) / len(intervals)
        rate_ok = 0.8 <= avg_interval <= 1.5  # allow ±50% slop
        record(check(f"Idle status rate ~1 Hz", rate_ok,
                     f"avg interval {avg_interval:.2f} s over {len(frames)} frames"))
    else:
        record(check("Received ≥2 status frames in 4 s", False,
                     f"only got {len(frames)}"))

    # ── Summary ───────────────────────────────────────────────────────────
    ser.close()
    total = passed + failed
    print(f"\n{'='*45}")
    print(f"  Result: {passed}/{total} checks passed", end="")
    if failed:
        print(f"  ← {failed} FAILED")
    else:
        print("  ✓ all passed")
    print(f"{'='*45}\n")

    if failed:
        print("Next steps for failures:")
        print("  • No banner / no frames  → check USB cable, port name, baud rate")
        print("  • Wrong num_lanes        → SET_LANES parser bug in firmware")
        print("  • Crash after ARM/RESET  → state machine bug; check main.cpp")
        print("  • Wrong rate             → check loop() delay() and interval constants")
    else:
        print("Serial comms look good!  Proceed to Phase 2 (backend connect test).")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
