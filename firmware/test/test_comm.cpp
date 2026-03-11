/// @file test_comm.cpp
/// @brief Unit tests for the communication abstraction layer.
///
/// Tests cover:
///   - MockComm transport (send/receive/connect/disconnect)
///   - MessageProtocol::formatStatusMessage (framing, content, edge cases)
///   - MessageProtocol::parseCommand (RESET, ARM, SET_LANES, legacy, invalid)
///   - MessageQueue helper (push/pop/overflow/clear)

#include <unity.h>
#include "../src/comm/mock_comm.h"
#include "../src/comm/message_protocol.h"

#include <cstring>
#include <cstdio>

// ===========================================================================
// MockComm tests
// ===========================================================================

void test_mock_comm_init_connects() {
    MockComm comm;
    TEST_ASSERT_FALSE(comm.isConnected());
    comm.init();
    TEST_ASSERT_TRUE(comm.isConnected());
}

void test_mock_comm_send_receive() {
    MockComm comm;
    comm.init();

    // Inject a message and receive it
    TEST_ASSERT_TRUE(comm.injectMessage("RESET"));
    TEST_ASSERT_EQUAL_INT(1, comm.pendingCount());

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(comm.receive(buf, sizeof(buf)));
    TEST_ASSERT_EQUAL_STRING("RESET", buf);
    TEST_ASSERT_EQUAL_INT(0, comm.pendingCount());
}

void test_mock_comm_send_captures_outbox() {
    MockComm comm;
    comm.init();

    TEST_ASSERT_TRUE(comm.send("$1,0,100,4,0,0,0,0*"));
    TEST_ASSERT_EQUAL_INT(1, comm.sentCount());

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(comm.readSentMessage(buf, sizeof(buf)));
    TEST_ASSERT_EQUAL_STRING("$1,0,100,4,0,0,0,0*", buf);
}

void test_mock_comm_send_fails_when_disconnected() {
    MockComm comm;
    comm.init();
    comm.disconnect();

    TEST_ASSERT_FALSE(comm.send("hello"));
    TEST_ASSERT_EQUAL_INT(0, comm.sentCount());
}

void test_mock_comm_receive_fails_when_disconnected() {
    MockComm comm;
    comm.init();
    comm.injectMessage("RESET");
    comm.disconnect();

    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_FALSE(comm.receive(buf, sizeof(buf)));
}

void test_mock_comm_reconnect() {
    MockComm comm;
    comm.init();
    comm.disconnect();
    TEST_ASSERT_FALSE(comm.isConnected());
    comm.reconnect();
    TEST_ASSERT_TRUE(comm.isConnected());
}

void test_mock_comm_reset_clears_all() {
    MockComm comm;
    comm.init();
    comm.injectMessage("A");
    comm.send("B");
    comm.reset();

    TEST_ASSERT_FALSE(comm.isConnected());
    TEST_ASSERT_EQUAL_INT(0, comm.pendingCount());
    TEST_ASSERT_EQUAL_INT(0, comm.sentCount());
}

void test_mock_comm_null_args() {
    MockComm comm;
    comm.init();

    TEST_ASSERT_FALSE(comm.send(nullptr));
    TEST_ASSERT_FALSE(comm.receive(nullptr, 10));

    char buf[10];
    TEST_ASSERT_FALSE(comm.receive(buf, 0));
}

// ===========================================================================
// MessageQueue tests
// ===========================================================================

