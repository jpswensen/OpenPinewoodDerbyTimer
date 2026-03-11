#pragma once

/// @file mock_hal.h
/// @brief Mock TimerHAL implementation for host-side testing without hardware.
///
/// Allows deterministic control of state transitions and lane times from test
/// code so that upper layers (communication, main loop) can be verified on a
/// desktop build (PlatformIO `native` environment).

#include "hal.h"
#include <cstring>

class MockTimerHAL : public TimerHAL {
public:
    MockTimerHAL();
    ~MockTimerHAL() override = default;

    // ── TimerHAL interface ─────────────────────────────────────────────

    void       init() override;
    void       reset() override;
    bool       arm() override;

    TimerState       getState() const override;
    int              getLaneCount() const override;
    void             setLaneCount(int lanes) override;
    LaneTimesSnapshot getLaneTimes() const override;

    // ── Test helpers (not part of the HAL interface) ───────────────────

    /// Simulate the start gate opening: transitions SET → IN_RACE and
    /// records the provided startTime (microseconds).
    /// Returns false if not in SET state.
    bool simulateStartGateOpen(uint32_t startTimeUs);

    /// Simulate a car finishing on the given lane with the specified
    /// absolute microsecond timestamp.  Only records if the lane has not
    /// already been recorded (mirrors ISR first-write-wins behaviour).
    /// Returns false if lane is out of range or already finished.
    bool simulateLaneFinish(int lane, uint32_t finishTimeUs);

    /// Force the state to a specific value (for edge-case testing).
    void forceState(TimerState s);

    /// Evaluate whether the race is finished (all active lanes have
    /// non-zero times) and transition IN_RACE → FINISHED if so.
    void updateState();

private:
    TimerState m_state;
    uint32_t   m_startTime;
    uint32_t   m_endTimes[MAX_LANES];
    int        m_numLanes;
};
