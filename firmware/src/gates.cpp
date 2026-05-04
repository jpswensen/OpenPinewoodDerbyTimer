// gates.cpp — start gate + lane sensor handling.
//
// Pin map (matches the ESP32-DEVKITC-32D PWDTimer schematic):
//   Lane 1 (OUT1) -> GPIO 12   Lane 5 (OUT5) -> GPIO 25
//   Lane 2 (OUT2) -> GPIO 14   Lane 6 (OUT6) -> GPIO 33
//   Lane 3 (OUT3) -> GPIO 27   Lane 7 (OUT7) -> GPIO 32
//   Lane 4 (OUT4) -> GPIO 26   Lane 8 (OUT8) -> GPIO 23
//   Start gate    -> GPIO 22
//
// Architecture:
//   Core 1 owns gatesCoreTask at configMAX_PRIORITIES-1.  It runs a tight
//   polling loop that snapshots the Xtensa CCOUNT register and then reads
//   both GPIO banks back-to-back so every lane in the same iteration shares
//   a single cycle-accurate timestamp (~4 ns resolution at 240 MHz).
//   All six bank-0 lanes plus the start gate are captured in one 32-bit read;
//   the two bank-1 lanes are captured in a second read ~8 ns later.
//   Arduino's loop() also defaults to Core 1 but is suspended in main.cpp,
//   so the timing task is the only thing scheduled here aside from the FreeRTOS
//   IDLE1 task.
//
//   Core 0 owns commsCoreTask, the state-machine task, and the WiFi stack
//   (when enabled — ESP-IDF pins WiFi/TCP-IP protocol tasks to Core 0 by
//   default via CONFIG_ESP32_WIFI_TASK_CORE_ID=0).
//   Core 0 calls read_gates() at ~10 Hz and reset_gates() on RESET commands.
//
// Data protection:
//   Timing variables (s_startUs, s_startCycles, s_endCycles, s_laneFinished)
//   are written by Core 0 and read by Core 1.  portENTER_CRITICAL /
//   portEXIT_CRITICAL with a portMUX_TYPE spinlock is used on every write
//   and every read, providing a true cross-core critical section.
//   portDISABLE_INTERRUPTS() alone is insufficient — it only masks the
//   calling core's interrupts and does not prevent the other core from
//   concurrently accessing the same memory.
//
//   The hot-path "has lane i finished?" check uses a task-local boolean
//   array (localFinished[]) that is only ever touched by Core 0, so no lock
//   is needed in the tight loop body between actual timing events.

#include <Arduino.h>
#include "soc/gpio_reg.h"   // GPIO_IN_REG, GPIO_IN1_REG
#include "soc/soc.h"        // REG_READ
#include "state.h"
#include "gates.h"

// ── Configuration ──────────────────────────────────────────────────────────

static const int GATES_TASK_CORE  = 1;               // Core 1: timing + idle loop()
static const int GATES_TASK_PRIO  = configMAX_PRIORITIES - 1;
static const int GATES_TASK_STACK = 2048;

static const int LANE_PINS[MAX_LANES] = { 12, 14, 27, 26, 25, 33, 32, 23 };
static const int STARTGATE_PIN = 22;

// 240 cycles == 1 µs exactly at 240 MHz.  Must match board_build.f_cpu / 1e6.
static const uint32_t CPU_FREQ_MHZ = 240;

// ── Pre-computed GPIO masks (initialised once in setup_gates) ──────────────
// Bank 0: GPIO_IN_REG  covers GPIO  0-31 (lanes 1-5, 8 + start gate)
// Bank 1: GPIO_IN1_REG covers GPIO 32-39 (lanes 6-7)
static uint32_t s_laneBank[MAX_LANES];  // 0 or 1
static uint32_t s_laneMask[MAX_LANES];  // bitmask within that bank
static uint32_t s_startGateMask = 0;    // always bank 0

// ── Cross-core spinlock ────────────────────────────────────────────────────
// portENTER_CRITICAL(mux) disables the current core's interrupts AND spin-
// waits until the mux is free, atomically blocking the other core from
// entering the same critical section at the same time.
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;

