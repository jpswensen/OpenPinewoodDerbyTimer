"""Regression tests asserting wire compatibility with the simplified
serial-only firmware (always 8 lane fields, zero-padded for inactive lanes).

These frames were captured from the firmware in `PWDTimer/firmware/`
(see comms.cpp::send_status). The parser must handle them whether or not
num_lanes < 8.
"""

from __future__ import annotations

from app.services.timer_protocol import (
    TimerState,
    extract_framed_messages,
    format_command_reset,
    format_command_set_lanes,
    parse_status_message,
)


def test_idle_reset_frame_eight_lane_padding() -> None:
    # state=RESET, no race, 4 lanes active, 8 lane fields zero-padded.
    frame = "$1,-1,12345678,4,0,0,0,0,0,0,0,0*"
    s = parse_status_message(frame)
    assert s.state == TimerState.RESET
    assert s.num_lanes == 4
    # Truncated to num_lanes:
    assert s.lane_end_times_us == [0, 0, 0, 0]


def test_in_race_partial_finish_eight_lane_padding() -> None:
    # state=IN_RACE, lane 1 finished at 100200, lane 3 at 100450, others 0.
    frame = "$3,1000000,1500000,4,100200,0,100450,0,0,0,0,0*"
    s = parse_status_message(frame)
    assert s.state == TimerState.IN_RACE
    assert s.start_time_us == 1000000
    assert s.current_time_us == 1500000
    assert s.num_lanes == 4
    assert s.lane_end_times_us == [100200, 0, 100450, 0]


def test_finished_eight_lane_full() -> None:
    frame = "$4,1000000,2000000,8,1100,1200,1300,1400,1500,1600,1700,1800*"
    s = parse_status_message(frame)
    assert s.state == TimerState.FINISHED
    assert s.num_lanes == 8
    assert s.lane_end_times_us == [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]


def test_extract_handles_back_to_back_frames() -> None:
    buf = (
        b"$1,-1,1000,4,0,0,0,0,0,0,0,0*"
        b"$2,-1,2000,4,0,0,0,0,0,0,0,0*"
        b"junk-before-next$3,5,6,4,0,0,0,0,0,0,0,0*"
    )
    frames, remaining = extract_framed_messages(buf)
    assert len(frames) == 3
    assert remaining == b""
    states = [parse_status_message(f).state for f in frames]
    assert states == [
        TimerState.RESET,
        TimerState.SET,
        TimerState.IN_RACE,
    ]


def test_command_formats_match_firmware_parser() -> None:
    # The firmware accepts: RESET, ARM, LANES,n*  and SET_LANES:n
    assert format_command_reset() == b"RESET\n"
    # SET_LANES:n is what the new backend emits; firmware accepts it.
    assert format_command_set_lanes(4) == b"SET_LANES:4\n"
