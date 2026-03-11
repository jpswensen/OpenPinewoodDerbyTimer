import unittest

from fastapi.testclient import TestClient

from app.main import app


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