void test_message_queue_fifo_order() {
    MessageQueue<4> q;
    q.push("A");
    q.push("B");
    q.push("C");

    char buf[COMM_MAX_MSG_LEN];
    q.pop(buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("A", buf);
    q.pop(buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("B", buf);
    q.pop(buf, sizeof(buf));
    TEST_ASSERT_EQUAL_STRING("C", buf);
}

void test_message_queue_overflow_rejects() {
    MessageQueue<2> q;
    TEST_ASSERT_TRUE(q.push("A"));
    TEST_ASSERT_TRUE(q.push("B"));
    TEST_ASSERT_FALSE(q.push("C"));  // Queue full
    TEST_ASSERT_EQUAL_INT(2, q.count());
}

void test_message_queue_empty_pop_returns_false() {
    MessageQueue<4> q;
    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_FALSE(q.pop(buf, sizeof(buf)));
}

void test_message_queue_clear() {
    MessageQueue<4> q;
    q.push("A");
    q.push("B");
    q.clear();
    TEST_ASSERT_EQUAL_INT(0, q.count());
}

// ===========================================================================
// MessageProtocol::formatStatusMessage tests
// ===========================================================================

void test_format_reset_state() {
    LaneTimesSnapshot snap = {};
    snap.startTime = 0;
    snap.laneCount = 4;
    for (int i = 0; i < MAX_LANES; i++) snap.laneTimes[i] = 0;

    char buf[COMM_MAX_MSG_LEN];
    size_t len = MessageProtocol::formatStatusMessage(
        buf, sizeof(buf), TimerState::RESET, snap, 1000);

    TEST_ASSERT_GREATER_THAN(0, len);
    TEST_ASSERT_EQUAL_CHAR('$', buf[0]);
    TEST_ASSERT_EQUAL_CHAR('*', buf[len - 1]);
    // Should start with $1, (RESET = 1)
    TEST_ASSERT_TRUE(strncmp(buf, "$1,", 3) == 0);
}

void test_format_in_race_8_lanes() {
    LaneTimesSnapshot snap = {};
    snap.startTime = 1000000;
    snap.laneCount = 8;
    snap.laneTimes[0] = 1250000;
    snap.laneTimes[1] = 1260000;
    snap.laneTimes[2] = 0;
    snap.laneTimes[3] = 0;
    snap.laneTimes[4] = 1255000;
    snap.laneTimes[5] = 0;
    snap.laneTimes[6] = 0;
    snap.laneTimes[7] = 0;

    char buf[COMM_MAX_MSG_LEN];
    size_t len = MessageProtocol::formatStatusMessage(
        buf, sizeof(buf), TimerState::IN_RACE, snap, 1270000);

    TEST_ASSERT_GREATER_THAN(0, len);
    // Verify it starts with $3 (IN_RACE = 3)
    TEST_ASSERT_TRUE(strncmp(buf, "$3,", 3) == 0);
    // Should contain 8 lane time fields (count commas after numLanes field)
    // Format: $state,start,current,numLanes,t0,t1,t2,t3,t4,t5,t6,t7*
    int commaCount = 0;
    for (size_t i = 0; i < len; i++) {
        if (buf[i] == ',') commaCount++;
    }
    // 3 commas before lanes + 8 commas (one before each lane) = 11 total
    TEST_ASSERT_EQUAL_INT(11, commaCount);
}

void test_format_finished_4_lanes() {
    LaneTimesSnapshot snap = {};
    snap.startTime = 500000;
    snap.laneCount = 4;
    snap.laneTimes[0] = 700000;
    snap.laneTimes[1] = 750000;
    snap.laneTimes[2] = 720000;
    snap.laneTimes[3] = 680000;

    char buf[COMM_MAX_MSG_LEN];
    size_t len = MessageProtocol::formatStatusMessage(
        buf, sizeof(buf), TimerState::FINISHED, snap, 760000);

    TEST_ASSERT_GREATER_THAN(0, len);
    // Should start with $4 (FINISHED = 4)
    TEST_ASSERT_TRUE(strncmp(buf, "$4,", 3) == 0);
    // 3 commas for header + 4 commas for lanes = 7 total
    int commaCount = 0;
    for (size_t i = 0; i < len; i++) {
        if (buf[i] == ',') commaCount++;
    }
    TEST_ASSERT_EQUAL_INT(7, commaCount);
}

void test_format_null_buffer_returns_zero() {
    LaneTimesSnapshot snap = {};
    snap.laneCount = 4;
    TEST_ASSERT_EQUAL_INT(0,
        MessageProtocol::formatStatusMessage(nullptr, 256, TimerState::RESET, snap, 0));
}

void test_format_tiny_buffer_returns_zero() {
    LaneTimesSnapshot snap = {};
    snap.laneCount = 4;
    char buf[8];
    TEST_ASSERT_EQUAL_INT(0,
        MessageProtocol::formatStatusMessage(buf, sizeof(buf), TimerState::RESET, snap, 0));
}

void test_format_content_values() {
    LaneTimesSnapshot snap = {};
    snap.startTime = 100;
    snap.laneCount = 2;
    snap.laneTimes[0] = 200;
    snap.laneTimes[1] = 300;

    char buf[COMM_MAX_MSG_LEN];
    MessageProtocol::formatStatusMessage(
        buf, sizeof(buf), TimerState::FINISHED, snap, 350);

    // Expected: $4,100,350,2,200,300*
    TEST_ASSERT_EQUAL_STRING("$4,100,350,2,200,300*", buf);
}

// ===========================================================================
// MessageProtocol::parseCommand tests
// ===========================================================================

void test_parse_reset() {
    ParsedCommand cmd = MessageProtocol::parseCommand("RESET");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_RESET), static_cast<int>(cmd.type));
}

