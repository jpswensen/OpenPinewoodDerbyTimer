// state.h — PWDTimer state machine type and shared instance.

#pragma once

enum TimerState_t : int {
    UNDEFINED = 0,
    RESET     = 1,
    SET       = 2,
    IN_RACE   = 3,
    FINISHED  = 4,
};

extern volatile TimerState_t state;
