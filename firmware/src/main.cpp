/// @file main.cpp
/// @brief PWDTimer firmware entry point — integrates HAL, communication,
///        NVS configuration, OTA updates, watchdog, and boot-mode selection.
///
/// Architecture:
///   Core 1  — TimingTask:  HAL updateState() at high rate (ISRs also on core 1)
///   Core 0  — CommTask:    command parsing, status broadcasts, TCP polling, OTA
///
/// A FreeRTOS queue carries parsed commands from the comm task to the timing
/// task so that all HAL mutations are serialised on one core.

#ifdef ARDUINO

#include <Arduino.h>
#include <esp_task_wdt.h>

#include "hal/esp32_hal.h"
#include "comm/serial_comm.h"
#include "comm/tcp_comm.h"
#include "comm/message_protocol.h"
#include "config/nvs_config.h"

// ArduinoOTA for over-the-air firmware updates.
#include <ArduinoOTA.h>

// ── Constants ───────────────────────────────────────────────────────────────

static constexpr uint32_t TIMING_TASK_PERIOD_MS    = 5;    // 200 Hz
static constexpr uint32_t COMM_TASK_PERIOD_MS      = 10;   // 100 Hz
static constexpr uint32_t RACE_STATUS_INTERVAL_MS  = 100;  // 10 Hz during race / SET
static constexpr uint32_t IDLE_STATUS_INTERVAL_MS  = 1000; // 1 Hz when idle
static constexpr int      CMD_QUEUE_LENGTH         = 16;
static constexpr uint32_t WDT_TIMEOUT_S            = 10;
static constexpr uint32_t BOOT_MODE_HOLD_MS        = 2000; // Hold GPIO21 for 2 s to enter config mode
static constexpr int      TIMING_TASK_STACK        = 4096;
static constexpr int      COMM_TASK_STACK          = 8192;

// ── Globals ─────────────────────────────────────────────────────────────────

static ESP32TimerHAL  g_hal;
static SerialComm     g_serial(Serial, 115200);
static TcpComm*       g_tcp       = nullptr;
static FirmwareConfig g_config;

/// Queue carrying ParsedCommand structs from comm → timing task.
static QueueHandle_t  g_cmdQueue  = nullptr;

static volatile bool  g_configMode = false; ///< True when GPIO21 held during boot.

// ── Forward declarations ────────────────────────────────────────────────────

static void timingTask(void* param);
static void commTask(void* param);
static bool checkBootMode();
static void setupOTA();
static uint32_t statusIntervalMs();

// ═════════════════════════════════════════════════════════════════════════════
// setup() / loop()
// ═════════════════════════════════════════════════════════════════════════════