void test_parse_reset_with_whitespace() {
    ParsedCommand cmd = MessageProtocol::parseCommand("  RESET  ");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_RESET), static_cast<int>(cmd.type));
}

void test_parse_reset_case_insensitive() {
    ParsedCommand cmd = MessageProtocol::parseCommand("reset");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_RESET), static_cast<int>(cmd.type));
}

void test_parse_arm() {
    ParsedCommand cmd = MessageProtocol::parseCommand("ARM");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_ARM), static_cast<int>(cmd.type));
}

void test_parse_arm_case_insensitive() {
    ParsedCommand cmd = MessageProtocol::parseCommand("arm");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_ARM), static_cast<int>(cmd.type));
}

void test_parse_set_lanes_new_format() {
    ParsedCommand cmd = MessageProtocol::parseCommand("SET_LANES:6");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(6, cmd.param);
}

void test_parse_set_lanes_min() {
    ParsedCommand cmd = MessageProtocol::parseCommand("SET_LANES:1");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(1, cmd.param);
}

void test_parse_set_lanes_max() {
    ParsedCommand cmd = MessageProtocol::parseCommand("SET_LANES:8");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(8, cmd.param);
}

void test_parse_set_lanes_out_of_range_returns_none() {
    ParsedCommand cmd = MessageProtocol::parseCommand("SET_LANES:0");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::NONE), static_cast<int>(cmd.type));

    cmd = MessageProtocol::parseCommand("SET_LANES:9");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::NONE), static_cast<int>(cmd.type));
}

void test_parse_legacy_lanes_format() {
    ParsedCommand cmd = MessageProtocol::parseCommand("LANES,4*");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(4, cmd.param);
}

void test_parse_legacy_lanes_no_star() {
    ParsedCommand cmd = MessageProtocol::parseCommand("LANES,6");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(6, cmd.param);
}

void test_parse_unknown_returns_none() {
    ParsedCommand cmd = MessageProtocol::parseCommand("FOOBAR");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::NONE), static_cast<int>(cmd.type));
}

void test_parse_empty_returns_none() {
    ParsedCommand cmd = MessageProtocol::parseCommand("");
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::NONE), static_cast<int>(cmd.type));
}

void test_parse_null_returns_none() {
    ParsedCommand cmd = MessageProtocol::parseCommand(nullptr);
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::NONE), static_cast<int>(cmd.type));
}

// ===========================================================================
// Integration: MockComm + MessageProtocol round-trip
// ===========================================================================

