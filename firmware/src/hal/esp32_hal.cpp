/// @file esp32_hal.cpp
/// @brief ESP32 TimerHAL implementation — interrupt-driven microsecond timing.

#ifdef ARDUINO  // Only compile on ESP32 / Arduino targets

#include "esp32_hal.h"

// ── Static member definitions ──────────────────────────────────────────────

volatile TimerState  ESP32TimerHAL::s_state      = TimerState::RESET;
volatile uint32_t    ESP32TimerHAL::s_startTime   = 0;
volatile uint32_t    ESP32TimerHAL::s_endTimes[MAX_LANES] = {0};
volatile int         ESP32TimerHAL::s_numLanes    = MAX_LANES;

const int ESP32TimerHAL::s_laneIndices[MAX_LANES] = {0, 1, 2, 3, 4, 5, 6, 7};

// ── Constructor ────────────────────────────────────────────────────────────

ESP32TimerHAL::ESP32TimerHAL() = default;

// ── Lifecycle ──────────────────────────────────────────────────────────────

void ESP32TimerHAL::init() {
    reset();

    // Pin the gate/interrupt task to core 1 at high priority so that ISR
    // latency is as low as possible and timing code never contends with
    // WiFi / comms work on core 0.
    xTaskCreatePinnedToCore(
        gateTask,
        "gateTask",
        4096,           // stack (bytes)
        nullptr,
        configMAX_PRIORITIES - 1,   // highest usable priority
        nullptr,
        1               // core 1
    );
}

// ── State control ──────────────────────────────────────────────────────────

void ESP32TimerHAL::reset() {
    portDISABLE_INTERRUPTS();
    s_state     = TimerState::RESET;
    s_startTime = 0;
    for (int i = 0; i < MAX_LANES; ++i) {
        s_endTimes[i] = 0;
    }
    portENABLE_INTERRUPTS();
}

bool ESP32TimerHAL::arm() {
    if (s_state != TimerState::RESET) {
        return false;
    }
    s_state = TimerState::SET;
    return true;
}

// ── Queries ────────────────────────────────────────────────────────────────

TimerState ESP32TimerHAL::getState() const {
    return static_cast<TimerState>(s_state);
}

int ESP32TimerHAL::getLaneCount() const {
    return s_numLanes;
}

void ESP32TimerHAL::setLaneCount(int lanes) {
    if (lanes < 1)          lanes = 1;
    if (lanes > MAX_LANES)  lanes = MAX_LANES;
    s_numLanes = lanes;
}

LaneTimesSnapshot ESP32TimerHAL::getLaneTimes() const {
    LaneTimesSnapshot snap{};
    portDISABLE_INTERRUPTS();
    snap.startTime = s_startTime;
    snap.laneCount = s_numLanes;
    for (int i = 0; i < MAX_LANES; ++i) {
        snap.laneTimes[i] = s_endTimes[i];
    }
    portENABLE_INTERRUPTS();
    return snap;
}

bool ESP32TimerHAL::isStartGateClosed() const {
    // Pin is INPUT_PULLUP; gate closed pulls HIGH.
    return digitalRead(STARTGATE_PIN) == HIGH;
}

void ESP32TimerHAL::updateState() {
    TimerState cur = s_state;

    if (cur == TimerState::RESET && isStartGateClosed()) {
        // Auto-arm when physical gate is closed (matches legacy behaviour)
        s_state = TimerState::SET;
        return;
    }

    if (cur == TimerState::IN_RACE) {
        int lanes = s_numLanes;
        bool allFinished = true;
        for (int i = 0; i < lanes; ++i) {
            if (s_endTimes[i] == 0) {
                allFinished = false;
                break;
            }
        }
        if (allFinished) {
            s_state = TimerState::FINISHED;
        }
    }
}

// ── ISR handlers ───────────────────────────────────────────────────────────

void IRAM_ATTR ESP32TimerHAL::laneISR(void* arg) {
    int idx = *static_cast<const int*>(arg);
    if (s_endTimes[idx] == 0) {
        s_endTimes[idx] = micros();
    }
}

void IRAM_ATTR ESP32TimerHAL::startGateISR() {
    if (s_state == TimerState::SET) {
        s_startTime = micros();
        for (int i = 0; i < MAX_LANES; ++i) {
            s_endTimes[i] = 0;
        }
        s_state = TimerState::IN_RACE;
    }
}

// ── FreeRTOS gate task (runs on core 1) ────────────────────────────────────

void ESP32TimerHAL::gateTask(void* /*pvParameters*/) {
    // Configure all lane pins and the start gate pin
    for (int i = 0; i < MAX_LANES; ++i) {
        pinMode(LANE_PINS[i], INPUT_PULLUP);
    }
    pinMode(STARTGATE_PIN, INPUT_PULLUP);
    pinMode(WIFI_MODE_PIN, INPUT_PULLUP);

    // Attach lane interrupts (FALLING edge = car crosses sensor)
    for (int i = 0; i < MAX_LANES; ++i) {
        attachInterruptArg(
            digitalPinToInterrupt(LANE_PINS[i]),
            laneISR,
            const_cast<int*>(&s_laneIndices[i]),
            FALLING
        );
    }

    // Attach start gate interrupt (FALLING = gate opens / releases)
    attachInterrupt(
        digitalPinToInterrupt(STARTGATE_PIN),
        startGateISR,
        FALLING
    );

    // Keep the task alive (interrupts do the real work)
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

#endif // ARDUINO
