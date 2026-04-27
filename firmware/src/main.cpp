// main.cpp — PWDTimer firmware entry point.
//
// Architecture:
//   Core 1 (gatesTask, configMAX_PRIORITIES-1): owns lane + start-gate ISRs.
//   Core 0 (commsTask, prio 5):                 services serial RX.
//   loop():                                     runs the state machine and
//                                               broadcasts status frames.
//
// loop() runs on Core 1 by default but does no time-critical work; the ISRs
// already captured the timestamps. Status broadcasts go out via Serial, which
// is owned by the Core 0 comms task only for RX — TX from loop() is fine
// because Arduino-ESP32's HardwareSerial is internally synchronised.

#include <Arduino.h>
#include "state.h"
#include "gates.h"
#include "comms.h"

static const uint32_t RACE_STATUS_INTERVAL_MS = 100;   // 10 Hz during SET / IN_RACE
static const uint32_t IDLE_STATUS_INTERVAL_MS = 1000;  // 1  Hz otherwise

static uint32_t lastStatusMs = 0;

template <typename T>
static T find_max(const T *arr, int n) {
    T m = arr[0];
    for (int i = 1; i < n; ++i) {
        if (arr[i] > m) m = arr[i];
    }
    return m;
}

void setup() {
    setup_comms();
    delay(200);                   // Let UART settle so the banner isn't lost.
    Serial.println();
    Serial.println("PWDTimer firmware — serial only, ESP32-DEVKITC-32D");

    setup_gates();
    send_debug("ready");
}

void loop() {
    long startTime = -1;
    long endTimes[MAX_LANES];
    long currentTime = micros();
    int  numLanes    = get_num_gates();

    read_gates(startTime, endTimes);

    // ── Process pending host command ─────────────────────────────────────
    int param = 0;
    RecvMessage_t cmd = poll_command(&param);
    switch (cmd) {
        case RESET_MSG:
            state = RESET;
            reset_gates();
            break;
        case SET_LANES_MSG:
            set_num_gates(param);
            numLanes = get_num_gates();
            break;
        case ARM_MSG:
        case UNDEFINED_MSG:
        default:
            break;
    }

    // ── State machine ────────────────────────────────────────────────────
    switch (state) {
        case RESET:
            startTime = -1;
            if (is_starting_gate_set()) {
                state = SET;
            }
            break;

        case SET:
            // Waiting for the start gate to release (handled in ISR).
            break;

        case IN_RACE: {
            bool finished = true;
            for (int i = 0; i < numLanes; ++i) {
                if (endTimes[i] == 0) { finished = false; break; }
            }
            if (finished) state = FINISHED;
            break;
        }

        case FINISHED:
            currentTime = find_max(endTimes, numLanes);
            break;

        default:
            send_debug("unknown state");
            break;
    }

    // ── Periodic status broadcast ────────────────────────────────────────
    uint32_t nowMs    = millis();
    uint32_t interval = (state == SET || state == IN_RACE)
                            ? RACE_STATUS_INTERVAL_MS
                            : IDLE_STATUS_INTERVAL_MS;
    if (lastStatusMs == 0 || (nowMs - lastStatusMs) >= interval) {
        send_status(state, startTime, currentTime, numLanes, endTimes,
                    is_starting_gate_set());
        lastStatusMs = nowMs;
    }

    delay(10);
}
