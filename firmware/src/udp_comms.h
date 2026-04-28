// udp_comms.h — UDP transport that runs alongside serial.
//
// Listens on UDP_RX_PORT for ASCII command lines (same protocol as serial).
// Broadcasts status frames to 255.255.255.255:UDP_TX_PORT so the backend
// does not need to know the device's IP.
//
// Inactive when the AP is not up — udp_broadcast_line() becomes a no-op.
#pragma once

#include <stdbool.h>

constexpr int UDP_RX_PORT = 9100;  // device <- host commands
constexpr int UDP_TX_PORT = 9101;  // device -> host status broadcasts

// Bind sockets; safe to call even if the AP failed to come up (it will
// simply return false and udp_broadcast_line will no-op).
bool udp_begin();

// Send one already-framed status line ("$...*").  Adds a trailing '\n' so
// the line splitter on the host can re-frame the same as serial.
void udp_broadcast_line(const char *line);
