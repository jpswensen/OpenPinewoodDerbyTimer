#pragma once

/// @file message_protocol.h
/// @brief PWDTimer protocol: status message formatter and command parser.
///
/// Status message format (firmware → host):
///   $state,startTime,currentTime,numLanes,endTime[0],endTime[1],...*
///   All times are unsigned 32-bit integers in microseconds.
///   state: 1=RESET, 2=SET, 3=IN_RACE, 4=FINISHED
///
/// Commands (host → firmware):
///   RESET           — reset the timer
///   ARM             — arm the timer (RESET → SET)
///   SET_LANES:n     — set the number of active lanes (1–8)
///   LANES,n*        — legacy format for SET_LANES (backward compat)

#include "comm_interface.h"
#include "../hal/hal.h"

#include <cstddef>
#include <cstdint>

namespace MessageProtocol {

/// Format a status message into @p buf.
///
/// Writes a string of the form:
///   $state,startTime,currentTime,numLanes,t0,t1,...,t(numLanes-1)*
///
/// @param buf         Destination buffer.
/// @param maxLen      Size of @p buf (including NUL terminator space).
/// @param state       Current timer state.
/// @param snapshot    Atomic snapshot of lane timing data.
/// @param currentTime Current time in microseconds (e.g., from micros()).
/// @return Number of characters written (excluding NUL), or 0 on error.
size_t formatStatusMessage(char* buf, size_t maxLen,
                           TimerState state,
                           const LaneTimesSnapshot& snapshot,
                           uint32_t currentTime);

/// Parse an incoming command string.
///
/// Recognises:
///   "RESET"          → CMD_RESET
///   "ARM"            → CMD_ARM
///   "SET_LANES:n"    → CMD_SET_LANES, param = n
///   "LANES,n*"       → CMD_SET_LANES, param = n  (legacy compat)
///
/// Leading/trailing whitespace and the legacy '*' terminator are tolerated.
/// Unrecognised input returns CommandType::NONE.
ParsedCommand parseCommand(const char* msg);

}  // namespace MessageProtocol
