// wifi_ap.cpp — minimal SoftAP startup.
//
// Hard-coded credentials keep the on-site failure surface tiny.  Bringing up
// the AP is non-blocking: WiFi.softAP() returns once the AP is configured;
// associations and DHCP leases happen asynchronously on the WiFi/LWIP tasks.
//
// Anything that goes wrong here is reported via send_debug() and the
// firmware continues to run with serial-only comms.

#include "wifi_ap.h"
#include "comms.h"

#ifdef PWDTIMER_ENABLE_WIFI

#include <Arduino.h>
#include <WiFi.h>

namespace {
constexpr const char *AP_SSID     = "PWDTimer";
constexpr const char *AP_PASSWORD = "pinewood2025";  // WPA2 requires ≥8 chars
constexpr int         AP_CHANNEL  = 6;
constexpr int         AP_HIDDEN   = 0;
constexpr int         AP_MAX_CONN = 4;

bool s_up = false;
}  // namespace

bool wifi_ap_begin() {
    WiFi.persistent(false);
    WiFi.mode(WIFI_AP);

    const bool ok = WiFi.softAP(AP_SSID, AP_PASSWORD, AP_CHANNEL, AP_HIDDEN, AP_MAX_CONN);
    if (!ok) {
        send_debug("wifi_ap: softAP() failed; continuing with serial only");
        s_up = false;
        return false;
    }

    char msg[96];
    const IPAddress ip = WiFi.softAPIP();
    snprintf(msg, sizeof(msg), "wifi_ap: SSID=%s ip=%u.%u.%u.%u",
             AP_SSID, ip[0], ip[1], ip[2], ip[3]);
    send_debug(msg);

    s_up = true;
    return true;
}

bool wifi_ap_is_up() { return s_up; }

#else  // PWDTIMER_ENABLE_WIFI

bool wifi_ap_begin() { return false; }
bool wifi_ap_is_up() { return false; }

#endif  // PWDTIMER_ENABLE_WIFI
