#pragma once

/// @file tcp_comm.h
/// @brief TCP/WiFi communication implementation for the PWDTimer.
///
/// Manages the ESP32 WiFi soft-AP (SSID "PWDTIMER"), mDNS registration
/// ("pwdtimer.local"), and a TCP server on port 8080 accepting one client.
///
/// Configuration follows the legacy firmware:
///   - AP mode at 192.168.4.1
///   - TCP port 8080
///   - mDNS hostname "pwdtimer"
///
/// WiFi status is indicated via a GPIO LED (default: GPIO2, the built-in LED
/// on most ESP32 dev boards).  The LED is ON when a TCP client is connected.

#ifdef ARDUINO  // Only compile on ESP32 / Arduino targets

#include "comm_interface.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiServer.h>
#include <WiFiClient.h>

class TcpComm : public CommInterface {
public:
    /// @param ssid     WiFi AP SSID (default "PWDTIMER").
    /// @param password WiFi AP password (default "PWDTIMER").
    /// @param port     TCP server port (default 8080).
    /// @param ledPin   GPIO pin for WiFi/connection status LED (-1 to disable).
    explicit TcpComm(const char* ssid = "PWDTIMER",
                     const char* password = "PWDTIMER",
                     uint16_t port = 8080,
                     int ledPin = 2);
    ~TcpComm() override = default;

    void init() override;
    bool send(const char* msg) override;
    bool receive(char* buf, size_t maxLen) override;
    bool isConnected() const override;

    /// Call periodically to accept new TCP connections and update the LED.
    /// This should be invoked from the communication task loop.
    void poll();

    /// @return true if the WiFi soft-AP was started successfully.
    bool isWiFiReady() const { return m_wifiReady; }

    /// @return the soft-AP IP address (typically 192.168.4.1).
    IPAddress getAPIP() const;

private:
    const char* m_ssid;
    const char* m_password;
    uint16_t    m_port;
    int         m_ledPin;

    WiFiServer  m_server;
    WiFiClient  m_client;

    bool        m_initialised = false;
    bool        m_wifiReady   = false;

    /// Internal line buffer for accumulating characters from the TCP client.
    char   m_rxBuf[COMM_MAX_MSG_LEN];
    size_t m_rxLen = 0;

    void updateLED();
};

#endif // ARDUINO
