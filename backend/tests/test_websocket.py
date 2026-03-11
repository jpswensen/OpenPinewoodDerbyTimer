import os
import unittest

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.services.timer_protocol import TimerState


class TestWebSocket(unittest.TestCase):
    def test_ws_connect_and_ping(self) -> None:
        with TestClient(app) as client:
            with client.websocket_connect("/ws") as ws:
                msg = ws.receive_json()
                self.assertEqual(msg["type"], "connection_status")

                ws.send_text("ping")
                self.assertEqual(ws.receive_text(), "pong")

                ws.send_json({"type": "ping"})
                msg = ws.receive_json()
                self.assertEqual(msg["type"], "pong")

    def test_ws_broadcasts_timer_events(self) -> None:
        with TestClient(app) as client:
            with client.websocket_connect("/ws") as ws:
                msg = ws.receive_json()
                self.assertEqual(msg["type"], "connection_status")

                mgr = app.state.connection_manager
                frame = f"${int(TimerState.FINISHED)},100,200,2,2000,1500*"
                # TestClient runs the ASGI app in a background thread with an AnyIO portal.
                client.portal.call(mgr._handle_frame, frame)

                msg = ws.receive_json()
                self.assertEqual(msg["type"], "race_state")

                msg = ws.receive_json()
                self.assertEqual(msg["type"], "lane_times")
                self.assertEqual(msg["payload"]["lane_end_times_us"], [2000, 1500])
                self.assertEqual(msg["payload"]["lane_places"], {"2": 1, "1": 2})

                msg = ws.receive_json()
                self.assertEqual(msg["type"], "heat_complete")
                self.assertEqual(msg["payload"]["start_time_us"], 100)

    def test_ws_token_auth(self) -> None:
        os.environ["PWD_TIMER_WS_TOKEN"] = "secret"
        try:
            with TestClient(app) as client:
                with self.assertRaises(WebSocketDisconnect):
                    with client.websocket_connect("/ws"):
                        pass

                with client.websocket_connect("/ws?token=secret") as ws:
                    msg = ws.receive_json()
                    self.assertEqual(msg["type"], "connection_status")
        finally:
            os.environ.pop("PWD_TIMER_WS_TOKEN", None)