void setup() {
    Serial.begin(115200);
    delay(200);  // Let UART settle.
    Serial.println();
    Serial.println("╔═══════════════════════════════════╗");
    Serial.println("║     PWDTimer Firmware v2.0.0      ║");
    Serial.println("╚═══════════════════════════════════╝");

    // ── NVS configuration ────────────────────────────────────────────────
    NVSConfig::init();
    NVSConfig::load(g_config);
    Serial.printf("[NVS] SSID=%s  lanes=%d  OTA=%s\n",
                  g_config.wifiSSID, g_config.laneCount,
                  g_config.otaEnabled ? "on" : "off");

    // ── Boot-mode selection (GPIO21 held LOW → configuration mode) ───────
    g_configMode = checkBootMode();
    if (g_configMode) {
        Serial.println("[BOOT] Configuration mode — defaults restored, waiting for release...");
        g_config.setDefaults();
        NVSConfig::save(g_config);
        // Blink LED rapidly until pin released.
        pinMode(2, OUTPUT);
        while (digitalRead(WIFI_MODE_PIN) == LOW) {
            digitalWrite(2, !digitalRead(2));
            delay(150);
        }
        Serial.println("[BOOT] Released — continuing with defaults.");
    }

    // ── Initialise HAL ───────────────────────────────────────────────────
    g_hal.init();
    g_hal.setLaneCount(g_config.laneCount);
    Serial.printf("[HAL]  Initialised — %d lanes\n", g_hal.getLaneCount());

    // ── Initialise communication transports ─────────────────────────────
    g_serial.init();
    Serial.println("[COMM] Serial ready (115200 baud)");

    g_tcp = new TcpComm(g_config.wifiSSID, g_config.wifiPassword, 8080, 2);
    g_tcp->init();
    Serial.printf("[COMM] WiFi AP '%s' — TCP on %s:8080\n",
                  g_config.wifiSSID,
                  g_tcp->isWiFiReady() ? g_tcp->getAPIP().toString().c_str() : "N/A");

    // ── OTA ──────────────────────────────────────────────────────────────
    if (g_config.otaEnabled) {
        setupOTA();
        Serial.println("[OTA]  ArduinoOTA ready");
    }

    // ── Command queue (comm → timing) ───────────────────────────────────
    g_cmdQueue = xQueueCreate(CMD_QUEUE_LENGTH, sizeof(ParsedCommand));
    if (!g_cmdQueue) {
        Serial.println("[ERR]  Failed to create command queue!");
    }

    // ── Watchdog timer ──────────────────────────────────────────────────
    esp_task_wdt_init(WDT_TIMEOUT_S, true);  // true = panic on timeout
    Serial.printf("[WDT]  Watchdog %d s\n", WDT_TIMEOUT_S);

    // ── FreeRTOS tasks ──────────────────────────────────────────────────
    xTaskCreatePinnedToCore(
        timingTask,
        "timingTask",
        TIMING_TASK_STACK,
        nullptr,
        configMAX_PRIORITIES - 2,   // High but below HAL gateTask
        nullptr,
        1                           // Core 1
    );

    xTaskCreatePinnedToCore(
        commTask,
        "commTask",
        COMM_TASK_STACK,
        nullptr,
        2,                          // Moderate priority
        nullptr,
        0                           // Core 0
    );

    Serial.println("[BOOT] All tasks started — ready.");
}

void loop() {
    // All work is in FreeRTOS tasks; loop() just yields.
    vTaskDelay(pdMS_TO_TICKS(1000));
}

// ═════════════════════════════════════════════════════════════════════════════
// TimingTask — Core 1
// ═════════════════════════════════════════════════════════════════════════════

