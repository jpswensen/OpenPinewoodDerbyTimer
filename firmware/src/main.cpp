/// @file main.cpp
/// @brief Firmware entry point — placeholder until comm + main integration tasks.
///
/// This file provides setup() and loop() stubs so that the HAL compiles as
/// part of the esp32dev PlatformIO environment.  The full application logic
/// will be added in subsequent PRD tasks.

#ifdef ARDUINO

#include "hal/esp32_hal.h"

static ESP32TimerHAL timerHal;

void setup() {
    Serial.begin(115200);
    Serial.println("PWDTimer firmware starting...");
    timerHal.init();
}

void loop() {
    timerHal.updateState();
    delay(50);
}

#endif // ARDUINO
