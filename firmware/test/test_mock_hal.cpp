/// @file test_mock_hal.cpp
/// @brief Unit tests for the MockTimerHAL — validates the HAL interface
///        contract using deterministic desktop-side simulation.
///
/// Compile & run with: pio test -e native

#include "../src/hal/mock_hal.h"

// Minimal assert helper for native builds without a test framework
#include <cassert>
#include <cstdio>

#define TEST(name) static void name()
#define RUN(name) do { name(); std::printf("  PASS: %s\n", #name); } while(0)

// ── Tests ──────────────────────────────────────────────────────────────────

TEST(test_initial_state_is_reset) {
    MockTimerHAL hal;
    hal.init();
    assert(hal.getState() == TimerState::RESET);
}

TEST(test_default_lane_count) {
    MockTimerHAL hal;
    hal.init();
    assert(hal.getLaneCount() == MAX_LANES);
}

TEST(test_set_lane_count_clamps) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(4);
    assert(hal.getLaneCount() == 4);
    hal.setLaneCount(0);
    assert(hal.getLaneCount() == 1);   // clamped low
    hal.setLaneCount(99);
    assert(hal.getLaneCount() == MAX_LANES);  // clamped high
}

TEST(test_arm_from_reset) {
    MockTimerHAL hal;
    hal.init();
    assert(hal.arm() == true);
    assert(hal.getState() == TimerState::SET);
}

TEST(test_arm_fails_when_not_reset) {
    MockTimerHAL hal;
    hal.init();
    hal.arm();
    // Arming again from SET should fail
    assert(hal.arm() == false);
}

TEST(test_reset_clears_state) {
    MockTimerHAL hal;
    hal.init();
    hal.arm();
    hal.simulateStartGateOpen(1000);
    hal.simulateLaneFinish(0, 2000);
    hal.reset();
    assert(hal.getState() == TimerState::RESET);
    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.startTime == 0);
    for (int i = 0; i < MAX_LANES; ++i) {
        assert(snap.laneTimes[i] == 0);
    }
}

TEST(test_start_gate_transitions_to_in_race) {
    MockTimerHAL hal;
    hal.init();
    hal.arm();
    assert(hal.simulateStartGateOpen(5000) == true);
    assert(hal.getState() == TimerState::IN_RACE);
    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.startTime == 5000);
}

TEST(test_start_gate_fails_when_not_set) {
    MockTimerHAL hal;
    hal.init();
    // Not armed yet
    assert(hal.simulateStartGateOpen(5000) == false);
    assert(hal.getState() == TimerState::RESET);
}

TEST(test_lane_finish_records_time) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(4);
    hal.arm();
    hal.simulateStartGateOpen(1000);

    assert(hal.simulateLaneFinish(0, 2000) == true);
    assert(hal.simulateLaneFinish(1, 2500) == true);

    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.laneTimes[0] == 2000);
    assert(snap.laneTimes[1] == 2500);
    assert(snap.laneTimes[2] == 0);  // not finished
    assert(snap.laneTimes[3] == 0);
}

TEST(test_lane_finish_first_write_wins) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(4);
    hal.arm();
    hal.simulateStartGateOpen(1000);
    hal.simulateLaneFinish(0, 2000);

    // Second finish on same lane should be rejected
    assert(hal.simulateLaneFinish(0, 3000) == false);
    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.laneTimes[0] == 2000);  // original value
}

TEST(test_lane_finish_rejects_out_of_range) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(4);
    hal.arm();
    hal.simulateStartGateOpen(1000);

    assert(hal.simulateLaneFinish(-1, 2000) == false);
    assert(hal.simulateLaneFinish(4, 2000) == false);   // lane 4 is out of range for 4-lane config
    assert(hal.simulateLaneFinish(7, 2000) == false);
}

TEST(test_update_state_transitions_to_finished) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(3);
    hal.arm();
    hal.simulateStartGateOpen(1000);

    hal.simulateLaneFinish(0, 2000);
    hal.simulateLaneFinish(1, 2100);
    hal.updateState();
    assert(hal.getState() == TimerState::IN_RACE);  // lane 2 still missing

    hal.simulateLaneFinish(2, 2200);
    hal.updateState();
    assert(hal.getState() == TimerState::FINISHED);
}

TEST(test_update_state_noop_when_not_in_race) {
    MockTimerHAL hal;
    hal.init();
    hal.updateState();
    assert(hal.getState() == TimerState::RESET);  // no change
}

TEST(test_force_state) {
    MockTimerHAL hal;
    hal.init();
    hal.forceState(TimerState::FINISHED);
    assert(hal.getState() == TimerState::FINISHED);
}

TEST(test_full_race_cycle) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(4);

    // Reset → arm → race → finish → reset
    assert(hal.getState() == TimerState::RESET);

    hal.arm();
    assert(hal.getState() == TimerState::SET);

    hal.simulateStartGateOpen(10000);
    assert(hal.getState() == TimerState::IN_RACE);

    hal.simulateLaneFinish(0, 13500);
    hal.simulateLaneFinish(1, 13800);
    hal.simulateLaneFinish(2, 14200);
    hal.simulateLaneFinish(3, 14900);
    hal.updateState();
    assert(hal.getState() == TimerState::FINISHED);

    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.startTime == 10000);
    assert(snap.laneTimes[0] == 13500);
    assert(snap.laneTimes[1] == 13800);
    assert(snap.laneTimes[2] == 14200);
    assert(snap.laneTimes[3] == 14900);
    assert(snap.laneCount == 4);

    hal.reset();
    assert(hal.getState() == TimerState::RESET);
    snap = hal.getLaneTimes();
    assert(snap.startTime == 0);
}

TEST(test_snapshot_lane_count_consistency) {
    MockTimerHAL hal;
    hal.init();
    hal.setLaneCount(6);
    LaneTimesSnapshot snap = hal.getLaneTimes();
    assert(snap.laneCount == 6);
}

// ── Runner ─────────────────────────────────────────────────────────────────

int main() {
    std::printf("Running MockTimerHAL tests...\n");
    RUN(test_initial_state_is_reset);
    RUN(test_default_lane_count);
    RUN(test_set_lane_count_clamps);
    RUN(test_arm_from_reset);
    RUN(test_arm_fails_when_not_reset);
    RUN(test_reset_clears_state);
    RUN(test_start_gate_transitions_to_in_race);
    RUN(test_start_gate_fails_when_not_set);
    RUN(test_lane_finish_records_time);
    RUN(test_lane_finish_first_write_wins);
    RUN(test_lane_finish_rejects_out_of_range);
    RUN(test_update_state_transitions_to_finished);
    RUN(test_update_state_noop_when_not_in_race);
    RUN(test_force_state);
    RUN(test_full_race_cycle);
    RUN(test_snapshot_lane_count_consistency);
    std::printf("\nAll %d tests passed!\n", 16);
    return 0;
}
