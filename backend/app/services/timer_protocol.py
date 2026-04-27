from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class TimerState(IntEnum):
    RESET = 1
    SET = 2
    IN_RACE = 3
    FINISHED = 4


@dataclass(frozen=True)
class TimerStatus:
    state: int
    start_time_us: int | None
    current_time_us: int | None
    num_lanes: int | None
    lane_end_times_us: list[int | None]
    gate_set: bool | None = None  # True=gate armed/up, False=gate open/released, None=old firmware

    @property
    def state_name(self) -> str:
        try:
            return TimerState(int(self.state)).name
        except Exception:
            return f"UNKNOWN({self.state})"


def extract_framed_messages(buffer: bytes) -> tuple[list[str], bytes]:
    """Extract $...* frames from a byte buffer.

    Returns (frames, remaining_buffer).
    Frames are returned as decoded ASCII strings including the leading '$' and trailing '*'.
    """

    frames: list[str] = []

    while True:
        start = buffer.find(b"$")
        if start < 0:
            # No frame start found; discard junk (can't be part of a valid frame)
            return frames, b""

        if start > 0:
            buffer = buffer[start:]

        end = buffer.find(b"*", 1)
        if end < 0:
            return frames, buffer

        raw = buffer[: end + 1]
        buffer = buffer[end + 1 :]
        frames.append(raw.decode("ascii", errors="ignore"))


def _to_int(value: str) -> int | None:
    value = value.strip()
    if value == "":
        return None
    try:
        return int(value)
    except ValueError:
        try:
            return int(float(value))
        except Exception:
            return None


def parse_status_message(frame: str) -> TimerStatus:
    """Parse a status message of the form:

        $state,startTime,currentTime,numLanes,endTime0,endTime1,...*

    All times are expected to be integer microseconds.

    The parser is strict about framing ($ ... *) but tolerant about missing fields.
    """

    frame = frame.strip()
    if not (frame.startswith("$") and frame.endswith("*")):
        raise ValueError("invalid frame: expected '$...*'")

    inner = frame[1:-1]
    parts = [p.strip() for p in inner.split(",")]
    if len(parts) < 1:
        raise ValueError("invalid frame: no fields")

    state = _to_int(parts[0])
    if state is None:
        raise ValueError("invalid frame: state must be int")

    start_time_us = _to_int(parts[1]) if len(parts) > 1 else None
    current_time_us = _to_int(parts[2]) if len(parts) > 2 else None
    num_lanes = _to_int(parts[3]) if len(parts) > 3 else None

    lane_times_raw = parts[4:] if len(parts) > 4 else []

    # The 13th field (index 12 = 4 header + 8 lane fields) is the optional
    # gateSet flag added in firmware rev 2. Old firmware omits it → None.
    gate_set: bool | None = None
    if len(lane_times_raw) > 8:
        raw_gate = lane_times_raw[8]
        v = _to_int(raw_gate)
        if v is not None:
            gate_set = bool(v)
        lane_times_raw = lane_times_raw[:8]  # strip gate field from lane list

    lane_times: list[int | None] = [_to_int(v) for v in lane_times_raw]

    if num_lanes is not None and num_lanes < 0:
        raise ValueError("invalid frame: num_lanes must be >= 0")

    # Hard cap at 8 — the firmware never declares more than 8 active lanes.
    # A larger value indicates a corrupt frame; clamp defensively.
    if num_lanes is not None and num_lanes > 8:
        num_lanes = 8

    if num_lanes is not None and num_lanes >= 0:
        # Normalize to exactly num_lanes entries.
        if len(lane_times) < num_lanes:
            lane_times = lane_times + [None] * (num_lanes - len(lane_times))
        else:
            lane_times = lane_times[:num_lanes]

    return TimerStatus(
        state=int(state),
        start_time_us=int(start_time_us) if start_time_us is not None else None,
        current_time_us=int(current_time_us) if current_time_us is not None else None,
        num_lanes=int(num_lanes) if num_lanes is not None else None,
        lane_end_times_us=lane_times,
        gate_set=gate_set,
    )


def lane_durations_us(status: "TimerStatus") -> list[int | None]:
    """Convert raw firmware lane timestamps (micros() since boot) to durations
    relative to the race start time.

    Inactive lanes (raw == 0 or None) become None. If start_time_us is missing
    or non-positive (RESET / SET state), all lanes become None too — there is
    no race underway to be relative to.
    """
    raw = status.lane_end_times_us or []
    start = status.start_time_us
    if start is None or start <= 0:
        return [None] * len(raw)
    out: list[int | None] = []
    for t in raw:
        if t is None or t <= 0:
            out.append(None)
        elif t < start:
            # Defensive: timestamp predates start; clamp to None instead of negative.
            out.append(None)
        else:
            out.append(t - start)
    return out


def format_command_reset() -> bytes:
    return b"RESET\n"


def format_command_arm() -> bytes:
    return b"ARM\n"


def format_command_set_lanes(num_lanes: int) -> bytes:
    if num_lanes < 1 or num_lanes > 8:
        raise ValueError("num_lanes must be between 1 and 8")
    return f"SET_LANES:{num_lanes}\n".encode("ascii")
