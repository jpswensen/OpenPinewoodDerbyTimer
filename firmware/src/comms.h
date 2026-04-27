// comms.h — serial-only host communication.

#pragma once

#include "state.h"

enum RecvMessage_t {
    UNDEFINED_MSG = 0,
    RESET_MSG,
    SET_LANES_MSG,
    ARM_MSG,
};

// Initialise serial and start the comm task on Core 0.
void setup_comms();

// Build and broadcast a status frame for the given snapshot.
//   $state,startTime,currentTime,numLanes,t0,t1,t2,t3,t4,t5,t6,t7*
// (always eight lane fields, zero-padded; legacy wire-compatible).
void send_status(TimerState_t st, long startTime, long currentTime,
                 int numLanes, const long *endTimes);

// Drain any pending host command. Returns the parsed type and, for
// SET_LANES, sets *param to the requested lane count.
RecvMessage_t poll_command(int *param);

void send_debug(const char *msg);
