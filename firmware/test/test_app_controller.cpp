/// @file test_app_controller.cpp
/// @brief Unit tests for AppController — validates command dispatch,
///        status broadcasting, update-rate logic, and full race integration
///        using MockTimerHAL and MockComm.
///
/// Compile & run natively:
///   g++ -std=c++17 -I../src -o test_app_bin \
///       test_app_controller.cpp \
///       ../src/app/app_controller.cpp \
///       ../src/comm/message_protocol.cpp \
///       ../src/comm/mock_comm.cpp \
///       ../src/hal/mock_hal.cpp \
///       ../src/config/nvs_config.cpp \
///       ../lib/unity/unity.c && ./test_app_bin

#include <unity.h>
#include "../src/app/app_controller.h"
#include "../src/hal/mock_hal.h"
#include "../src/comm/mock_comm.h"
#include "../src/config/nvs_config.h"

#include <cstring>
#include <cstdio>

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Read the most recent sent message from a MockComm outbox.
static bool readLastSent(MockComm& comm, char* buf, size_t maxLen) {
    return comm.readSentMessage(buf, maxLen);
}

// ===========================================================================
// AppController — init & basic tick
// ===========================================================================

void test_controller_init_connects_transports() {
    MockTimerHAL hal;
    MockComm primary;

    AppController ctrl(hal, primary);
    ctrl.init();

    TEST_ASSERT_TRUE(primary.isConnected());
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());
}

void test_controller_tick_sends_first_status() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    ctrl.tick(0);

    // Should have sent at least one status message.
    TEST_ASSERT_EQUAL_INT(1, ctrl.statusMessagesSent());
    TEST_ASSERT_GREATER_THAN(0, comm.sentCount());
}

void test_controller_tick_respects_idle_rate() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    // First tick at t=0 → sends.
    ctrl.tick(0);
    TEST_ASSERT_EQUAL_INT(1, ctrl.statusMessagesSent());
    // Drain outbox.
    { char buf[256]; while (comm.readSentMessage(buf, sizeof(buf))); }

    // Tick at t=500ms (idle interval=1000ms) → should NOT send.
    ctrl.tick(500);
    TEST_ASSERT_EQUAL_INT(1, ctrl.statusMessagesSent());

    // Tick at t=1000ms → should send.
    ctrl.tick(1000);
    TEST_ASSERT_EQUAL_INT(2, ctrl.statusMessagesSent());
}

void test_controller_tick_respects_race_rate() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();
    ctrl.tick(0);  // First status.

    // Arm and start a race.
    hal.arm();
    hal.simulateStartGateOpen(5000);
    TEST_ASSERT_EQUAL(TimerState::IN_RACE, hal.getState());

    // Drain outbox.
    { char buf[256]; while (comm.readSentMessage(buf, sizeof(buf))); }

    // Now we're IN_RACE → 100ms interval.
    ctrl.tick(50);  // Should NOT send (only 50ms since t=0).
    TEST_ASSERT_EQUAL_INT(1, ctrl.statusMessagesSent());

    ctrl.tick(100); // Should send (100ms since t=0).
    TEST_ASSERT_EQUAL_INT(2, ctrl.statusMessagesSent());

    ctrl.tick(150); // Should NOT send.
    TEST_ASSERT_EQUAL_INT(2, ctrl.statusMessagesSent());

    ctrl.tick(200); // Should send.
    TEST_ASSERT_EQUAL_INT(3, ctrl.statusMessagesSent());
}

// ===========================================================================
// Command processing
// ===========================================================================

void test_controller_processes_reset_command() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    // Get to IN_RACE state.
    hal.arm();
    hal.simulateStartGateOpen(1000);
    TEST_ASSERT_EQUAL(TimerState::IN_RACE, hal.getState());

    // Inject RESET command.
    comm.injectMessage("RESET");
    ctrl.tick(0);

    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());
    TEST_ASSERT_EQUAL_INT(1, ctrl.commandsProcessed());
}

void test_controller_processes_arm_command() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());

    comm.injectMessage("ARM");
    ctrl.tick(0);

    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());
    TEST_ASSERT_EQUAL_INT(1, ctrl.commandsProcessed());
}

void test_controller_processes_set_lanes_command() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();
    TEST_ASSERT_EQUAL_INT(MAX_LANES, hal.getLaneCount());

    comm.injectMessage("SET_LANES:4");
    ctrl.tick(0);

    TEST_ASSERT_EQUAL_INT(4, hal.getLaneCount());
    TEST_ASSERT_EQUAL_INT(1, ctrl.commandsProcessed());
}

