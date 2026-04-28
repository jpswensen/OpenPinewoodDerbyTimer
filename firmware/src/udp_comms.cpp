// udp_comms.cpp — datagram bridge for command RX and status TX.
//
// Runs on Core 0 alongside commsCoreTask and (when active) the WiFi stack.
// Both transports stay live simultaneously: every status frame is written to
// Serial *and* broadcast over UDP, and command bytes from either source are
// merged via comms_inject_line() so the existing line parser handles them
// identically.
//
// Only one task ever sends UDP packets (udpRxTask is RX-only;
// udp_broadcast_line() is called from stateMachineTask — also Core 0).
// HardwareSerial TX synchronises internally.  No shared state between
// the two transports beyond comms_inject_line(), which takes its own lock.

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <string.h>

#include "udp_comms.h"
#include "comms.h"
#include "wifi_ap.h"

namespace {
WiFiUDP   s_rx;
WiFiUDP   s_tx;
bool      s_ready = false;
TaskHandle_t s_rxTask = nullptr;

constexpr int UDP_TASK_CORE  = 0;
constexpr int UDP_TASK_PRIO  = 4;     // below comms (5), above state (3)
constexpr int UDP_TASK_STACK = 4096;

// Per-source line accumulator.  Datagrams may contain multiple framed lines
// or a partial line; we split on '\n' / '\r' and inject complete lines.
char    s_lineBuf[160];
size_t  s_lineLen = 0;

void feed_byte(char ch) {
    if (ch == '\n' || ch == '\r') {
        if (s_lineLen > 0) {
            s_lineBuf[s_lineLen] = '\0';
            comms_inject_line(s_lineBuf);
            s_lineLen = 0;
        }
        return;
    }
    if (s_lineLen < sizeof(s_lineBuf) - 1) {
        s_lineBuf[s_lineLen++] = ch;
    } else {
        s_lineLen = 0;  // overflow: drop
    }
}

void udpRxTask(void *) {
    uint8_t pktBuf[256];
    for (;;) {
        int sz = s_rx.parsePacket();
        while (sz > 0) {
            int n = s_rx.read(pktBuf, sizeof(pktBuf));
            for (int i = 0; i < n; ++i) feed_byte((char)pktBuf[i]);
            sz -= n;
            if (n <= 0) break;
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
}  // namespace

bool udp_begin() {
    if (!wifi_ap_is_up()) {
        s_ready = false;
        return false;
    }
    if (!s_rx.begin(UDP_RX_PORT)) {
        send_debug("udp: rx bind failed");
        s_ready = false;
        return false;
    }
    s_ready = true;

    xTaskCreatePinnedToCore(udpRxTask, "udpRx", UDP_TASK_STACK,
                            nullptr, UDP_TASK_PRIO, &s_rxTask, UDP_TASK_CORE);

    char msg[64];
    snprintf(msg, sizeof(msg), "udp: rx=%d tx_bcast=%d", UDP_RX_PORT, UDP_TX_PORT);
    send_debug(msg);
    return true;
}

void udp_broadcast_line(const char *line) {
    if (!s_ready || line == nullptr) return;
    const IPAddress bcast(255, 255, 255, 255);
    if (!s_tx.beginPacket(bcast, UDP_TX_PORT)) return;
    s_tx.write(reinterpret_cast<const uint8_t *>(line), strlen(line));
    s_tx.write('\n');
    s_tx.endPacket();
}
