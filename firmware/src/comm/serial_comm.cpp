/// @file serial_comm.cpp
/// @brief Serial (USB UART) communication implementation.

#ifdef ARDUINO

#include "serial_comm.h"

SerialComm::SerialComm(HardwareSerial& serial, unsigned long baudRate)
    : m_serial(serial)
    , m_baudRate(baudRate)
{
    m_rxBuf[0] = '\0';
}

void SerialComm::init()
{
    m_serial.begin(m_baudRate);
    m_initialised = true;
}

bool SerialComm::send(const char* msg)
{
    if (!m_initialised || msg == nullptr) {
        return false;
    }
    m_serial.println(msg);
    return true;
}

bool SerialComm::receive(char* buf, size_t maxLen)
{
    if (!m_initialised || buf == nullptr || maxLen == 0) {
        return false;
    }

    // Drain available bytes from the UART FIFO, assembling a complete line.
    while (m_serial.available() > 0) {
        int ch = m_serial.read();
        if (ch < 0) {
            break;
        }

        // Line terminators: newline, carriage return, or legacy '*' frame end.
        if (ch == '\n' || ch == '\r') {
            if (m_rxLen == 0) {
                // Skip leading blank lines (e.g. \r\n pairs).
                continue;
            }
            // Complete line — copy out.
            size_t copyLen = (m_rxLen < maxLen - 1) ? m_rxLen : (maxLen - 1);
            memcpy(buf, m_rxBuf, copyLen);
            buf[copyLen] = '\0';
            m_rxLen = 0;
            return true;
        }

        // Accumulate character (drop if buffer full to avoid overflow).
        if (m_rxLen < sizeof(m_rxBuf) - 1) {
            m_rxBuf[m_rxLen++] = static_cast<char>(ch);
        }
    }

    return false;  // No complete line yet.
}

bool SerialComm::isConnected() const
{
    return m_initialised;
}

#endif // ARDUINO
