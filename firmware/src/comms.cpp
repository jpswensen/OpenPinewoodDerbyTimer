// comms.cpp — host communication (serial + UDP).
//
// Runs on Core 0, sharing it with stateMachineTask, the udpRxTask, and (when
// WiFi is enabled) the ESP-IDF WiFi/TCP-IP protocol tasks, all of which are
// pinned to Core 0 by default (CONFIG_ESP32_WIFI_TASK_CORE_ID=0).  Core 1 is
// reserved for the tight timing loop in gatesCoreTask plus the suspended
// Arduino loop().
//
// Both transports inject commands via comms_inject_line(); a small spinlock
// protects the single-slot pending-command state so the two sources can
// arrive on different tasks without racing.  Status frames are broadcast on
// Serial and (when the AP is up) UDP from a single producer task, so TX
// requires no additional locking.

#include <Arduino.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
#include "freertos/FreeRTOS.h"

#include "comms.h"
#include "gates.h"
#include "udp_comms.h"

static const int   COMMS_TASK_CORE = 0;   // same core as WiFi and stateMachineTask
static const int   COMMS_TASK_PRIO = 5;

// RX line buffer for serial (single writer: commsCoreTask).
static char        rxBuf[128];
static size_t      rxLen = 0;

// One pending command, written under s_cmdMux from any transport,
// drained by stateMachineTask via poll_command().
static portMUX_TYPE s_cmdMux = portMUX_INITIALIZER_UNLOCKED;
static RecvMessage_t pendingCmd   = UNDEFINED_MSG;
static int           pendingParam = 0;

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

static void set_pending(RecvMessage_t cmd, int param) {
    portENTER_CRITICAL(&s_cmdMux);
    pendingCmd   = cmd;
    pendingParam = param;
    portEXIT_CRITICAL(&s_cmdMux);
}

static void parse_line(const char *line) {
    while (*line && isspace((unsigned char)*line)) ++line;

    if (starts_with_ci(line, "RESET")) {
        set_pending(RESET_MSG, 0);
        return;
    }
    if (starts_with_ci(line, "ARM")) {
        // Legacy firmware auto-arms when the start gate is closed; we accept
        // ARM as a no-op for forward compatibility with the new backend.
        set_pending(ARM_MSG, 0);
        return;
    }
    if (starts_with_ci(line, "LANES,") || starts_with_ci(line, "LANES ")) {
        int n = atoi(line + 6);
        if (n >= 1 && n <= MAX_LANES) {
            set_pending(SET_LANES_MSG, n);
        }
        return;
    }
    if (starts_with_ci(line, "SET_LANES:")) {
        int n = atoi(line + 10);
        if (n >= 1 && n <= MAX_LANES) {
            set_pending(SET_LANES_MSG, n);
        }
        return;
    }
}

void comms_inject_line(const char *line) {
    if (line == nullptr) return;
    parse_line(line);
}

// ── Core-0 task: only job is to keep serial RX flowing ────────────────────

static void commsCoreTask(void * /*pv*/) {
    for (;;) {
        while (Serial.available() > 0) {
            int ch = Serial.read();
            if (ch < 0) break;

            if (ch == '\n' || ch == '\r') {
                if (rxLen > 0) {
                    rxBuf[rxLen] = '\0';
                    comms_inject_line(rxBuf);
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
    udp_broadcast_line(buf);
}

RecvMessage_t poll_command(int *param) {
    portENTER_CRITICAL(&s_cmdMux);
    RecvMessage_t cmd = pendingCmd;
    int           p   = pendingParam;
    pendingCmd   = UNDEFINED_MSG;
    pendingParam = 0;
    portEXIT_CRITICAL(&s_cmdMux);
    if (cmd == UNDEFINED_MSG) return UNDEFINED_MSG;
    if (param) *param = p;
    return cmd;
}

void send_debug(const char *msg) {
    Serial.print("DEBUG: ");
    Serial.println(msg);
}