void test_controller_processes_legacy_lanes_command() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    comm.injectMessage("LANES,6*");
    ctrl.tick(0);

    TEST_ASSERT_EQUAL_INT(6, hal.getLaneCount());
    TEST_ASSERT_EQUAL_INT(1, ctrl.commandsProcessed());
}

void test_controller_ignores_unknown_commands() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    comm.injectMessage("FOOBAR");
    ctrl.tick(0);

    TEST_ASSERT_EQUAL_INT(0, ctrl.commandsProcessed());
}

void test_controller_drains_multiple_commands() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    // Queue three commands.
    comm.injectMessage("SET_LANES:4");
    comm.injectMessage("ARM");
    comm.injectMessage("RESET");

    ctrl.tick(0);

    // All three should be processed in one tick.
    TEST_ASSERT_EQUAL_INT(3, ctrl.commandsProcessed());
    // After ARM then RESET, should be back in RESET.
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());
    // Lane count should be 4 (set before reset, reset doesn't change lane count).
    TEST_ASSERT_EQUAL_INT(4, hal.getLaneCount());
}

// ===========================================================================
// Dual-transport support
// ===========================================================================

void test_controller_dual_transport_both_receive_status() {
    MockTimerHAL hal;
    MockComm serial;
    MockComm tcp;

    AppController ctrl(hal, serial, &tcp);
    ctrl.init();

    ctrl.tick(0);

    // Both transports should have received the status message.
    TEST_ASSERT_GREATER_THAN(0, serial.sentCount());
    TEST_ASSERT_GREATER_THAN(0, tcp.sentCount());
}

void test_controller_dual_transport_commands_from_either() {
    MockTimerHAL hal;
    MockComm serial;
    MockComm tcp;

    AppController ctrl(hal, serial, &tcp);
    ctrl.init();

    // ARM from serial.
    serial.injectMessage("ARM");
    ctrl.tick(0);
    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());

    // RESET from TCP.
    tcp.injectMessage("RESET");
    ctrl.tick(1000);
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());

    TEST_ASSERT_EQUAL_INT(2, ctrl.commandsProcessed());
}

void test_controller_disconnected_transport_skipped() {
    MockTimerHAL hal;
    MockComm serial;
    MockComm tcp;

    AppController ctrl(hal, serial, &tcp);
    ctrl.init();

    tcp.disconnect();

    ctrl.tick(0);

    // Serial should still get status.
    TEST_ASSERT_GREATER_THAN(0, serial.sentCount());
    // TCP should have received nothing (disconnected).
    TEST_ASSERT_EQUAL_INT(0, tcp.sentCount());
}

// ===========================================================================
// Status message content
// ===========================================================================

void test_status_message_format_reset() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    ctrl.tick(0);

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(readLastSent(comm, buf, sizeof(buf)));

    // Should start with $1 (RESET) and end with *.
    TEST_ASSERT_EQUAL_CHAR('$', buf[0]);
    TEST_ASSERT_TRUE(strncmp(buf, "$1,", 3) == 0);
    TEST_ASSERT_EQUAL_CHAR('*', buf[strlen(buf) - 1]);
}

void test_status_message_format_in_race() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();
    ctrl.tick(0);
    { char buf[256]; while (comm.readSentMessage(buf, sizeof(buf))); }

    hal.setLaneCount(4);
    hal.arm();
    hal.simulateStartGateOpen(10000);
    hal.simulateLaneFinish(0, 13500);

    ctrl.tick(100);

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(readLastSent(comm, buf, sizeof(buf)));

    // Should start with $3 (IN_RACE).
    TEST_ASSERT_TRUE(strncmp(buf, "$3,", 3) == 0);
}

void test_status_message_format_finished() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();
    ctrl.tick(0);
    { char buf[256]; while (comm.readSentMessage(buf, sizeof(buf))); }

    hal.setLaneCount(2);
    hal.arm();
    hal.simulateStartGateOpen(5000);
    hal.simulateLaneFinish(0, 8000);
    hal.simulateLaneFinish(1, 8500);
    hal.updateState();
    TEST_ASSERT_EQUAL(TimerState::FINISHED, hal.getState());

    ctrl.tick(1000);

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(readLastSent(comm, buf, sizeof(buf)));
    TEST_ASSERT_TRUE(strncmp(buf, "$4,", 3) == 0);
}

// ===========================================================================
// Update interval logic
// ===========================================================================