// ── Shared timing state — every access protected by s_mux ─────────────────
static volatile int64_t  s_startUs                  = -1; // micros() at start; -1 = not started
static volatile uint64_t s_startCycles64            = 0;  // 64-bit extended CCOUNT at start
static volatile uint64_t s_endCycles64[MAX_LANES]   = {}; // 64-bit extended CCOUNT at each lane finish
static volatile bool     s_laneFinished[MAX_LANES]  = {};
// After RESET, require a clean HIGH sample before accepting a falling edge.
// This prevents a gate that is already open/LOW from immediately starting.
static volatile bool     s_waitForStartGateHigh     = true;

// ── Lane count (written Core 1, read Core 0) ───────────────────────────────
// A single aligned 32-bit write is atomic on Xtensa LX6; no spinlock needed.
static volatile int s_numGates = MAX_LANES;

// ── CCOUNT helper (always in IRAM, no flash access) ───────────────────────
static IRAM_ATTR inline uint32_t get_ccount() {
    uint32_t v;
    asm volatile("rsr.ccount %0" : "=r"(v));
    return v;
}

// ── Core-0 timing task ─────────────────────────────────────────────────────

static void IRAM_ATTR gatesCoreTask(void *) {
    for (int i = 0; i < MAX_LANES; ++i) pinMode(LANE_PINS[i], INPUT_PULLUP);
    pinMode(STARTGATE_PIN, INPUT_PULLUP);

    // Task-local finished flags — only ever touched by this task, so no lock
    // is needed for the hot-path read inside the loop.  Cleared at each race
    // start alongside the shared s_laneFinished[] array.
    bool localFinished[MAX_LANES] = {};

    uint32_t prevLo = REG_READ(GPIO_IN_REG);
    uint32_t prevHi = REG_READ(GPIO_IN1_REG);

    // Extend the 32-bit Xtensa cycle counter to 64 bits by tracking wraps.
    // CCOUNT wraps every (2^32 / 240e6) ≈ 17.9 s at 240 MHz, which would
    // otherwise corrupt lane finish-time deltas for any race or manual test
    // that takes longer than that.  This loop runs continuously (with at
    // most a 1 ms vTaskDelay during RESET/FINISHED) so we will never miss
    // more than one wrap between iterations.
    uint32_t prevCcount   = get_ccount();
    uint64_t ccountHigh   = 0;

    for (;;) {
        // Snapshot the cycle counter before reading the GPIO banks so that
        // every pin sampled in this iteration shares the same timestamp.
        const uint32_t ccount32 = get_ccount();
        if (ccount32 < prevCcount) ccountHigh += (1ULL << 32);
        prevCcount = ccount32;
        const uint64_t cycles = ccountHigh | ccount32;
        const uint32_t lo     = REG_READ(GPIO_IN_REG);   // GPIO  0-31 (~4 ns later)
        const uint32_t hi     = REG_READ(GPIO_IN1_REG);  // GPIO 32-39 (~8 ns later)

        // volatile 32-bit read is atomic on Xtensa LX6.
        const TimerState_t cur = state;

        if (s_waitForStartGateHigh) {
            if (lo & s_startGateMask) {
                s_waitForStartGateHigh = false;
            } else if (cur == RESET || cur == SET || cur == FINISHED) {
                vTaskDelay(1);
            }
            prevLo = lo;
            prevHi = hi;
            continue;
        }

        if (cur == SET) {
            // FALLING edge on start-gate pin (active-low with pull-up).
            if ((prevLo & s_startGateMask) && !(lo & s_startGateMask)) {
                portENTER_CRITICAL(&s_mux);
                s_startUs       = (int64_t)micros();
                s_startCycles64 = cycles;
                for (int i = 0; i < MAX_LANES; ++i) {
                    s_endCycles64[i]  = 0;
                    s_laneFinished[i] = false;
                }
                portEXIT_CRITICAL(&s_mux);

                for (int i = 0; i < MAX_LANES; ++i) localFinished[i] = false;
                state = IN_RACE; // atomic 32-bit store
            }

        } else if (cur == IN_RACE) {
            const uint32_t fell_lo = prevLo & ~lo; // bits that went HIGH -> LOW
            const uint32_t fell_hi = prevHi & ~hi;
            const int      active  = s_numGates;
            int            pending = 0;

            for (int i = 0; i < active; ++i) {
                if (!localFinished[i]) {
                    const uint32_t fell = s_laneBank[i] ? fell_hi : fell_lo;
                    if (fell & s_laneMask[i]) {
                        localFinished[i] = true;
                        portENTER_CRITICAL(&s_mux);
                        s_endCycles64[i]  = cycles;
                        s_laneFinished[i] = true;
                        portEXIT_CRITICAL(&s_mux);
                    } else {
                        ++pending;
                    }
                }
            }

            if (pending == 0) state = FINISHED; // atomic 32-bit store

        } else {
            // RESET or FINISHED: nothing to time.  Sleep for one tick so
            // IDLE1, loop(), and any other lower-priority work on Core 1
            // get CPU time.  taskYIELD() alone is NOT sufficient here:
            // this task runs at configMAX_PRIORITIES-1, and yield only
            // round-robins same-priority ready tasks — of which there are
            // none — so IDLE1 would be starved and the Task Watchdog
            // Timer would eventually reset the chip.
            vTaskDelay(1);
        }

        prevLo = lo;
        prevHi = hi;
    }
}

