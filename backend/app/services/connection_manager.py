from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.services.event_bus import EventBus

from app.services.serial_connection import list_serial_ports
from app.services.timer_protocol import (
    TimerState,
    TimerStatus,
    extract_framed_messages,
    format_command_arm,
    format_command_reset,
    format_command_set_lanes,
    lane_durations_us,
    parse_status_message,
)


@dataclass
class ConnectionStatus:
    connection_state: str  # disconnected|connecting|connected
    mode: str | None  # serial|tcp
    target: str | None
    last_message_at: datetime | None = None
    last_error: str | None = None
    last_status: TimerStatus | None = None

    def to_dict(self) -> dict:
        return {
            "connection_state": self.connection_state,
            "mode": self.mode,
            "target": self.target,
            "last_message_at": self.last_message_at.isoformat() if self.last_message_at else None,
            "last_error": self.last_error,
            "last_status": {
                "state": self.last_status.state,
                "state_name": self.last_status.state_name,
                "start_time_us": self.last_status.start_time_us,
                "current_time_us": self.last_status.current_time_us,
                "num_lanes": self.last_status.num_lanes,
                # Convert raw firmware micros() timestamps to race-relative durations.
                "lane_end_times_us": lane_durations_us(self.last_status),
                "gate_set": self.last_status.gate_set,
            }
            if self.last_status
            else None,
        }