void test_update_interval_idle() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    TEST_ASSERT_EQUAL_UINT32(IDLE_UPDATE_INTERVAL_MS, ctrl.updateIntervalMs());
}

void test_update_interval_set_state() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    hal.arm();
    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());
    TEST_ASSERT_EQUAL_UINT32(RACE_UPDATE_INTERVAL_MS, ctrl.updateIntervalMs());
}

void test_update_interval_in_race() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    hal.arm();
    hal.simulateStartGateOpen(1000);
    TEST_ASSERT_EQUAL(TimerState::IN_RACE, hal.getState());
    TEST_ASSERT_EQUAL_UINT32(RACE_UPDATE_INTERVAL_MS, ctrl.updateIntervalMs());
}

void test_update_interval_finished_returns_idle() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    hal.forceState(TimerState::FINISHED);
    TEST_ASSERT_EQUAL_UINT32(IDLE_UPDATE_INTERVAL_MS, ctrl.updateIntervalMs());
}

// ===========================================================================
// NVS config (native stub)
// ===========================================================================

void test_nvs_config_defaults() {
    FirmwareConfig cfg;
    cfg.setDefaults();

    TEST_ASSERT_EQUAL_STRING("PWDTIMER", cfg.wifiSSID);
    TEST_ASSERT_EQUAL_STRING("PWDTIMER", cfg.wifiPassword);
    TEST_ASSERT_EQUAL_UINT8(8, cfg.laneCount);
    TEST_ASSERT_TRUE(cfg.otaEnabled);
}

void test_nvs_config_save_and_load() {
    NVSConfig::init();

    FirmwareConfig orig;
    orig.setDefaults();
    std::strncpy(orig.wifiSSID, "MYNET", NVS_SSID_MAX);
    orig.laneCount = 6;
    orig.otaEnabled = false;
    NVSConfig::save(orig);

    FirmwareConfig loaded;
    NVSConfig::load(loaded);

    TEST_ASSERT_EQUAL_STRING("MYNET", loaded.wifiSSID);
    TEST_ASSERT_EQUAL_UINT8(6, loaded.laneCount);
    TEST_ASSERT_FALSE(loaded.otaEnabled);
}

// ===========================================================================
// Full race integration
// ===========================================================================

void test_full_race_cycle_via_controller() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    // 1. Initial state — RESET.
    ctrl.tick(0);
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());

    // 2. Set 4 lanes and arm via commands.
    comm.injectMessage("SET_LANES:4");
    comm.injectMessage("ARM");
    ctrl.tick(100);
    TEST_ASSERT_EQUAL_INT(4, hal.getLaneCount());
    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());

    // 3. Simulate race start and lane finishes.
    hal.simulateStartGateOpen(1000000);
    hal.simulateLaneFinish(0, 1350000);
    hal.simulateLaneFinish(1, 1380000);
    hal.simulateLaneFinish(2, 1420000);
    hal.simulateLaneFinish(3, 1490000);

    // tick will call updateState → transition to FINISHED.
    ctrl.tick(200);
    TEST_ASSERT_EQUAL(TimerState::FINISHED, hal.getState());

    // 4. Verify the last status message reports FINISHED with correct times.
    { char buf[256]; while (comm.readSentMessage(buf, sizeof(buf))); }
    // Force one more status send.
    ctrl.tick(1200);
    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(readLastSent(comm, buf, sizeof(buf)));
    TEST_ASSERT_TRUE(strncmp(buf, "$4,", 3) == 0);

    // 5. Reset via command.
    comm.injectMessage("RESET");
    ctrl.tick(2200);
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());

    // Verify snapshot is cleared.
    LaneTimesSnapshot snap = hal.getLaneTimes();
    TEST_ASSERT_EQUAL_UINT32(0, snap.startTime);
    for (int i = 0; i < 4; ++i) {
        TEST_ASSERT_EQUAL_UINT32(0, snap.laneTimes[i]);
    }
}

