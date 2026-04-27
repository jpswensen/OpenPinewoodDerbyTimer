// state.cpp — global timer state, defined once.

#include <Arduino.h>
#include "state.h"

volatile TimerState_t state = RESET;
