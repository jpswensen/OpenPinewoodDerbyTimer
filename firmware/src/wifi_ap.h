// wifi_ap.h — bring up an ESP32 SoftAP for direct UI ↔ timer use.
//
// SSID / password are compiled in (race-day simplicity).  No STA, no captive
// portal, no mDNS — operators always reach the device at 192.168.4.1, and
// the backend can also rely on UDP broadcast for discovery-free comms.
#pragma once

#include <stdbool.h>

// Returns true on success.  Failure is logged via send_debug() and treated
// as non-fatal: serial comms keeps working regardless.
bool wifi_ap_begin();

// Has the AP successfully come up?
bool wifi_ap_is_up();
