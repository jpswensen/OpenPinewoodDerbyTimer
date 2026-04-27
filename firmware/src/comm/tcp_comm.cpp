/// @file tcp_comm.cpp
/// @brief TCP/WiFi communication implementation.
///
/// Sets up the ESP32 as a WiFi access point, starts a TCP server, registers
/// mDNS, and manages a single client connection with LED status indication.

#ifdef ARDUINO

#include "tcp_comm.h"
#include <ESPmDNS.h>

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

TcpComm::TcpComm(const char* ssid, const char* password, uint16_t port, int ledPin)
    : m_ssid(ssid)
    , m_password(password)
    , m_port(port)
    , m_ledPin(ledPin)
    , m_server(port)
{
    m_rxBuf[0] = '\0';
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

void TcpComm::init()
{
    // Configure status LED
    if (m_ledPin >= 0) {
        pinMode(m_ledPin, OUTPUT);
        digitalWrite(m_ledPin, LOW);
    }

    // Start WiFi soft-AP
    WiFi.mode(WIFI_AP);
    m_wifiReady = WiFi.softAP(m_ssid, m_password);
    if (!m_wifiReady) {
        // AP failed — leave LED off, mark as not initialised.
        m_initialised = false;
        return;
    }

    // Register mDNS hostname (pwdtimer.local)
    if (MDNS.begin("pwdtimer")) {
        MDNS.addService("pwdtimer", "tcp", m_port);
    }

    // Start TCP server
    m_server.begin();
    m_server.setNoDelay(true);

    m_initialised = true;
    updateLED();
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

bool TcpComm::send(const char* msg)
{
    if (!m_initialised || msg == nullptr) {
        return false;
    }
    if (!m_client || !m_client.connected()) {
        return false;
    }
    m_client.println(msg);
    return true;
}

// ---------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------

bool TcpComm::receive(char* buf, size_t maxLen)
{
    if (!m_initialised || buf == nullptr || maxLen == 0) {
        return false;
    }
    if (!m_client || !m_client.connected()) {
        return false;
    }

    // Drain available bytes from the TCP client, assembling a complete line.
    while (m_client.available() > 0) {
        int ch = m_client.read();
        if (ch < 0) {
            break;
        }

        if (ch == '\n' || ch == '\r') {
            if (m_rxLen == 0) {
                continue;  // Skip blank lines.
            }
            size_t copyLen = (m_rxLen < maxLen - 1) ? m_rxLen : (maxLen - 1);
            memcpy(buf, m_rxBuf, copyLen);
            buf[copyLen] = '\0';
            m_rxLen = 0;
            return true;
        }

        if (m_rxLen < sizeof(m_rxBuf) - 1) {
            m_rxBuf[m_rxLen++] = static_cast<char>(ch);
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

bool TcpComm::isConnected() const
{
    // WiFiClient::operator bool() and connected() are non-const in the
    // Arduino ESP32 library, so we need a const_cast here.
    auto& client = const_cast<WiFiClient&>(m_client);
    return m_initialised && client && client.connected();
}

// ---------------------------------------------------------------------------
// Polling — accept new connections, update LED
// ---------------------------------------------------------------------------

void TcpComm::poll()
{
    if (!m_initialised || !m_wifiReady) {
        return;
    }

    // Accept a new client if we don't have one (or the previous one disconnected).
    if (m_server.hasClient()) {
        if (!m_client || !m_client.connected()) {
            if (m_client) {
                m_client.stop();
            }
            m_client = m_server.available();
        } else {
            // Already have a connected client — reject the new one.
            WiFiClient rejected = m_server.available();
            rejected.stop();
        }
    }

    updateLED();
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

IPAddress TcpComm::getAPIP() const
{
    return WiFi.softAPIP();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

void TcpComm::updateLED()
{
    if (m_ledPin < 0) {
        return;
    }
    // LED ON when a TCP client is connected, OFF otherwise.
    // If WiFi is not ready, blink pattern could be added in the future;
    // for now, OFF means no client.
    digitalWrite(m_ledPin, (m_client && m_client.connected()) ? HIGH : LOW);
}

#endif // ARDUINO
