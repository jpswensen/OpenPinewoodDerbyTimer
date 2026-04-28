// gates.h — start gate + lane sensor interface.
//
// Pins are defined in gates.cpp from the schematic of the
// ESP32-DEVKITC-32D PWDTimer board.

#pragma once

#include <stdint.h>

#define MAX_LANES 8

void setup_gates();
int  get_num_gates();
void set_num_gates(int n);
void reset_gates();
bool is_starting_gate_set();
void read_gates(int64_t &startOut, int64_t *endTimesOut);
