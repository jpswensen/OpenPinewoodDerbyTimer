#pragma once

/// @file mock_comm.h
/// @brief Mock communication implementation for desktop/CI testing.
///
/// Provides an in-memory send/receive buffer so tests can verify protocol
/// formatting and command parsing without any hardware or network.

#include "comm_interface.h"

#include <cstring>

/// Simple fixed-size FIFO queue for test message buffering.
/// Stores up to N complete messages as NUL-terminated strings.
template<int N = 16>
class MessageQueue {
public:
    bool push(const char* msg) {
        if (m_count >= N || msg == nullptr) return false;
        size_t len = strlen(msg);
        if (len >= COMM_MAX_MSG_LEN) len = COMM_MAX_MSG_LEN - 1;
        memcpy(m_buf[m_tail], msg, len);
        m_buf[m_tail][len] = '\0';
        m_tail = (m_tail + 1) % N;
        ++m_count;
        return true;
    }

    bool pop(char* buf, size_t maxLen) {
        if (m_count == 0 || buf == nullptr || maxLen == 0) return false;
        size_t len = strlen(m_buf[m_head]);
        size_t copyLen = (len < maxLen - 1) ? len : (maxLen - 1);
        memcpy(buf, m_buf[m_head], copyLen);
        buf[copyLen] = '\0';
        m_head = (m_head + 1) % N;
        --m_count;
        return true;
    }

    int count() const { return m_count; }
    void clear() { m_count = 0; m_head = 0; m_tail = 0; }

private:
    char m_buf[N][COMM_MAX_MSG_LEN];
    int  m_head  = 0;
    int  m_tail  = 0;
    int  m_count = 0;
};

/// Mock communication transport for testing.
///
/// Sent messages are captured in an outbox queue (inspectable by tests).
/// Messages can be injected into an inbox queue to simulate incoming data.
class MockComm : public CommInterface {
public:
    MockComm() = default;
    ~MockComm() override = default;

    void init() override { m_connected = true; }
    bool send(const char* msg) override;
    bool receive(char* buf, size_t maxLen) override;
    bool isConnected() const override { return m_connected; }

    // ── Test helpers ───────────────────────────────────────────────────

    /// Inject a message as if it were received from a remote host.
    bool injectMessage(const char* msg) { return m_inbox.push(msg); }

    /// Read the next message that was sent by the firmware.
    bool readSentMessage(char* buf, size_t maxLen) { return m_outbox.pop(buf, maxLen); }

    /// Number of messages waiting in the outbox (sent by firmware).
    int sentCount() const { return m_outbox.count(); }

    /// Number of messages waiting in the inbox (injected for firmware to read).
    int pendingCount() const { return m_inbox.count(); }

    /// Simulate a disconnect.
    void disconnect() { m_connected = false; }

    /// Simulate a reconnect.
    void reconnect() { m_connected = true; }

    /// Clear all queues and reset state.
    void reset() {
        m_inbox.clear();
        m_outbox.clear();
        m_connected = false;
    }

private:
    MessageQueue<16> m_inbox;   ///< Messages injected by tests (firmware reads).
    MessageQueue<16> m_outbox;  ///< Messages sent by firmware (tests inspect).
    bool m_connected = false;
};
