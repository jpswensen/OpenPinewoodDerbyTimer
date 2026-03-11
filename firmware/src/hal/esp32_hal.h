#pragma once

/// @file esp32_hal.h
/// @brief ESP32-specific TimerHAL implementation for the 8-lane PWDTimer board.
///
/// Pin mapping (matches the PWDTimer V2 PCB):
///   Lane 1: GPIO12    Lane 5: GPIO25
///   Lane 2: GPIO14    Lane 6: GPIO33
///   Lane 3: GPIO27    Lane 7: GPIO32
///   Lane 4: GPIO26    Lane 8: GPIO23
///   Start Gate: GPIO22
///   WiFi Mode Select: GPIO21

#ifdef ARDUINO  // Only compile on ESP32 / Arduino targets

#include "hal.h"
#include <Arduino.h>

class ESP32TimerHAL : public TimerHAL {
public:
    ESP32TimerHAL();
    ~ESP32TimerHAL() override = default;

    void       init() override;
    void       reset() override;
    bool       arm() override;

    TimerState       getState() const override;
    int              getLaneCount() const override;
    void             setLaneCount(int lanes) override;
    LaneTimesSnapshot getLaneTimes() const override;

    /// Check whether the physical start gate sensor reads as "closed" (armed).
    /// The gate pin is active-low with an internal pull-up.
    bool isStartGateClosed() const;

    /// Evaluate race progress: if all active lanes have non-zero end times,
    /// transition from IN_RACE → FINISHED.  Called from the main loop.
    void updateState() override;

    // ── Pin definitions (public so tests can inspect) ──────────────────

    static constexpr int LANE_PINS[MAX_LANES] = {
        12, 14, 27, 26, 25, 33, 32, 23
    };
    static constexpr int STARTGATE_PIN = 22;
    static constexpr int WIFI_MODE_PIN = 21;

private:
    // ── ISR helpers (must be static for attachInterruptArg) ────────────

    static void IRAM_ATTR laneISR(void* arg);
    static void IRAM_ATTR startGateISR();

    /// FreeRTOS task that configures GPIO pins and attaches interrupts on
    /// core 1 so that all timing-critical ISRs execute there.
    static void gateTask(void* pvParameters);

    // ── Shared volatile state (written by ISRs, read by main loop) ─────

    static volatile TimerState  s_state;
    static volatile uint32_t    s_startTime;
    static volatile uint32_t    s_endTimes[MAX_LANES];
    static volatile int         s_numLanes;

    /// Indices passed by pointer to laneISR so it knows which lane fired.
    static const int s_laneIndices[MAX_LANES];
};

#endif // ARDUINO