static void timingTask(void* /*param*/) {
    esp_task_wdt_add(nullptr);  // Register this task with the watchdog.

    for (;;) {
        // 1. Dequeue and execute any pending commands.
        ParsedCommand cmd;
        while (xQueueReceive(g_cmdQueue, &cmd, 0) == pdTRUE) {
            switch (cmd.type) {
                case CommandType::CMD_RESET:
                    g_hal.reset();
                    break;
                case CommandType::CMD_ARM:
                    g_hal.arm();
                    break;
                case CommandType::CMD_SET_LANES:
                    g_hal.setLaneCount(cmd.param);
                    // Persist lane count change.
                    g_config.laneCount = static_cast<uint8_t>(g_hal.getLaneCount());
                    NVSConfig::save(g_config);
                    break;
                default:
                    break;
            }
        }

        // 2. Update HAL state machine (auto-arm, FINISHED detection).
        g_hal.updateState();

        // 3. Feed the watchdog.
        esp_task_wdt_reset();

        vTaskDelay(pdMS_TO_TICKS(TIMING_TASK_PERIOD_MS));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// CommTask — Core 0
// ═════════════════════════════════════════════════════════════════════════════

static void commTask(void* /*param*/) {
    esp_task_wdt_add(nullptr);

    uint32_t lastStatusMs = 0;

    for (;;) {
        uint32_t nowMs = millis();

        // ── 1. Poll TCP for new connections ──────────────────────────────
        if (g_tcp) {
            g_tcp->poll();
        }

        // ── 2. Receive commands from all transports ──────────────────────
        char rxBuf[COMM_MAX_MSG_LEN];

        // Serial
        while (g_serial.receive(rxBuf, sizeof(rxBuf))) {
            ParsedCommand cmd = MessageProtocol::parseCommand(rxBuf);
            if (cmd.type != CommandType::NONE) {
                xQueueSend(g_cmdQueue, &cmd, pdMS_TO_TICKS(10));
            }
        }

        // TCP
        if (g_tcp && g_tcp->isConnected()) {
            while (g_tcp->receive(rxBuf, sizeof(rxBuf))) {
                ParsedCommand cmd = MessageProtocol::parseCommand(rxBuf);
                if (cmd.type != CommandType::NONE) {
                    xQueueSend(g_cmdQueue, &cmd, pdMS_TO_TICKS(10));
                }
            }
        }

        // ── 3. Broadcast status at the appropriate rate ──────────────────
        uint32_t interval = statusIntervalMs();
        if ((nowMs - lastStatusMs) >= interval) {
            LaneTimesSnapshot snap = g_hal.getLaneTimes();
            uint32_t nowUs = micros();

            char txBuf[COMM_MAX_MSG_LEN];
            size_t len = MessageProtocol::formatStatusMessage(
                txBuf, sizeof(txBuf), g_hal.getState(), snap, nowUs);

            if (len > 0) {
                if (g_serial.isConnected()) {
                    g_serial.send(txBuf);
                }
                if (g_tcp && g_tcp->isConnected()) {
                    g_tcp->send(txBuf);
                }
            }

            lastStatusMs = nowMs;
        }

        // ── 4. OTA handling ──────────────────────────────────────────────
        if (g_config.otaEnabled) {
            ArduinoOTA.handle();
        }

        // ── 5. Feed watchdog ─────────────────────────────────────────────
        esp_task_wdt_reset();

        vTaskDelay(pdMS_TO_TICKS(COMM_TASK_PERIOD_MS));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

/// Check if GPIO21 (WIFI_MODE_PIN) is held LOW during boot.
static bool checkBootMode() {
    pinMode(WIFI_MODE_PIN, INPUT_PULLUP);
    delay(50);  // Debounce.
    if (digitalRead(WIFI_MODE_PIN) == HIGH) return false;

    // Pin is LOW — wait up to BOOT_MODE_HOLD_MS to confirm intentional hold.
    uint32_t start = millis();
    while ((millis() - start) < BOOT_MODE_HOLD_MS) {
        if (digitalRead(WIFI_MODE_PIN) == HIGH) return false;  // Released too early.
        delay(50);
    }
    return true;  // Held long enough.
}

/// @return Status update interval based on current timer state.
static uint32_t statusIntervalMs() {
    TimerState st = g_hal.getState();
    if (st == TimerState::IN_RACE || st == TimerState::SET) {
        return RACE_STATUS_INTERVAL_MS;
    }
    return IDLE_STATUS_INTERVAL_MS;
}

/// Configure ArduinoOTA with hostname and progress logging.
static void setupOTA() {
    ArduinoOTA.setHostname("pwdtimer");

    ArduinoOTA.onStart([]() {
        String type = (ArduinoOTA.getCommand() == U_FLASH)
                          ? "firmware"
                          : "filesystem";
        Serial.printf("[OTA]  Start updating %s\n", type.c_str());
    });

    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA]  Update complete — rebooting");
    });

    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA]  %u%%\r", (progress * 100) / total);
    });

    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA]  Error[%u]: ", error);
        switch (error) {
            case OTA_AUTH_ERROR:    Serial.println("Auth failed");    break;
            case OTA_BEGIN_ERROR:   Serial.println("Begin failed");   break;
            case OTA_CONNECT_ERROR: Serial.println("Connect failed"); break;
            case OTA_RECEIVE_ERROR: Serial.println("Receive failed"); break;
            case OTA_END_ERROR:     Serial.println("End failed");     break;
        }
    });

    ArduinoOTA.begin();
}

#endif // ARDUINO
