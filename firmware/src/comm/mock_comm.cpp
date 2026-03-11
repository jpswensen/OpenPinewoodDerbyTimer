/// @file mock_comm.cpp
/// @brief Mock communication implementation for desktop/CI testing.

#include "mock_comm.h"

bool MockComm::send(const char* msg)
{
    if (!m_connected || msg == nullptr) {
        return false;
    }
    return m_outbox.push(msg);
}

bool MockComm::receive(char* buf, size_t maxLen)
{
    if (!m_connected || buf == nullptr || maxLen == 0) {
        return false;
    }
    return m_inbox.pop(buf, maxLen);
}
