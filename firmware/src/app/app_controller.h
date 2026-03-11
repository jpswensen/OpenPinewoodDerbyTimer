/// @file app_controller.h
/// @brief Platform-independent application controller that orchestrates the
///        timer HAL and communication interfaces.
///
/// AppController is designed to be testable with MockTimerHAL and MockComm
/// on desktop builds.  The ESP32 main.cpp instantiates it and drives the
/// tick() method from FreeRTOS tasks.

#pragma once

#include "../hal/hal.h"
#include "../comm/comm_interface.h"
#include "../comm/message_protocol.h"

/// Status update rate constants (milliseconds between updates).
static constexpr uint32_t RACE_UPDATE_INTERVAL_MS  = 100;  // 10 Hz during race
static constexpr uint32_t IDLE_UPDATE_INTERVAL_MS  = 1000; // 1 Hz when idle

/// Maximum number of communication transports supported simultaneously.
static constexpr int MAX_COMM_TRANSPORTS = 2;

/// @brief Orchestrates timer HAL and comm interfaces.
///
/// The controller is deliberately transport-agnostic: it works with any
/// combination of CommInterface implementations (serial, TCP, or mocks).
class AppController {
public:
    /// @param hal           Reference to the timer hardware abstraction.
    /// @param primaryComm   First communication transport (e.g. serial).
    /// @param secondaryComm Optional second transport (e.g. TCP).  May be nullptr.
    AppController(TimerHAL& hal,
                  CommInterface& primaryComm,
                  CommInterface* secondaryComm = nullptr);

    /// Initialise the HAL and all registered transports.
    void init();

    /// Process one iteration of the main loop.
    ///
    /// @param nowMs  Current time in milliseconds (e.g. millis() on Arduino).
    ///               Using a parameter instead of reading the clock directly
    ///               makes the controller fully deterministic in tests.
    void tick(uint32_t nowMs);

    /// Read and execute commands from a single transport.
    /// @return true if at least one command was processed.
    bool processCommands(CommInterface& comm);

    /// Format and send a status update on all connected transports.
    /// @param nowUs  Current time in **microseconds** for the status message.
    void broadcastStatus(uint32_t nowUs);

    /// @return true if enough time has elapsed to warrant a status broadcast.
    bool shouldSendUpdate(uint32_t nowMs) const;

    // ── Accessors ──────────────────────────────────────────────────────

    uint32_t lastUpdateMs()          const { return m_lastUpdateMs; }
    uint32_t updateIntervalMs()      const;
    int      commandsProcessed()     const { return m_commandsProcessed; }
    int      statusMessagesSent()    const { return m_statusMessagesSent; }

private:
    void executeCommand(const ParsedCommand& cmd);
    void sendOnTransport(CommInterface& comm, const char* msg);

    TimerHAL&       m_hal;
    CommInterface*  m_transports[MAX_COMM_TRANSPORTS];
    int             m_transportCount;

    uint32_t m_lastUpdateMs;
    int      m_commandsProcessed;
    int      m_statusMessagesSent;
};
