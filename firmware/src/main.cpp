// main.cpp — PWDTimer firmware entry point.
//
// Core assignment:
//   Core 1 — gatesCoreTask (configMAX_PRIORITIES-1)
//               Tight polling loop: reads both GPIO banks each iteration,
//               captures Xtensa CCOUNT for sub-µs timing, yields only during
//               RESET/FINISHED.  No other application code runs here so the
//               timing loop is never preempted by I/O.
//
//   Core 0 — commsCoreTask (priority 5)
//               Serial RX accumulator.  Shares Core 0 with stateMachineTask
//               and, when WiFi is enabled, the ESP-IDF WiFi/TCP-IP tasks
//               (which are pinned to Core 0 by default).
//
//   Core 0 — stateMachineTask (priority 3)
//               Reads gate data, processes host commands, drives the race
//               state machine, and broadcasts periodic status frames.
//               Runs at a lower priority than commsCoreTask so serial bytes
//               are never dropped.
//
//   Core 1 — loopTask (Arduino default, priority 1)
//               loop() is intentionally suspended; the only Core-1 work
//               aside from FreeRTOS IDLE1 is gatesCoreTask.

#include <Arduino.h>
#include "state.h"
#include "gates.h"
#include "comms.h"

static const uint32_t RACE_STATUS_INTERVAL_MS = 100;   // 10 Hz during SET / IN_RACE
static const uint32_t IDLE_STATUS_INTERVAL_MS = 1000;  // 1  Hz otherwise

static const int STATE_TASK_CORE  = 0;
static const int STATE_TASK_PRIO  = 3;
static const int STATE_TASK_STACK = 4096;

template <typename T>
static T find_max(const T *arr, int n) {
    T m = arr[0];
    for (int i = 1; i < n; ++i) if (arr[i] > m) m = arr[i];
    return m;
}

static void stateMachineTask(void *) {
    uint32_t lastStatusMs = 0;

    for (;;) {
        long     startTime  = -1;
        long     endTimes[MAX_LANES] = {};
        long     currentTime = (long)micros();
        int      numLanes    = get_num_gates();

        read_gates(startTime, endTimes);

        // ── Process pending host command ──────────────────────────────────
        int param = 0;
        switch (poll_command(&param)) {
            case RESET_MSG:
                state = RESET;
                reset_gates();
                break;
            case SET_LANES_MSG:
                set_num_gates(param);
                numLanes = get_num_gates();
                break;
            default:
                break;
        }

        // ── State machine ─────────────────────────────────────────────────
        switch (state) {
            case RESET:
                startTime = -1;
                if (is_starting_gate_set()) state = SET;
                break;

            case SET:
                break;

            case IN_RACE: {
                // Belt-and-suspenders: gatesCoreTask already transitions to
                // FINISHED when all lanes are done, but check here too in
                // case of any cross-core visibility delay.
                bool done = true;
                for (int i = 0; i < numLanes; ++i)
                    if (endTimes[i] == 0) { done = false; break; }
                if (done) state = FINISHED;
                break;
            }

            case FINISHED:
                currentTime = find_max(endTimes, numLanes);
                break;

            default:
                send_debug("unknown state");
                break;
        }

        // ── Periodic status broadcast ─────────────────────────────────────
        const uint32_t nowMs    = (uint32_t)millis();
        const uint32_t interval = (state == SET || state == IN_RACE)
                                      ? RACE_STATUS_INTERVAL_MS
                                      : IDLE_STATUS_INTERVAL_MS;
        if (lastStatusMs == 0 || (nowMs - lastStatusMs) >= interval) {
            send_status(state, startTime, currentTime, numLanes, endTimes,
                        is_starting_gate_set());
            lastStatusMs = nowMs;
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void setup() {
    setup_comms();
    delay(200);
    Serial.println();
    Serial.println("PWDTimer firmware — serial only, ESP32-DEVKITC-32D");

    setup_gates();

    xTaskCreatePinnedToCore(stateMachineTask, "stateTask",
                            STATE_TASK_STACK, nullptr,
                            STATE_TASK_PRIO, nullptr, STATE_TASK_CORE);

    send_debug("ready");
}

void loop() {
    // All application work is handled in stateMachineTask (Core 1) and
    // gatesCoreTask (Core 0).  Suspend this task permanently rather than
    // busy-spinning through an empty Arduino loop.
    vTaskSuspend(nullptr);
}
