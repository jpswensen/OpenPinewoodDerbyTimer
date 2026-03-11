/// @file mock_hal.cpp
/// @brief Mock TimerHAL implementation for desktop/CI testing.

#include "mock_hal.h"

MockTimerHAL::MockTimerHAL()
    : m_state(TimerState::RESET)
    , m_startTime(0)
    , m_numLanes(MAX_LANES)
{
    std::memset(m_endTimes, 0, sizeof(m_endTimes));
}

// ── TimerHAL interface ─────────────────────────────────────────────────────

void MockTimerHAL::init() {
    reset();
}

void MockTimerHAL::reset() {
    m_state     = TimerState::RESET;
    m_startTime = 0;
    std::memset(m_endTimes, 0, sizeof(m_endTimes));
}

bool MockTimerHAL::arm() {
    if (m_state != TimerState::RESET) {
        return false;
    }
    m_state = TimerState::SET;
    return true;
}

TimerState MockTimerHAL::getState() const {
    return m_state;
}

int MockTimerHAL::getLaneCount() const {
    return m_numLanes;
}

void MockTimerHAL::setLaneCount(int lanes) {
    if (lanes < 1)          lanes = 1;
    if (lanes > MAX_LANES)  lanes = MAX_LANES;
    m_numLanes = lanes;
}

LaneTimesSnapshot MockTimerHAL::getLaneTimes() const {
    LaneTimesSnapshot snap{};
    snap.startTime = m_startTime;
    snap.laneCount = m_numLanes;
    for (int i = 0; i < MAX_LANES; ++i) {
        snap.laneTimes[i] = m_endTimes[i];
    }
    return snap;
}

// ── Test helpers ───────────────────────────────────────────────────────────

bool MockTimerHAL::simulateStartGateOpen(uint32_t startTimeUs) {
    if (m_state != TimerState::SET) {
        return false;
    }
    m_startTime = startTimeUs;
    std::memset(m_endTimes, 0, sizeof(m_endTimes));
    m_state = TimerState::IN_RACE;
    return true;
}

bool MockTimerHAL::simulateLaneFinish(int lane, uint32_t finishTimeUs) {
    if (lane < 0 || lane >= m_numLanes) {
        return false;
    }
    // First-write-wins (mirrors ISR behaviour)
    if (m_endTimes[lane] != 0) {
        return false;
    }
    m_endTimes[lane] = finishTimeUs;
    return true;
}

void MockTimerHAL::forceState(TimerState s) {
    m_state = s;
}

void MockTimerHAL::updateState() {
    if (m_state != TimerState::IN_RACE) {
        return;
    }
    bool allFinished = true;
    for (int i = 0; i < m_numLanes; ++i) {
        if (m_endTimes[i] == 0) {
            allFinished = false;
            break;
        }
    }
    if (allFinished) {
        m_state = TimerState::FINISHED;
    }
}
