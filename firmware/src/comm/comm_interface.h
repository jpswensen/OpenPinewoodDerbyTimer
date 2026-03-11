#pragma once

/// @file comm_interface.h
/// @brief Abstract communication interface for the PWDTimer firmware.
///
/// Defines a transport-agnostic interface that concrete implementations
/// (Serial, TCP/WiFi) must satisfy.  The main application loop polls each
/// transport via this common API.

#include <cstddef>
#include <cstdint>

/// Maximum length of a single protocol message (including framing).
static constexpr size_t COMM_MAX_MSG_LEN = 256;

/// Parsed command types the host can send to the timer.
enum class CommandType : uint8_t {
    NONE = 0,   ///< No command / unrecognised input
    CMD_RESET,  ///< Reset the timer
    CMD_ARM,    ///< Arm the timer (RESET → SET)
    CMD_SET_LANES  ///< Set the number of active lanes (param = lane count)
};

/// A parsed command with an optional integer parameter.
struct ParsedCommand {
    CommandType type = CommandType::NONE;
    int         param = 0;  ///< e.g. lane count for CMD_SET_LANES
};

/// Abstract communication transport.
///
/// Implementations must be safe to call from a single FreeRTOS task context
/// (they are NOT required to be thread-safe across tasks — the owning task
/// serialises access).
class CommInterface {
public:
    virtual ~CommInterface() = default;

    /// Initialise the transport (open port, start server, etc.).
    virtual void init() = 0;

    /// Send a complete message string.  The implementation appends any
    /// required line termination.
    /// @return true if the message was accepted for delivery.
    virtual bool send(const char* msg) = 0;

    /// Non-blocking receive: read the next complete message line into @p buf.
    /// @param buf     Destination buffer.
    /// @param maxLen  Size of @p buf (including space for NUL terminator).
    /// @return true if a complete message was placed in @p buf.
    virtual bool receive(char* buf, size_t maxLen) = 0;

    /// @return true if the transport is active and ready for I/O.
    virtual bool isConnected() const = 0;
};