class ConnectionManager:
    """Manage a single active connection to the timer hardware."""

    def __init__(
        self,
        *,
        event_bus: "EventBus | None" = None,
        tcp_dialer=None,
        serial_opener=None,
        reconnect_backoff_seconds: float = 0.5,
        reconnect_backoff_max_seconds: float = 5.0,
    ) -> None:
        self._lock = asyncio.Lock()
        self._runner_task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

        self._event_bus = event_bus

        self._tcp_dialer = tcp_dialer
        self._serial_opener = serial_opener
        self._udp_opener = None

        self._buffer = b""
        self._writer = None

        self._config: dict | None = None
        self._auto_reconnect = True

        self._reconnect_backoff_seconds = reconnect_backoff_seconds
        self._reconnect_backoff_max_seconds = reconnect_backoff_max_seconds

        self._status = ConnectionStatus(connection_state="disconnected", mode=None, target=None)
        self._last_heat_complete_start_time_us: int | None = None
        self._serial_monitor_enabled = False

    async def shutdown(self) -> None:
        await self.disconnect()

    def get_status(self) -> ConnectionStatus:
        return self._status

    def list_serial_ports(self):
        return list_serial_ports()

    async def connect_tcp(
        self,
        *,
        host: str,
        port: int,
        auto_reconnect: bool = True,
    ) -> None:
        async with self._lock:
            await self._stop_runner_locked()
            self._auto_reconnect = auto_reconnect
            self._config = {"mode": "tcp", "host": host, "port": int(port)}
            self._status.connection_state = "connecting"
            self._status.mode = "tcp"
            self._status.target = f"{host}:{port}"
            self._status.last_error = None
            self._stop_event.clear()
            self._runner_task = asyncio.create_task(self._runner())

        await self._publish_connection_status()

    async def connect_udp(
        self,
        *,
        host: str = "192.168.4.1",
        cmd_port: int = 9100,
        status_port: int = 9101,
        auto_reconnect: bool = True,
    ) -> None:
        """Talk to the timer over UDP — listen for status broadcasts on
        ``status_port`` (0.0.0.0) and send commands to (``host``, ``cmd_port``).

        ``host`` defaults to the firmware's SoftAP IP so the operator only
        needs to join the ``PWDTimer`` access point — no other configuration.
        """
        async with self._lock:
            await self._stop_runner_locked()
            self._auto_reconnect = auto_reconnect
            self._config = {
                "mode": "udp",
                "host": host,
                "cmd_port": int(cmd_port),
                "status_port": int(status_port),
            }
            self._status.connection_state = "connecting"
            self._status.mode = "udp"
            self._status.target = f"{host}:{cmd_port}"
            self._status.last_error = None
            self._stop_event.clear()
            self._runner_task = asyncio.create_task(self._runner())

        await self._publish_connection_status()

    async def connect_serial(
        self,
        *,
        port: str,
        baudrate: int = 115200,
        auto_reconnect: bool = True,
    ) -> None:
        async with self._lock:
            await self._stop_runner_locked()
            self._auto_reconnect = auto_reconnect
            self._config = {"mode": "serial", "port": port, "baudrate": int(baudrate)}
            self._status.connection_state = "connecting"
            self._status.mode = "serial"
            self._status.target = port
            self._status.last_error = None
            self._stop_event.clear()
            self._runner_task = asyncio.create_task(self._runner())

        await self._publish_connection_status()

    async def disconnect(self) -> None:
        async with self._lock:
            await self._stop_runner_locked()
            self._status.connection_state = "disconnected"
            self._status.mode = None
            self._status.target = None

        await self._publish_connection_status()

    async def send_reset(self) -> None:
        await self._send(format_command_reset())

    async def send_arm(self) -> None:
        await self._send(format_command_arm())

    async def send_set_lanes(self, num_lanes: int) -> None:
        await self._send(format_command_set_lanes(num_lanes))

    async def wait_for_fresh_status(self, since: datetime | None, timeout: float = 1.5) -> None:
        """Block until a status frame newer than `since` is received, or timeout.

        Call this after sending a command so the HTTP response reflects the
        firmware's reaction rather than the stale pre-command status.
        The firmware broadcasts at 10 Hz during SET/IN_RACE and 1 Hz at idle,
        so 1.5 s covers the worst case with comfortable margin.
        """
        if since is None:
            await asyncio.sleep(0.15)
            return
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            last = self._status.last_message_at
            if last is not None and last > since:
                return
            await asyncio.sleep(0.05)  # poll at 20 Hz

    async def _send(self, payload: bytes) -> None:
        async with self._lock:
            writer = self._writer
            if writer is None:
                raise RuntimeError("not connected")
            writer.write(payload)
        if hasattr(writer, "drain"):
            await writer.drain()
        if self._serial_monitor_enabled:
            await self._publish("serial_data", {
                "direction": "tx",
                "data": payload.decode("utf-8", errors="replace"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

    async def _stop_runner_locked(self) -> None:
        self._stop_event.set()
        if self._runner_task is not None:
            self._runner_task.cancel()
            try:
                await self._runner_task
            except asyncio.CancelledError:
                pass
            finally:
                self._runner_task = None
        await self._close_writer()

    async def _close_writer(self) -> None:
        w = self._writer
        self._writer = None
        if w is None:
            return
        try:
            w.close()
        except Exception:
            return
        if hasattr(w, "wait_closed"):
            try:
                await w.wait_closed()
            except Exception:
                return

    async def _publish(self, event_type: str, payload: Any) -> None:
        bus = self._event_bus
        if bus is None:
            return
        await bus.publish(event_type, payload)

    async def _publish_connection_status(self) -> None:
        await self._publish("connection_status", self._status.to_dict())

    def _timer_status_payload(self, status: TimerStatus) -> dict:
        return {
            "state": status.state,
            "state_name": status.state_name,
            "start_time_us": status.start_time_us,
            "current_time_us": status.current_time_us,
            "num_lanes": status.num_lanes,
            "gate_set": status.gate_set,
        }

    def _lane_times_payload(self, status: TimerStatus) -> dict:
        # Convert raw firmware micros() timestamps to race-relative durations
        # so the UI/DB never see absolute boot timestamps.
        lane_end_times_us = lane_durations_us(status)
        finished = [(idx + 1, t) for idx, t in enumerate(lane_end_times_us) if t is not None and t > 0]
        finished.sort(key=lambda x: (x[1], x[0]))
        lane_places = {lane: place for place, (lane, _t) in enumerate(finished, start=1)}

        return {
            "num_lanes": status.num_lanes,
            "lane_end_times_us": lane_end_times_us,
            "lane_places": lane_places,
        }

    async def _handle_frame(self, frame: str) -> None:
        try:
            status = parse_status_message(frame)
        except Exception as e:
            self._status.last_error = f"parse_error: {e}"
            await self._publish_connection_status()
            return

        self._status.last_status = status
        self._status.last_message_at = datetime.now(timezone.utc)

        await self._publish("race_state", self._timer_status_payload(status))
        await self._publish("lane_times", self._lane_times_payload(status))

        if status.state == TimerState.FINISHED and status.start_time_us is not None:
            if self._last_heat_complete_start_time_us != status.start_time_us:
                self._last_heat_complete_start_time_us = status.start_time_us
                await self._publish(
                    "heat_complete",
                    {"start_time_us": status.start_time_us, **self._lane_times_payload(status)},
                )

    async def _runner(self) -> None:
        backoff = self._reconnect_backoff_seconds
        while not self._stop_event.is_set():
            cfg = self._config
            if not cfg:
                self._status.connection_state = "disconnected"
                self._status.mode = None
                self._status.target = None
                await self._publish_connection_status()
                return

            try:
                reader, writer = await self._connect_once(cfg)
                async with self._lock:
                    self._writer = writer
                self._status.connection_state = "connected"
                self._status.last_error = None
                backoff = self._reconnect_backoff_seconds

                await self._publish_connection_status()

                await self._read_loop(reader)
                raise ConnectionError("connection closed")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._status.connection_state = "disconnected"
                self._status.last_error = str(e)
                await self._close_writer()
                await self._publish_connection_status()

                if not self._auto_reconnect:
                    return

                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, self._reconnect_backoff_max_seconds)

    async def _connect_once(self, cfg: dict):
        mode = cfg.get("mode")
        if mode == "tcp":
            from app.services.tcp_connection import open_tcp_connection

            dialer = self._tcp_dialer or open_tcp_connection
            return await dialer(cfg["host"], int(cfg["port"]))
        if mode == "udp":
            from app.services.udp_connection import open_udp_connection

            opener = self._udp_opener or open_udp_connection
            return await opener(
                cfg["host"],
                cmd_port=int(cfg.get("cmd_port", 9100)),
                status_port=int(cfg.get("status_port", 9101)),
            )
        if mode == "serial":
            from app.services.serial_connection import open_serial_connection

            opener = self._serial_opener or open_serial_connection
            return await opener(cfg["port"], int(cfg.get("baudrate", 115200)))
        raise ValueError(f"unknown mode: {mode}")

    async def _read_loop(self, reader) -> None:
        self._buffer = b""
        while not self._stop_event.is_set():
            chunk = await reader.read(1024)
            if not chunk:
                return
            if self._serial_monitor_enabled:
                await self._publish("serial_data", {
                    "direction": "rx",
                    "data": chunk.decode("utf-8", errors="replace"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            frames, remaining = extract_framed_messages(self._buffer + chunk)
            self._buffer = remaining
            for frame in frames:
                await self._handle_frame(frame)
