/// @file nvs_config.cpp
/// @brief NVS configuration implementation.
///
/// On ESP32 (ARDUINO defined) this uses the Preferences library for true
/// non-volatile storage.  On native/desktop builds it provides a RAM-only
/// stub so the AppController integration tests can exercise config paths.

#include "nvs_config.h"
#include <cstring>

// ── Factory defaults ────────────────────────────────────────────────────────

void FirmwareConfig::setDefaults() {
    std::strncpy(wifiSSID,     "PWDTIMER", NVS_SSID_MAX);
    wifiSSID[NVS_SSID_MAX - 1] = '\0';
    std::strncpy(wifiPassword, "PWDTIMER", NVS_PASSWORD_MAX);
    wifiPassword[NVS_PASSWORD_MAX - 1] = '\0';
    laneCount  = 8;
    otaEnabled = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESP32 implementation (Preferences API)
// ═══════════════════════════════════════════════════════════════════════════

#ifdef ARDUINO

#include <Preferences.h>

static Preferences prefs;

static constexpr const char* NVS_NAMESPACE = "pwdtimer";
static constexpr const char* KEY_SSID      = "wifi_ssid";
static constexpr const char* KEY_PASS      = "wifi_pass";
static constexpr const char* KEY_LANES     = "lane_count";
static constexpr const char* KEY_OTA       = "ota_enabled";
static constexpr const char* KEY_INIT      = "initialised";

void NVSConfig::init() {
    prefs.begin(NVS_NAMESPACE, false);
}

void NVSConfig::load(FirmwareConfig& cfg) {
    cfg.setDefaults();

    if (!prefs.getBool(KEY_INIT, false)) {
        // First boot — write defaults and mark initialised.
        save(cfg);
        prefs.putBool(KEY_INIT, true);
        return;
    }

    String ssid = prefs.getString(KEY_SSID, cfg.wifiSSID);
    std::strncpy(cfg.wifiSSID, ssid.c_str(), NVS_SSID_MAX);
    cfg.wifiSSID[NVS_SSID_MAX - 1] = '\0';

    String pass = prefs.getString(KEY_PASS, cfg.wifiPassword);
    std::strncpy(cfg.wifiPassword, pass.c_str(), NVS_PASSWORD_MAX);
    cfg.wifiPassword[NVS_PASSWORD_MAX - 1] = '\0';

    cfg.laneCount  = prefs.getUChar(KEY_LANES, cfg.laneCount);
    cfg.otaEnabled = prefs.getBool(KEY_OTA,     cfg.otaEnabled);
}

void NVSConfig::save(const FirmwareConfig& cfg) {
    prefs.putString(KEY_SSID,  cfg.wifiSSID);
    prefs.putString(KEY_PASS,  cfg.wifiPassword);
    prefs.putUChar(KEY_LANES,  cfg.laneCount);
    prefs.putBool(KEY_OTA,     cfg.otaEnabled);
}

// ═══════════════════════════════════════════════════════════════════════════
// Native / desktop stub (RAM-only)
// ═══════════════════════════════════════════════════════════════════════════

#else // !ARDUINO

static FirmwareConfig s_storedConfig;
static bool           s_hasStored = false;

void NVSConfig::init() {
    // No-op on native.
}

void NVSConfig::load(FirmwareConfig& cfg) {
    if (s_hasStored) {
        cfg = s_storedConfig;
    } else {
        cfg.setDefaults();
    }
}

void NVSConfig::save(const FirmwareConfig& cfg) {
    s_storedConfig = cfg;
    s_hasStored    = true;
}

#endif // ARDUINO
