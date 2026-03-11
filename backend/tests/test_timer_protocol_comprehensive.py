"""Comprehensive tests for the timer protocol module."""

from __future__ import annotations

import pytest

from app.services.timer_protocol import (
    TimerState,
    TimerStatus,
    extract_framed_messages,
    format_command_arm,
    format_command_reset,
    format_command_set_lanes,
    parse_status_message,
)


class TestTimerStateEnum:
    def test_state_values(self):
        assert TimerState.RESET == 1
        assert TimerState.SET == 2
        assert TimerState.IN_RACE == 3
        assert TimerState.FINISHED == 4

    def test_state_name_property(self):
        s = TimerStatus(state=1, start_time_us=None, current_time_us=None, num_lanes=None, lane_end_times_us=[])
        assert s.state_name == "RESET"

    def test_unknown_state_name(self):
        s = TimerStatus(state=99, start_time_us=None, current_time_us=None, num_lanes=None, lane_end_times_us=[])
        assert "UNKNOWN" in s.state_name

    def test_frozen_status(self):
        s = TimerStatus(state=1, start_time_us=0, current_time_us=0, num_lanes=4, lane_end_times_us=[])
        with pytest.raises(AttributeError):
            s.state = 2  # type: ignore


class TestExtractFramedMessages:
    def test_empty_buffer(self):
        frames, remaining = extract_framed_messages(b"")
        assert frames == []
        assert remaining == b""

    def test_single_complete_frame(self):
        frames, remaining = extract_framed_messages(b"$1,0,0,4,0,0,0,0*")
        assert len(frames) == 1
        assert frames[0] == "$1,0,0,4,0,0,0,0*"
        assert remaining == b""

    def test_partial_frame(self):
        frames, remaining = extract_framed_messages(b"$1,0,0,4")
        assert frames == []
        assert remaining == b"$1,0,0,4"

    def test_junk_before_frame(self):
        frames, remaining = extract_framed_messages(b"junk$1,0,0,4*")
        assert len(frames) == 1
        assert frames[0] == "$1,0,0,4*"

    def test_multiple_frames(self):
        buf = b"$1,0,0,4*$2,100,200,4*"
        frames, remaining = extract_framed_messages(buf)
        assert len(frames) == 2
        assert frames[0].startswith("$1")
        assert frames[1].startswith("$2")

    def test_frame_with_trailing_data(self):
        frames, remaining = extract_framed_messages(b"$1,0,0,4*trailing$2,0")
        assert len(frames) == 1
        assert remaining == b"$2,0"

    def test_no_dollar_sign(self):
        frames, remaining = extract_framed_messages(b"no frames here")
        assert frames == []
        assert remaining == b""

    def test_dollar_but_no_star(self):
        frames, remaining = extract_framed_messages(b"$incomplete")
        assert frames == []
        assert remaining == b"$incomplete"

    def test_consecutive_frames_no_gap(self):
        buf = b"$1*$2*$3*"
        frames, remaining = extract_framed_messages(buf)
        assert len(frames) == 3


class TestParseStatusMessage:
    def test_basic_reset_message(self):
        status = parse_status_message("$1,0,0,4,0,0,0,0*")
        assert status.state == TimerState.RESET
        assert status.start_time_us == 0
        assert status.current_time_us == 0
        assert status.num_lanes == 4
        assert len(status.lane_end_times_us) == 4

    def test_in_race_message(self):
        status = parse_status_message("$3,1000000,1500000,4,0,0,0,0*")
        assert status.state == TimerState.IN_RACE
        assert status.start_time_us == 1000000
        assert status.current_time_us == 1500000

    def test_finished_with_times(self):
        status = parse_status_message("$4,1000000,5000000,4,3500000,3600000,3700000,3800000*")
        assert status.state == TimerState.FINISHED
        assert status.lane_end_times_us == [3500000, 3600000, 3700000, 3800000]

    def test_missing_lane_times_padded(self):
        status = parse_status_message("$4,0,0,4,3500000,3600000*")
        assert len(status.lane_end_times_us) == 4
        assert status.lane_end_times_us[2] is None
        assert status.lane_end_times_us[3] is None

    def test_extra_lane_times_truncated(self):
        status = parse_status_message("$4,0,0,2,100,200,300,400*")
        assert len(status.lane_end_times_us) == 2
        assert status.lane_end_times_us == [100, 200]

    def test_minimal_frame(self):
        status = parse_status_message("$1*")
        assert status.state == 1
        assert status.start_time_us is None
        assert status.num_lanes is None

    def test_invalid_frame_no_dollar(self):
        with pytest.raises(ValueError, match="invalid frame"):
            parse_status_message("1,0,0,4*")

    def test_invalid_frame_no_star(self):
        with pytest.raises(ValueError, match="invalid frame"):
            parse_status_message("$1,0,0,4")

    def test_invalid_state_not_int(self):
        with pytest.raises(ValueError, match="state must be int"):
            parse_status_message("$abc*")

    def test_negative_num_lanes_rejected(self):
        with pytest.raises(ValueError, match="num_lanes must be >= 0"):
            parse_status_message("$1,0,0,-1*")

    def test_zero_num_lanes(self):
        status = parse_status_message("$1,0,0,0*")
        assert status.num_lanes == 0
        assert status.lane_end_times_us == []

    def test_whitespace_tolerance(self):
        status = parse_status_message("  $1, 0, 0, 4*  ")
        assert status.state == 1
        assert status.num_lanes == 4

    def test_float_times_converted(self):
        status = parse_status_message("$4,0,0,1,3500000.5*")
        assert status.lane_end_times_us[0] == 3500000

    def test_eight_lane_message(self):
        times = ",".join(str(3000000 + i * 100000) for i in range(8))
        status = parse_status_message(f"$4,0,5000000,8,{times}*")
        assert status.num_lanes == 8
        assert len(status.lane_end_times_us) == 8


class TestFormatCommands:
    def test_format_reset(self):
        assert format_command_reset() == b"RESET\n"

    def test_format_arm(self):
        assert format_command_arm() == b"ARM\n"

    def test_format_set_lanes_valid(self):
        for n in range(1, 9):
            cmd = format_command_set_lanes(n)
            assert cmd == f"SET_LANES:{n}\n".encode("ascii")

    def test_format_set_lanes_too_low(self):
        with pytest.raises(ValueError):
            format_command_set_lanes(0)

    def test_format_set_lanes_too_high(self):
        with pytest.raises(ValueError):
            format_command_set_lanes(9)

    def test_format_set_lanes_negative(self):
        with pytest.raises(ValueError):
            format_command_set_lanes(-1)
