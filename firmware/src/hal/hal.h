#pragma once

/// @file hal.h
/// @brief Abstract Hardware Abstraction Layer for the PWDTimer timing system.
///
/// Defines the interface that any timer hardware implementation must satisfy.
/// Concrete implementations exist for ESP32 real hardware and a mock used for
/// host-side unit testing.

#include <cstdint>
#include <cstddef>

/// Maximum number of lanes the system supports.
static constexpr int MAX_LANES = 8;

/// Timer state machine states.
enum class TimerState : uint8_t {
    UNDEFINED = 0,
    RESET     = 1,  ///< Idle / waiting for start gate to be armed
    SET       = 2,  ///< Start gate is closed, ready to race
    IN_RACE   = 3,  ///< Gate released, race in progress
    FINISHED  = 4   ///< All active lanes have recorded a finish time
};

/// Snapshot of lane timing data, captured atomically from ISR-managed volatiles.
struct LaneTimesSnapshot {
    uint32_t startTime;             ///< Microsecond timestamp when start gate opened (0 if not started)
    uint32_t laneTimes[MAX_LANES];  ///< Per-lane finish timestamps in microseconds (0 = not finished)
    int      laneCount;             ///< Number of active lanes for the current race
};

/// Abstract base class for timer hardware.
///
/// All timing-critical work (interrupt handling, state transitions) is managed
/// internally by the implementation.  Callers interact through the public API
/// which is safe to call from any core / thread context.
class TimerHAL {
public:
    virtual ~TimerHAL() = default;

    // ── Lifecycle ──────────────────────────────────────────────────────

    /// Initialise hardware peripherals, attach interrupts, and start any
    /// background tasks (e.g. FreeRTOS task pinned to core 1).
    virtual void init() = 0;

    // ── State control ──────────────────────────────────────────────────

    /// Reset the timer: clear all lane times, set startTime to 0, and
    /// transition to RESET state.
    virtual void reset() = 0;

    /// Arm the timer: transition from RESET → SET.
    /// In SET state the system waits for the start gate to open.
    /// Returns false if the state machine is not in RESET (caller error).
    virtual bool arm() = 0;

    // ── Queries ────────────────────────────────────────────────────────

    /// Return the current state of the timer state machine.
    virtual TimerState getState() const = 0;

    /// Return the number of active lanes (1..MAX_LANES).
    virtual int getLaneCount() const = 0;

    /// Set the number of active lanes (clamped to 1..MAX_LANES).
    virtual void setLaneCount(int lanes) = 0;

    /// Atomically snapshot the start time and per-lane finish times.
    /// The implementation must disable interrupts (or use equivalent
    /// synchronisation) to guarantee a consistent read.
    virtual LaneTimesSnapshot getLaneTimes() const = 0;
};