void test_repeat_race_cycle() {
    MockTimerHAL hal;
    MockComm comm;

    AppController ctrl(hal, comm);
    ctrl.init();

    // Race 1.
    comm.injectMessage("SET_LANES:2");
    comm.injectMessage("ARM");
    ctrl.tick(0);
    hal.simulateStartGateOpen(5000);
    hal.simulateLaneFinish(0, 8000);
    hal.simulateLaneFinish(1, 8500);
    ctrl.tick(100);
    TEST_ASSERT_EQUAL(TimerState::FINISHED, hal.getState());

    // Reset and race again.
    comm.injectMessage("RESET");
    ctrl.tick(1100);
    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState());

    comm.injectMessage("ARM");
    ctrl.tick(2100);
    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());

    hal.simulateStartGateOpen(20000);
    hal.simulateLaneFinish(0, 24000);
    hal.simulateLaneFinish(1, 24200);
    ctrl.tick(2200);
    TEST_ASSERT_EQUAL(TimerState::FINISHED, hal.getState());

    LaneTimesSnapshot snap = hal.getLaneTimes();
    TEST_ASSERT_EQUAL_UINT32(20000, snap.startTime);
    TEST_ASSERT_EQUAL_UINT32(24000, snap.laneTimes[0]);
    TEST_ASSERT_EQUAL_UINT32(24200, snap.laneTimes[1]);
}

// ===========================================================================
// Edge cases
// ===========================================================================

void test_arm_when_already_armed_is_noop() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    comm.injectMessage("ARM");
    comm.injectMessage("ARM");  // Second ARM should be ignored.
    ctrl.tick(0);

    TEST_ASSERT_EQUAL(TimerState::SET, hal.getState());
    TEST_ASSERT_EQUAL_INT(2, ctrl.commandsProcessed()); // Both processed, second is no-op.
}

void test_set_lanes_clamped() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    comm.injectMessage("SET_LANES:0"); // Out of range — parser returns NONE.
    ctrl.tick(0);
    TEST_ASSERT_EQUAL_INT(MAX_LANES, hal.getLaneCount()); // Unchanged.
    TEST_ASSERT_EQUAL_INT(0, ctrl.commandsProcessed());   // Rejected by parser.
}

void test_commands_on_disconnected_transport() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    comm.disconnect();
    comm.injectMessage("ARM"); // In queue but receive will fail.
    ctrl.tick(0);

    TEST_ASSERT_EQUAL(TimerState::RESET, hal.getState()); // Not armed.
    TEST_ASSERT_EQUAL_INT(0, ctrl.commandsProcessed());
}

void test_no_status_sent_when_transport_disconnected() {
    MockTimerHAL hal;
    MockComm comm;
    AppController ctrl(hal, comm);
    ctrl.init();

    comm.disconnect();
    ctrl.tick(0);

    // broadcastStatus was called but send is skipped for disconnected.
    TEST_ASSERT_EQUAL_INT(1, ctrl.statusMessagesSent()); // Counter incremented.
    TEST_ASSERT_EQUAL_INT(0, comm.sentCount());          // Nothing actually sent.
}

// ===========================================================================
// Test runner
// ===========================================================================

void setUp() {}
void tearDown() {}

int main(int /*argc*/, char** /*argv*/) {
    UNITY_BEGIN();

    // Init & basic tick
    RUN_TEST(test_controller_init_connects_transports);
    RUN_TEST(test_controller_tick_sends_first_status);
    RUN_TEST(test_controller_tick_respects_idle_rate);
    RUN_TEST(test_controller_tick_respects_race_rate);

    // Command processing
    RUN_TEST(test_controller_processes_reset_command);
    RUN_TEST(test_controller_processes_arm_command);
    RUN_TEST(test_controller_processes_set_lanes_command);
    RUN_TEST(test_controller_processes_legacy_lanes_command);
    RUN_TEST(test_controller_ignores_unknown_commands);
    RUN_TEST(test_controller_drains_multiple_commands);

    // Dual transport
    RUN_TEST(test_controller_dual_transport_both_receive_status);
    RUN_TEST(test_controller_dual_transport_commands_from_either);
    RUN_TEST(test_controller_disconnected_transport_skipped);

    // Status message content
    RUN_TEST(test_status_message_format_reset);
    RUN_TEST(test_status_message_format_in_race);
    RUN_TEST(test_status_message_format_finished);

    // Update interval logic
    RUN_TEST(test_update_interval_idle);
    RUN_TEST(test_update_interval_set_state);
    RUN_TEST(test_update_interval_in_race);
    RUN_TEST(test_update_interval_finished_returns_idle);

    // NVS config
    RUN_TEST(test_nvs_config_defaults);
    RUN_TEST(test_nvs_config_save_and_load);

    // Full race integration
    RUN_TEST(test_full_race_cycle_via_controller);
    RUN_TEST(test_repeat_race_cycle);

    // Edge cases
    RUN_TEST(test_arm_when_already_armed_is_noop);
    RUN_TEST(test_set_lanes_clamped);
    RUN_TEST(test_commands_on_disconnected_transport);
    RUN_TEST(test_no_status_sent_when_transport_disconnected);

    return UNITY_END();
}
