// comms.h — host communication (serial + optional UDP).

#pragma once

#include "state.h"

enum RecvMessage_t {
    UNDEFINED_MSG = 0,
    RESET_MSG,
    SET_LANES_MSG,
    ARM_MSG,
};

// Initialise serial and start the comm task on Core 0 (shared with WiFi).
void setup_comms();

// Build and broadcast a status frame for the given snapshot.
//   $state,startTime,currentTime,numLanes,t0,t1,t2,t3,t4,t5,t6,t7,gateSet*
// Always eight lane fields (zero-padded) plus a trailing gateSet field (1=set/armed, 0=open).
// The gateSet field is appended after the eight lane fields so old parsers
// that only look at the first 12 fields remain unaffected.
//
// The frame is written to Serial *and*, when the AP is up, broadcast over UDP.
void send_status(TimerState_t st, long startTime, long currentTime,
                 int numLanes, const long *endTimes, bool gateSet);

// Drain any pending host command. Returns the parsed type and, for
// SET_LANES, sets *param to the requested lane count.
RecvMessage_t poll_command(int *param);

// Inject a single complete command line (no trailing newline) from any
// transport.  Thread-safe: serial and UDP RX paths share a lock so the
// pending-command slot is updated atomically.
void comms_inject_line(const char *line);

void send_debug(const char *msg);

// Thread-safe single-line Serial write.  All firmware code that prints to
// Serial must use this (or send_debug / send_status) rather than calling
// Serial.print* directly, so that multi-task writes never interleave.
void serial_println(const char *msg);
