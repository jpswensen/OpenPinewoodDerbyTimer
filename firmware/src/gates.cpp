// gates.cpp — start gate + lane sensor handling.
//
// Pin map (matches the ESP32-DEVKITC-32D PWDTimer schematic and the
// legacy custom PCB):
//
//   Lane 1 (OUT1) -> GPIO 12   Lane 5 (OUT5) -> GPIO 25
//   Lane 2 (OUT2) -> GPIO 14   Lane 6 (OUT6) -> GPIO 33
//   Lane 3 (OUT3) -> GPIO 27   Lane 7 (OUT7) -> GPIO 32
//   Lane 4 (OUT4) -> GPIO 26   Lane 8 (OUT8) -> GPIO 23
//   Start gate    -> GPIO 22
//
// GPIO 12 is the MTDI strapping pin; on WROOM-32D modules the flash-voltage
// eFuse is burned at the factory so the strap is ignored at boot.
//
// All ISRs and pin setup live on Core 1 at the maximum FreeRTOS priority so
// that timing is never preempted by WiFi / serial work on Core 0.

#include <Arduino.h>
#include "state.h"
#include "gates.h"

static const int GATES_TASK_CORE = 1;
static const int GATES_TASK_PRIO = configMAX_PRIORITIES - 1;

static const int LANE_PINS[MAX_LANES] = { 12, 14, 27, 26, 25, 33, 32, 23 };
static const int STARTGATE_PIN = 22;

// Indices passed by pointer to the lane ISR so it knows which lane fired.
static const int laneIdx[MAX_LANES] = { 0, 1, 2, 3, 4, 5, 6, 7 };

static volatile int  numGates = MAX_LANES;
static volatile long startTime = -1;
static volatile long endTime[MAX_LANES] = { 0 };

// ── ISRs ──────────────────────────────────────────────────────────────────

static void IRAM_ATTR laneInterrupt(void *arg) {
    int n = *static_cast<const int*>(arg);
    if (endTime[n] == 0) {
        endTime[n] = micros();
    }
}

static void IRAM_ATTR startGateInterrupt() {
    if (state == SET) {
        startTime = micros();
        for (int i = 0; i < MAX_LANES; ++i) {
            endTime[i] = 0;
        }
        state = IN_RACE;
    }
}

// ── Core-1 task: configure pins + attach interrupts, then idle ────────────

static void gatesCoreTask(void * /*pv*/) {
    for (int i = 0; i < MAX_LANES; ++i) {
        pinMode(LANE_PINS[i], INPUT_PULLUP);
    }
    pinMode(STARTGATE_PIN, INPUT_PULLUP);

    for (int i = 0; i < MAX_LANES; ++i) {
        attachInterruptArg(LANE_PINS[i],
                           laneInterrupt,
                           (void*)&laneIdx[i],
                           FALLING);
    }
    attachInterrupt(STARTGATE_PIN, startGateInterrupt, FALLING);

    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

// ── Public API ────────────────────────────────────────────────────────────

void setup_gates() {
    reset_gates();
    xTaskCreatePinnedToCore(
        gatesCoreTask,
        "gatesTask",
        4096,
        nullptr,
        GATES_TASK_PRIO,
        nullptr,
        GATES_TASK_CORE);
}

int get_num_gates() {
    return numGates;
}

void set_num_gates(int n) {
    if (n < 1) n = 1;
    if (n > MAX_LANES) n = MAX_LANES;
    numGates = n;
}

void reset_gates() {
    portDISABLE_INTERRUPTS();
    startTime = -1;
    for (int i = 0; i < MAX_LANES; ++i) {
        endTime[i] = 0;
    }
    portENABLE_INTERRUPTS();
}

bool is_starting_gate_set() {
    // Active-low with internal pull-up: gate "closed" reads HIGH.
    return digitalRead(STARTGATE_PIN) == HIGH;
}

void read_gates(long &startOut, long *endTimesOut) {
    portDISABLE_INTERRUPTS();
    startOut = startTime;
    for (int i = 0; i < MAX_LANES; ++i) {
        endTimesOut[i] = endTime[i];
    }
    portENABLE_INTERRUPTS();
}