// ── Public API ─────────────────────────────────────────────────────────────

void setup_gates() {
    for (int i = 0; i < MAX_LANES; ++i) {
        if (LANE_PINS[i] >= 32) {
            s_laneBank[i] = 1;
            s_laneMask[i] = 1u << (LANE_PINS[i] - 32);
        } else {
            s_laneBank[i] = 0;
            s_laneMask[i] = 1u << LANE_PINS[i];
        }
    }
    s_startGateMask = 1u << STARTGATE_PIN;

    reset_gates();
    xTaskCreatePinnedToCore(gatesCoreTask, "gatesTask",
                            GATES_TASK_STACK, nullptr,
                            GATES_TASK_PRIO, nullptr, GATES_TASK_CORE);
}

int  get_num_gates()      { return s_numGates; }
void set_num_gates(int n) {
    if (n < 1) n = 1;
    if (n > MAX_LANES) n = MAX_LANES;
    s_numGates = n;
}

void reset_gates() {
    portENTER_CRITICAL(&s_mux);
    s_startUs       = -1;
    s_startCycles64 = 0;
    s_waitForStartGateHigh = true;
    for (int i = 0; i < MAX_LANES; ++i) {
        s_endCycles64[i]  = 0;
        s_laneFinished[i] = false;
    }
    portEXIT_CRITICAL(&s_mux);
}

bool is_starting_gate_set() {
    return digitalRead(STARTGATE_PIN) == HIGH;
}

void read_gates(int64_t &startOut, int64_t *endTimesOut) {
    // Take an atomic cross-core snapshot of all timing data.
    int64_t  snapStart;
    uint64_t snapStartCyc;
    uint64_t snapEnd[MAX_LANES];
    bool     snapFin[MAX_LANES];

    portENTER_CRITICAL(&s_mux);
    snapStart    = s_startUs;
    snapStartCyc = s_startCycles64;
    for (int i = 0; i < MAX_LANES; ++i) {
        snapEnd[i] = s_endCycles64[i];
        snapFin[i] = s_laneFinished[i];
    }
    portEXIT_CRITICAL(&s_mux);

    startOut = snapStart;
    for (int i = 0; i < MAX_LANES; ++i) {
        if (snapFin[i] && snapStart > 0) {
            // 64-bit cycle delta -> microsecond offset added to the absolute
            // start timestamp, giving ~4 ns relative resolution between lanes
            // and no wraparound for any plausible race duration.
            const uint64_t dt = snapEnd[i] - snapStartCyc;
            endTimesOut[i] = snapStart + (int64_t)(dt / CPU_FREQ_MHZ);
        } else {
            endTimesOut[i] = 0;
        }
    }
}
