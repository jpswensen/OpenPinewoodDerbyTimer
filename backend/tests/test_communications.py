from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx

from app.main import app
from app.models.database import get_db_session, init_db, make_engine, make_sessionmaker
from app.services.connection_manager import ConnectionManager
from app.services.timer_protocol import (
    TimerState,
    extract_framed_messages,
    format_command_set_lanes,
    parse_status_message,
)


class TestTimerProtocol(unittest.TestCase):
    def test_extract_framed_messages_handles_partial(self) -> None:
        frames, rem = extract_framed_messages(b"noise$1,2*")
        self.assertEqual(frames, ["$1,2*"])
        self.assertEqual(rem, b"")

        frames, rem = extract_framed_messages(b"$1,2")
        self.assertEqual(frames, [])
        self.assertEqual(rem, b"$1,2")

        frames2, rem2 = extract_framed_messages(rem + b"*$3,4*")
        self.assertEqual(frames2, ["$1,2*", "$3,4*"])
        self.assertEqual(rem2, b"")

    def test_parse_status_message_ok(self) -> None:
        msg = "$3,10,20,4,100,200,300,400*"
        st = parse_status_message(msg)
        self.assertEqual(st.state, TimerState.IN_RACE)
        self.assertEqual(st.start_time_us, 10)
        self.assertEqual(st.current_time_us, 20)
        self.assertEqual(st.num_lanes, 4)
        self.assertEqual(st.lane_end_times_us, [100, 200, 300, 400])

    def test_parse_pads_missing_lane_times(self) -> None:
        msg = "$4,10,20,4,111*"
        st = parse_status_message(msg)
        self.assertEqual(st.lane_end_times_us, [111, None, None, None])

    def test_format_command_set_lanes_validation(self) -> None:
        self.assertEqual(format_command_set_lanes(4), b"SET_LANES:4\n")
        with self.assertRaises(ValueError):
            format_command_set_lanes(0)


class TestConnectionManager(unittest.IsolatedAsyncioTestCase):
    async def test_auto_reconnect_attempts_multiple_dials(self) -> None:
        dial_calls: list[int] = []

        async def fake_dial(host: str, port: int, timeout_seconds: float = 3.0):
            dial_calls.append(1)
            if len(dial_calls) == 1:
                raise OSError("boom")

            reader = asyncio.StreamReader()

            async def _feed():
                reader.feed_data(b"$1,0,0,1,0*")
                reader.feed_eof()

            asyncio.get_running_loop().call_soon(asyncio.create_task, _feed())

            class _Writer:
                def write(self, data: bytes) -> None:
                    return

                async def drain(self) -> None:
                    return

                def close(self) -> None:
                    return

                async def wait_closed(self) -> None:
                    return

            return reader, _Writer()

        mgr = ConnectionManager(tcp_dialer=fake_dial, reconnect_backoff_seconds=0.01, reconnect_backoff_max_seconds=0.02)
        await mgr.connect_tcp(host="127.0.0.1", port=8080, auto_reconnect=True)

        # Give the runner a moment to attempt a reconnect.
        await asyncio.sleep(0.06)

        self.assertGreaterEqual(len(dial_calls), 2)
        self.assertIsNotNone(mgr.get_status().last_status)

        await mgr.disconnect()

    async def test_wait_for_fresh_status_returns_after_new_frame(self) -> None:
        """wait_for_fresh_status must unblock as soon as last_message_at advances."""
        reader = asyncio.StreamReader()
        sent: list[bytes] = []

        class _Writer:
            def write(self, data: bytes) -> None:
                sent.append(data)
            async def drain(self) -> None: return
            def close(self) -> None: return
            async def wait_closed(self) -> None: return

        async def fake_dial(host, port, **_):
            # Feed one frame so connection_state becomes connected.
            reader.feed_data(b"$1,-1,1000,4,0,0,0,0,0,0,0,0*")
            return reader, _Writer()

        mgr = ConnectionManager(tcp_dialer=fake_dial, reconnect_backoff_seconds=0.01)
        await mgr.connect_tcp(host="127.0.0.1", port=8080, auto_reconnect=False)
        await asyncio.sleep(0.05)  # let runner process the first frame

        since = mgr.get_status().last_message_at
        self.assertIsNotNone(since)

        # Schedule a new frame 80 ms from now.
        async def _feed_later():
            await asyncio.sleep(0.08)
            reader.feed_data(b"$1,-1,2000,4,0,0,0,0,0,0,0,0*")

        asyncio.create_task(_feed_later())

        start = asyncio.get_event_loop().time()
        await mgr.wait_for_fresh_status(since, timeout=1.0)
        elapsed = asyncio.get_event_loop().time() - start

        # Should have waited ~80 ms, not the full timeout.
        self.assertGreater(elapsed, 0.05)
        self.assertLess(elapsed, 0.5)
        # last_message_at must have advanced.
        self.assertGreater(mgr.get_status().last_message_at, since)

        await mgr.disconnect()

    async def test_wait_for_fresh_status_times_out_gracefully(self) -> None:
        """wait_for_fresh_status must return (not raise) after timeout with no new frame."""
        mgr = ConnectionManager(reconnect_backoff_seconds=0.01)
        # Not connected, no frames — last_message_at is None after we fake it.
        from datetime import datetime, timezone
        fake_since = datetime.now(timezone.utc)

        start = asyncio.get_event_loop().time()
        await mgr.wait_for_fresh_status(fake_since, timeout=0.15)
        elapsed = asyncio.get_event_loop().time() - start

        self.assertGreaterEqual(elapsed, 0.14)  # waited out the timeout
        self.assertLess(elapsed, 0.5)           # didn't hang

    async def test_connect_applies_desired_lane_count_when_writer_is_ready(self) -> None:
        """Connect-time lane setup must not race ahead of the async runner."""
        reader = asyncio.StreamReader()
        sent: list[bytes] = []

        class _Writer:
            def write(self, data: bytes) -> None:
                sent.append(data)

            async def drain(self) -> None:
                return

            def close(self) -> None:
                return

            async def wait_closed(self) -> None:
                return

        async def fake_dial(host, port, **_):
            reader.feed_data(b"$1,-1,1000,8,0,0,0,0,0,0,0,0*")
            return reader, _Writer()

        mgr = ConnectionManager(tcp_dialer=fake_dial, reconnect_backoff_seconds=0.01)
        await mgr.connect_tcp(host="127.0.0.1", port=8080, num_lanes=4, auto_reconnect=False)
        await asyncio.sleep(0.05)

        self.assertIn(b"SET_LANES:4\n", sent)

        await mgr.disconnect()


class TestConnectionAPI(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(self._tmpdir.name) / "test.db"
        self.engine = make_engine(f"sqlite+aiosqlite:///{db_path}")
        await init_db(self.engine)
        self.Session = make_sessionmaker(self.engine)

        async def _override_db_session():
            async with self.Session() as session:
                yield session

        app.dependency_overrides[get_db_session] = _override_db_session
        app.state.connection_manager = ConnectionManager(reconnect_backoff_seconds=0.01, reconnect_backoff_max_seconds=0.02)

        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()
        app.dependency_overrides.clear()
        if getattr(app.state, "connection_manager", None):
            await app.state.connection_manager.shutdown()
        self._tmpdir.cleanup()

    async def test_status_and_validation(self) -> None:
        resp = await self.client.get("/api/connection/status")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["connection_state"], "disconnected")

        resp = await self.client.post("/api/connection/connect", json={"mode": "serial"})
        self.assertEqual(resp.status_code, 400)

        resp = await self.client.post("/api/connection/connect", json={"mode": "tcp"})
        self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