void test_roundtrip_format_send_receive_parse() {
    MockComm comm;
    comm.init();

    // Format a status message
    LaneTimesSnapshot snap = {};
    snap.startTime = 1000;
    snap.laneCount = 4;
    snap.laneTimes[0] = 2000;
    snap.laneTimes[1] = 2100;
    snap.laneTimes[2] = 2050;
    snap.laneTimes[3] = 2200;

    char msgBuf[COMM_MAX_MSG_LEN];
    size_t len = MessageProtocol::formatStatusMessage(
        msgBuf, sizeof(msgBuf), TimerState::FINISHED, snap, 2300);
    TEST_ASSERT_GREATER_THAN(0, len);

    // Send it through the mock transport
    TEST_ASSERT_TRUE(comm.send(msgBuf));
    TEST_ASSERT_EQUAL_INT(1, comm.sentCount());

    // Read what was sent
    char outBuf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(comm.readSentMessage(outBuf, sizeof(outBuf)));
    TEST_ASSERT_EQUAL_STRING(msgBuf, outBuf);
}

void test_roundtrip_command_inject_receive_parse() {
    MockComm comm;
    comm.init();

    // Inject a SET_LANES command
    comm.injectMessage("SET_LANES:6");

    // Receive and parse it
    char buf[COMM_MAX_MSG_LEN];
    TEST_ASSERT_TRUE(comm.receive(buf, sizeof(buf)));

    ParsedCommand cmd = MessageProtocol::parseCommand(buf);
    TEST_ASSERT_EQUAL_INT(static_cast<int>(CommandType::CMD_SET_LANES), static_cast<int>(cmd.type));
    TEST_ASSERT_EQUAL_INT(6, cmd.param);
}

// ===========================================================================
// Test runner
// ===========================================================================

void setUp() {}
void tearDown() {}

int main(int argc, char** argv) {
    UNITY_BEGIN();

    // MockComm tests
    RUN_TEST(test_mock_comm_init_connects);
    RUN_TEST(test_mock_comm_send_receive);
    RUN_TEST(test_mock_comm_send_captures_outbox);
    RUN_TEST(test_mock_comm_send_fails_when_disconnected);
    RUN_TEST(test_mock_comm_receive_fails_when_disconnected);
    RUN_TEST(test_mock_comm_reconnect);
    RUN_TEST(test_mock_comm_reset_clears_all);
    RUN_TEST(test_mock_comm_null_args);

    // MessageQueue tests
    RUN_TEST(test_message_queue_fifo_order);
    RUN_TEST(test_message_queue_overflow_rejects);
    RUN_TEST(test_message_queue_empty_pop_returns_false);
    RUN_TEST(test_message_queue_clear);

    // formatStatusMessage tests
    RUN_TEST(test_format_reset_state);
    RUN_TEST(test_format_in_race_8_lanes);
    RUN_TEST(test_format_finished_4_lanes);
    RUN_TEST(test_format_null_buffer_returns_zero);
    RUN_TEST(test_format_tiny_buffer_returns_zero);
    RUN_TEST(test_format_content_values);

    // parseCommand tests
    RUN_TEST(test_parse_reset);
    RUN_TEST(test_parse_reset_with_whitespace);
    RUN_TEST(test_parse_reset_case_insensitive);
    RUN_TEST(test_parse_arm);
    RUN_TEST(test_parse_arm_case_insensitive);
    RUN_TEST(test_parse_set_lanes_new_format);
    RUN_TEST(test_parse_set_lanes_min);
    RUN_TEST(test_parse_set_lanes_max);
    RUN_TEST(test_parse_set_lanes_out_of_range_returns_none);
    RUN_TEST(test_parse_legacy_lanes_format);
    RUN_TEST(test_parse_legacy_lanes_no_star);
    RUN_TEST(test_parse_unknown_returns_none);
    RUN_TEST(test_parse_empty_returns_none);
    RUN_TEST(test_parse_null_returns_none);

    // Integration round-trip tests
    RUN_TEST(test_roundtrip_format_send_receive_parse);
    RUN_TEST(test_roundtrip_command_inject_receive_parse);

    return UNITY_END();
}
