/// @file message_protocol.cpp
/// @brief Implementation of the PWDTimer message protocol formatter and parser.

#include "message_protocol.h"

#include <cstdio>
#include <cstring>
#include <cctype>

namespace MessageProtocol {

// ---------------------------------------------------------------------------
// Status message formatter
// ---------------------------------------------------------------------------

size_t formatStatusMessage(char* buf, size_t maxLen,
                           TimerState state,
                           const LaneTimesSnapshot& snapshot,
                           uint32_t currentTime)
{
    if (buf == nullptr || maxLen < 16) {
        return 0;
    }

    // Start the frame: $state,startTime,currentTime,numLanes
    int offset = snprintf(buf, maxLen, "$%u,%lu,%lu,%d",
                          static_cast<unsigned>(state),
                          static_cast<unsigned long>(snapshot.startTime),
                          static_cast<unsigned long>(currentTime),
                          snapshot.laneCount);

    if (offset < 0 || static_cast<size_t>(offset) >= maxLen) {
        buf[0] = '\0';
        return 0;
    }

    // Append each lane time
    for (int i = 0; i < snapshot.laneCount && i < MAX_LANES; ++i) {
        int written = snprintf(buf + offset, maxLen - static_cast<size_t>(offset),
                               ",%lu",
                               static_cast<unsigned long>(snapshot.laneTimes[i]));
        if (written < 0 || static_cast<size_t>(offset + written) >= maxLen) {
            buf[0] = '\0';
            return 0;
        }
        offset += written;
    }

    // Close the frame
    if (static_cast<size_t>(offset + 1) >= maxLen) {
        buf[0] = '\0';
        return 0;
    }
    buf[offset++] = '*';
    buf[offset] = '\0';

    return static_cast<size_t>(offset);
}

// ---------------------------------------------------------------------------
// Command parser helpers
// ---------------------------------------------------------------------------

/// Skip leading whitespace and return pointer to first non-space character.
static const char* skipWhitespace(const char* s) {
    while (*s && isspace(static_cast<unsigned char>(*s))) {
        ++s;
    }
    return s;
}

/// Check if @p s starts with @p prefix (case-insensitive).
static bool startsWithCI(const char* s, const char* prefix) {
    while (*prefix) {
        if (toupper(static_cast<unsigned char>(*s)) !=
            toupper(static_cast<unsigned char>(*prefix))) {
            return false;
        }
        ++s;
        ++prefix;
    }
    return true;
}

/// Parse an integer from @p s, returning the value and advancing @p s past
/// the digits.  Returns 0 if no digits are found.
static int parseIntFrom(const char*& s) {
    int val = 0;
    bool found = false;
    while (*s >= '0' && *s <= '9') {
        val = val * 10 + (*s - '0');
        found = true;
        ++s;
    }
    return found ? val : -1;
}

// ---------------------------------------------------------------------------
// Public command parser
// ---------------------------------------------------------------------------

ParsedCommand parseCommand(const char* msg)
{
    ParsedCommand cmd;
    if (msg == nullptr) {
        return cmd;
    }

    const char* p = skipWhitespace(msg);

    // RESET
    if (startsWithCI(p, "RESET")) {
        cmd.type = CommandType::CMD_RESET;
        return cmd;
    }

    // ARM
    if (startsWithCI(p, "ARM")) {
        cmd.type = CommandType::CMD_ARM;
        return cmd;
    }

    // SET_LANES:n  (new format)
    if (startsWithCI(p, "SET_LANES:")) {
        p += 10;  // strlen("SET_LANES:")
        int lanes = parseIntFrom(p);
        if (lanes >= 1 && lanes <= MAX_LANES) {
            cmd.type = CommandType::CMD_SET_LANES;
            cmd.param = lanes;
        }
        return cmd;
    }

    // LANES,n*  (legacy format)
    if (startsWithCI(p, "LANES,") || startsWithCI(p, "LANES ")) {
        p += 6;  // strlen("LANES,") or "LANES "
        int lanes = parseIntFrom(p);
        if (lanes >= 1 && lanes <= MAX_LANES) {
            cmd.type = CommandType::CMD_SET_LANES;
            cmd.param = lanes;
        }
        return cmd;
    }

    return cmd;  // NONE — unrecognised
}

}  // namespace MessageProtocol
