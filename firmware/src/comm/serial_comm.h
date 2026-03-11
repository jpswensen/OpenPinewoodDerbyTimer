#pragma once

/// @file serial_comm.h
/// @brief Serial (USB UART) communication implementation for the PWDTimer.
///
/// Wraps HardwareSerial at 115200 baud.  Always "connected" once initialised
/// (Serial over USB is always available on ESP32 dev boards).

#ifdef ARDUINO  // Only compile on ESP32 / Arduino targets

#include "comm_interface.h"
#include <Arduino.h>

class SerialComm : public CommInterface {
public:
    /// @param serial   Reference to HardwareSerial instance (typically Serial).
    /// @param baudRate Baud rate (default 115200 to match legacy firmware).
    explicit SerialComm(HardwareSerial& serial = Serial,
                        unsigned long baudRate = 115200);
    ~SerialComm() override = default;

    void init() override;
    bool send(const char* msg) override;
    bool receive(char* buf, size_t maxLen) override;
    bool isConnected() const override;

private:
    HardwareSerial& m_serial;
    unsigned long   m_baudRate;
    bool            m_initialised = false;

    /// Internal line buffer for accumulating characters until a complete
    /// line (terminated by '\n', '\r', or '*') is available.
    char   m_rxBuf[COMM_MAX_MSG_LEN];
    size_t m_rxLen = 0;
};

#endif // ARDUINO
