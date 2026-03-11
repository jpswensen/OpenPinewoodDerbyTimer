/// @file app_controller.cpp
/// @brief Implementation of AppController — portable application logic.

#include "app_controller.h"
#include <cstring>

// ── Construction ────────────────────────────────────────────────────────────

AppController::AppController(TimerHAL& hal,
                             CommInterface& primaryComm,
                             CommInterface* secondaryComm)
    : m_hal(hal)
    , m_transportCount(0)
    , m_lastUpdateMs(0)
    , m_commandsProcessed(0)
    , m_statusMessagesSent(0)
{
    m_transports[m_transportCount++] = &primaryComm;
    if (secondaryComm) {
        m_transports[m_transportCount++] = secondaryComm;
    }
}

// ── Public API ──────────────────────────────────────────────────────────────

void AppController::init() {
    m_hal.init();
    for (int i = 0; i < m_transportCount; ++i) {
        m_transports[i]->init();
    }
}

void AppController::tick(uint32_t nowMs) {
    // 1. Update the HAL state machine (auto-arm, FINISHED detection).
    m_hal.updateState();

    // 2. Process incoming commands from every transport.
    for (int i = 0; i < m_transportCount; ++i) {
        processCommands(*m_transports[i]);
    }

    // 3. Broadcast status at the appropriate rate.
    if (shouldSendUpdate(nowMs)) {
        // Convert ms → µs for the status message timestamp.
        broadcastStatus(nowMs * 1000u);
        m_lastUpdateMs = nowMs;
    }
}

bool AppController::processCommands(CommInterface& comm) {
    bool processed = false;
    char buf[COMM_MAX_MSG_LEN];

    // Drain all pending commands in this call.
    while (comm.receive(buf, sizeof(buf))) {
        ParsedCommand cmd = MessageProtocol::parseCommand(buf);
        if (cmd.type != CommandType::NONE) {
            executeCommand(cmd);
            ++m_commandsProcessed;
            processed = true;
        }
    }
    return processed;
}

void AppController::broadcastStatus(uint32_t nowUs) {
    LaneTimesSnapshot snap = m_hal.getLaneTimes();
    char msg[COMM_MAX_MSG_LEN];
    size_t len = MessageProtocol::formatStatusMessage(
        msg, sizeof(msg), m_hal.getState(), snap, nowUs);

    if (len == 0) return;

    for (int i = 0; i < m_transportCount; ++i) {
        sendOnTransport(*m_transports[i], msg);
    }
    ++m_statusMessagesSent;
}

bool AppController::shouldSendUpdate(uint32_t nowMs) const {
    uint32_t interval = updateIntervalMs();
    // Handle first call (m_lastUpdateMs == 0) — always send.
    if (m_lastUpdateMs == 0 && m_statusMessagesSent == 0) return true;
    return (nowMs - m_lastUpdateMs) >= interval;
}

uint32_t AppController::updateIntervalMs() const {
    TimerState state = m_hal.getState();
    if (state == TimerState::IN_RACE || state == TimerState::SET) {
        return RACE_UPDATE_INTERVAL_MS;
    }
    return IDLE_UPDATE_INTERVAL_MS;
}

// ── Private ─────────────────────────────────────────────────────────────────

void AppController::executeCommand(const ParsedCommand& cmd) {
    switch (cmd.type) {
        case CommandType::CMD_RESET:
            m_hal.reset();
            break;
        case CommandType::CMD_ARM:
            m_hal.arm();
            break;
        case CommandType::CMD_SET_LANES:
            m_hal.setLaneCount(cmd.param);
            break;
        default:
            break;
    }
}

void AppController::sendOnTransport(CommInterface& comm, const char* msg) {
    if (comm.isConnected()) {
        comm.send(msg);
    }
}
