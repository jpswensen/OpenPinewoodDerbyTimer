"""Comprehensive tests for WebSocket endpoint."""

from __future__ import annotations

import json
import os
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.connection_manager import ConnectionManager, ConnectionStatus
from app.services.event_bus import event_bus
from app.services.timer_protocol import TimerState, TimerStatus


class TestWebSocketBasic:
    def test_connect_and_ping_text(self):
        """WebSocket should respond with 'pong' to text 'ping'."""
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                # Consume initial connection_status message
                msg = ws.receive_json()
                assert msg["type"] == "connection_status"

                ws.send_text("ping")
                data = ws.receive_text()
                assert data == "pong"

    def test_connect_and_ping_json(self):
        """WebSocket should respond with pong JSON to ping JSON."""
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                msg = ws.receive_json()
                assert msg["type"] == "connection_status"

                ws.send_json({"type": "ping"})
                data = ws.receive_json()
                assert data["type"] == "pong"

    def test_invalid_json_ignored(self):
        """Invalid JSON should be silently ignored."""
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                ws.receive_json()  # consume initial status

                ws.send_text("not json at all")
                # Send a valid ping to confirm connection still works
                ws.send_text("ping")
                data = ws.receive_text()
                assert data == "pong"


class TestWebSocketAuth:
    def test_token_auth_required_reject(self):
        """With PWD_TIMER_WS_TOKEN set, reject connections without valid token."""
        os.environ["PWD_TIMER_WS_TOKEN"] = "secret123"
        try:
            with TestClient(app) as tc:
                with pytest.raises(Exception):
                    with tc.websocket_connect("/ws") as ws:
                        ws.receive_text()
        finally:
            del os.environ["PWD_TIMER_WS_TOKEN"]

    def test_token_auth_accept(self):
        """With correct token, connection should succeed."""
        os.environ["PWD_TIMER_WS_TOKEN"] = "secret123"
        try:
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws?token=secret123") as ws:
                    msg = ws.receive_json()  # consume initial status
                    assert msg["type"] == "connection_status"

                    ws.send_text("ping")
                    data = ws.receive_text()
                    assert data == "pong"
        finally:
            del os.environ["PWD_TIMER_WS_TOKEN"]

    def test_no_token_required_by_default(self):
        """Without PWD_TIMER_WS_TOKEN env, all connections allowed."""
        os.environ.pop("PWD_TIMER_WS_TOKEN", None)
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                ws.receive_json()  # consume initial status
                ws.send_text("ping")
                data = ws.receive_text()
                assert data == "pong"


class TestWebSocketInitialState:
    def test_receives_connection_status_on_connect(self):
        """Newly connected client should receive initial connection status."""
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                msg = ws.receive_json()
                assert msg["type"] == "connection_status"
                assert "connection_state" in msg["payload"]


class TestWebSocketEventBroadcast:
    def test_broadcast_reaches_client(self):
        """Events published to event_bus should reach WebSocket clients."""
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws") as ws:
                # Consume initial connection_status
                ws.receive_json()

                # Broadcast a race_state event via the event bus
                import asyncio

                async def publish():
                    await event_bus.publish("race_state", {"state": 3, "state_name": "IN_RACE"})

                loop = asyncio.new_event_loop()
                loop.run_until_complete(publish())
                loop.close()

                msg = ws.receive_json()
                assert msg["type"] == "race_state"
                assert msg["payload"]["state"] == 3
