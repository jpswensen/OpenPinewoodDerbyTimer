// comms.cpp — serial-only host communication.
//
// Runs on Core 1, sharing it with stateMachineTask and (when WiFi is enabled)
// the ESP-IDF WiFi/TCP-IP protocol tasks, which are pinned to Core 1 by the
// SDK.  Core 0 is reserved entirely for the tight timing loop in gatesCoreTask.
//
// commsCoreTask is the single writer to the RX line buffer; stateMachineTask
// is the single reader via poll_command().  HardwareSerial TX is internally
// synchronised so send_status() is safe to call from any Core-1 task.

#include <Arduino.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

#include "comms.h"
#include "gates.h"

static const int   COMMS_TASK_CORE = 1;   // same core as WiFi and stateMachineTask
static const int   COMMS_TASK_PRIO = 5;

// RX line buffer (single reader, drained in loop()).
static char        rxBuf[128];
static size_t      rxLen = 0;

// One pending command, set when a complete line is parsed.
static volatile RecvMessage_t pendingCmd   = UNDEFINED_MSG;
static volatile int           pendingParam = 0;

// ── Helpers ───────────────────────────────────────────────────────────────

static bool starts_with_ci(const char *s, const char *prefix) {
    while (*prefix) {
        if (toupper((unsigned char)*s) != toupper((unsigned char)*prefix)) {
            return false;
        }
        ++s; ++prefix;
    }
    return true;
}

static void parse_line(const char *line) {
    // Skip leading whitespace.
    while (*line && isspace((unsigned char)*line)) ++line;

    if (starts_with_ci(line, "RESET")) {
        pendingCmd   = RESET_MSG;
        pendingParam = 0;
        return;
    }
    if (starts_with_ci(line, "ARM")) {
        // Legacy firmware auto-arms when the start gate is closed; we accept
        // ARM as a no-op for forward compatibility with the new backend.
        pendingCmd   = ARM_MSG;
        pendingParam = 0;
        return;
    }
    if (starts_with_ci(line, "LANES,") || starts_with_ci(line, "LANES ")) {
        int n = atoi(line + 6);
        if (n >= 1 && n <= MAX_LANES) {
            pendingCmd   = SET_LANES_MSG;
            pendingParam = n;
        }
        return;
    }
    if (starts_with_ci(line, "SET_LANES:")) {
        int n = atoi(line + 10);
        if (n >= 1 && n <= MAX_LANES) {
            pendingCmd   = SET_LANES_MSG;
            pendingParam = n;
        }
        return;
    }
}

// ── Core-0 task: only job is to keep RX flowing ───────────────────────────

static void commsCoreTask(void * /*pv*/) {
    for (;;) {
        while (Serial.available() > 0) {
            int ch = Serial.read();
            if (ch < 0) break;

            if (ch == '\n' || ch == '\r') {
                if (rxLen > 0) {
                    rxBuf[rxLen] = '\0';
                    parse_line(rxBuf);
                    rxLen = 0;
                }
                continue;
            }
            if (rxLen < sizeof(rxBuf) - 1) {
                rxBuf[rxLen++] = (char)ch;
            } else {
                // Overflow: drop the line.
                rxLen = 0;
            }
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}

// ── Public API ────────────────────────────────────────────────────────────

void setup_comms() {
    Serial.begin(115200);
    xTaskCreatePinnedToCore(
        commsCoreTask,
        "commsTask",
        4096,
        nullptr,
        COMMS_TASK_PRIO,
        nullptr,
        COMMS_TASK_CORE);
}

void send_status(TimerState_t st, long startTime, long currentTime,
                 int numLanes, const long *endTimes, bool gateSet) {
    // Always emit 8 lane fields (zero-padded for inactive lanes) followed by
    // a gateSet flag (1=armed/set, 0=open/released) for host UI use.
    // Old parsers that only read the first 12 comma-separated fields are unaffected.
    char buf[256];
    snprintf(buf, sizeof(buf),
             "$%d,%ld,%ld,%d,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%d*",
             (int)st, startTime, currentTime, numLanes,
             endTimes[0], endTimes[1], endTimes[2], endTimes[3],
             endTimes[4], endTimes[5], endTimes[6], endTimes[7],
             gateSet ? 1 : 0);
    Serial.println(buf);
}

RecvMessage_t poll_command(int *param) {
    RecvMessage_t cmd = pendingCmd;
    if (cmd == UNDEFINED_MSG) {
        return UNDEFINED_MSG;
    }
    if (param) *param = pendingParam;
    pendingCmd   = UNDEFINED_MSG;
    pendingParam = 0;
    return cmd;
}

void send_debug(const char *msg) {
    Serial.print("DEBUG: ");
    Serial.println(msg);
}
