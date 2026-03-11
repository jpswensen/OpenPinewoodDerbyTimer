"""Comprehensive tests for communication layer — ConnectionManager, EventBus, and protocol integration."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.connection_manager import ConnectionManager, ConnectionStatus
from app.services.event_bus import EventBus
from app.services.timer_protocol import TimerState


class TestConnectionStatus:
    def test_to_dict_disconnected(self):
        cs = ConnectionStatus(connection_state="disconnected", mode=None, target=None)
        d = cs.to_dict()
        assert d["connection_state"] == "disconnected"
        assert d["mode"] is None
        assert d["target"] is None
        assert d["last_status"] is None

    def test_to_dict_with_last_status(self):
        from app.services.timer_protocol import TimerStatus
        from datetime import datetime, timezone

        status = TimerStatus(
            state=TimerState.RESET, start_time_us=0, current_time_us=0,
            num_lanes=4, lane_end_times_us=[0, 0, 0, 0],
        )
        cs = ConnectionStatus(
            connection_state="connected", mode="tcp", target="192.168.4.1:8080",
            last_status=status, last_message_at=datetime.now(timezone.utc),
        )
        d = cs.to_dict()
        assert d["connection_state"] == "connected"
        assert d["last_status"]["state"] == 1
        assert d["last_status"]["state_name"] == "RESET"
        assert d["last_message_at"] is not None


class TestConnectionManager:
    async def test_initial_status(self):
        mgr = ConnectionManager()
        status = mgr.get_status()
        assert status.connection_state == "disconnected"
        assert status.mode is None

    async def test_connect_tcp_success(self):
        reader = AsyncMock()
        reader.read = AsyncMock(return_value=b"")

        writer = MagicMock()
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        async def mock_dialer(host, port):
            return reader, writer

        bus = EventBus()
        mgr = ConnectionManager(
            event_bus=bus, tcp_dialer=mock_dialer,
            reconnect_backoff_seconds=0.01, reconnect_backoff_max_seconds=0.02,
        )
        await mgr.connect_tcp(host="192.168.4.1", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.1)

        status = mgr.get_status()
        assert status.mode == "tcp"
        assert status.target == "192.168.4.1:8080"

        await mgr.shutdown()

    async def test_connect_tcp_failure_no_reconnect(self):
        call_count = 0

        async def failing_dialer(host, port):
            nonlocal call_count
            call_count += 1
            raise ConnectionError("refused")

        mgr = ConnectionManager(
            tcp_dialer=failing_dialer,
            reconnect_backoff_seconds=0.01,
        )
        await mgr.connect_tcp(host="bad", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.1)

        assert call_count == 1
        status = mgr.get_status()
        assert status.connection_state == "disconnected"
        assert "refused" in (status.last_error or "")
        await mgr.shutdown()

    async def test_auto_reconnect_retries(self):
        call_count = 0

        async def failing_dialer(host, port):
            nonlocal call_count
            call_count += 1
            raise ConnectionError("refused")

        mgr = ConnectionManager(
            tcp_dialer=failing_dialer,
            reconnect_backoff_seconds=0.01,
            reconnect_backoff_max_seconds=0.02,
        )
        await mgr.connect_tcp(host="bad", port=8080, auto_reconnect=True)
        await asyncio.sleep(0.15)
        await mgr.shutdown()

        assert call_count > 1  # Should have retried

    async def test_disconnect(self):
        reader = AsyncMock()
        reader.read = AsyncMock(return_value=b"")
        writer = MagicMock()
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        async def mock_dialer(host, port):
            return reader, writer

        mgr = ConnectionManager(tcp_dialer=mock_dialer)
        await mgr.connect_tcp(host="h", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.05)
        await mgr.disconnect()

        status = mgr.get_status()
        assert status.connection_state == "disconnected"
        assert status.mode is None

    async def test_send_when_not_connected(self):
        mgr = ConnectionManager()
        with pytest.raises(RuntimeError, match="not connected"):
            await mgr.send_reset()

    async def test_send_arm_command(self):
        writer = MagicMock()
        writer.write = MagicMock()
        writer.drain = AsyncMock()
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        reader = AsyncMock()
        reader.read = AsyncMock(side_effect=asyncio.CancelledError)

        async def mock_dialer(host, port):
            return reader, writer

        mgr = ConnectionManager(tcp_dialer=mock_dialer)
        await mgr.connect_tcp(host="h", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.05)

        await mgr.send_arm()
        writer.write.assert_called_with(b"ARM\n")

        await mgr.shutdown()

    async def test_frame_parsing_publishes_events(self):
        events = []

        bus = EventBus()
        original_publish = bus.publish

        async def capture_publish(event_type, payload):
            events.append((event_type, payload))

        bus.publish = capture_publish

        # Simulate reading a complete frame
        frame_data = b"$4,1000000,5000000,4,3500000,3600000,3700000,3800000*"

        reader = AsyncMock()
        read_calls = [frame_data, b""]
        reader.read = AsyncMock(side_effect=read_calls)

        writer = MagicMock()
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        async def mock_dialer(host, port):
            return reader, writer

        mgr = ConnectionManager(event_bus=bus, tcp_dialer=mock_dialer)
        await mgr.connect_tcp(host="h", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.2)
        await mgr.shutdown()

        event_types = [e[0] for e in events]
        assert "race_state" in event_types
        assert "lane_times" in event_types
        assert "heat_complete" in event_types

    async def test_heat_complete_deduplication(self):
        """heat_complete should only fire once per start_time_us."""
        events = []
        bus = EventBus()

        async def capture(et, payload):
            events.append((et, payload))

        bus.publish = capture

        frame = b"$4,1000000,5000000,4,3500000,3600000,3700000,3800000*"
        read_calls = [frame, frame, b""]
        reader = AsyncMock()
        reader.read = AsyncMock(side_effect=read_calls)

        writer = MagicMock()
        writer.close = MagicMock()
        writer.wait_closed = AsyncMock()

        async def mock_dialer(host, port):
            return reader, writer

        mgr = ConnectionManager(event_bus=bus, tcp_dialer=mock_dialer)
        await mgr.connect_tcp(host="h", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.2)
        await mgr.shutdown()

        heat_complete_events = [e for e in events if e[0] == "heat_complete"]
        assert len(heat_complete_events) == 1


class TestEventBus:
    async def test_register_and_publish(self):
        bus = EventBus()
        ws = AsyncMock()
        ws.application_state = MagicMock()
        from starlette.websockets import WebSocketState
        ws.application_state = WebSocketState.CONNECTED

        await bus.register(ws)
        await bus.publish("test_event", {"data": 123})

        ws.send_json.assert_called_once()
        msg = ws.send_json.call_args[0][0]
        assert msg["type"] == "test_event"
        assert msg["payload"]["data"] == 123

    async def test_unregister(self):
        bus = EventBus()
        ws = AsyncMock()
        ws.application_state = MagicMock()
        from starlette.websockets import WebSocketState
        ws.application_state = WebSocketState.CONNECTED

        await bus.register(ws)
        await bus.unregister(ws)
        await bus.publish("test_event", {})

        ws.send_json.assert_not_called()

    async def test_dead_client_removed(self):
        bus = EventBus()
        ws = AsyncMock()
        from starlette.websockets import WebSocketState
        ws.application_state = WebSocketState.DISCONNECTED

        await bus.register(ws)
        await bus.publish("test_event", {})

        # Dead client should be removed
        assert ws not in bus._clients

    async def test_exception_during_send_removes_client(self):
        bus = EventBus()
        ws = AsyncMock()
        from starlette.websockets import WebSocketState
        ws.application_state = WebSocketState.CONNECTED
        ws.send_json = AsyncMock(side_effect=Exception("broken"))

        await bus.register(ws)
        await bus.publish("test_event", {})

        assert ws not in bus._clients

    async def test_broadcast_to_multiple_clients(self):
        bus = EventBus()
        from starlette.websockets import WebSocketState

        clients = []
        for _ in range(3):
            ws = AsyncMock()
            ws.application_state = WebSocketState.CONNECTED
            await bus.register(ws)
            clients.append(ws)

        await bus.broadcast({"type": "test", "data": "hello"})

        for ws in clients:
            ws.send_json.assert_called_once()

    async def test_empty_bus_broadcast_noop(self):
        bus = EventBus()
        # Should not raise
        await bus.broadcast({"type": "test"})
        await bus.publish("test", {})
