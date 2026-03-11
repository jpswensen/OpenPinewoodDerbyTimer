/// @file nvs_config.h
/// @brief Non-Volatile Storage helpers for persisting firmware configuration.
///
/// On ESP32 builds this wraps the NVS (Preferences) API.  On native/desktop
/// builds a stub implementation is compiled instead so that the interface
/// remains testable.

#pragma once

#include <cstdint>

/// Maximum string lengths for WiFi credentials stored in NVS.
static constexpr int NVS_SSID_MAX     = 32;
static constexpr int NVS_PASSWORD_MAX = 64;

/// @brief Persistent firmware configuration stored in NVS.
struct FirmwareConfig {
    char     wifiSSID[NVS_SSID_MAX];
    char     wifiPassword[NVS_PASSWORD_MAX];
    uint8_t  laneCount;      ///< Active lanes (1–8).
    bool     otaEnabled;     ///< Enable ArduinoOTA updates.

    /// Populate with factory defaults.
    void setDefaults();
};

namespace NVSConfig {

/// Initialise the NVS subsystem.  Call once from setup().
void init();

/// Load configuration from NVS into @p cfg.
/// If NVS has no stored config the struct is filled with defaults.
void load(FirmwareConfig& cfg);

/// Persist @p cfg to NVS.
void save(const FirmwareConfig& cfg);

} // namespace NVSConfig
