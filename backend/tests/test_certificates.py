from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import httpx

from app.main import app
from app.models.database import get_db_session, init_db, make_engine, make_sessionmaker


class TestAPICertificates(unittest.IsolatedAsyncioTestCase):
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

        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        )

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        await self.engine.dispose()
        app.dependency_overrides.clear()
        self._tmpdir.cleanup()

    async def _create_group(self, name: str) -> int:
        resp = await self.client.post("/api/groups", json={"name": name})
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    async def _create_racer(self, name: str, group_id: int) -> int:
        resp = await self.client.post(
            "/api/racers",
            json={"name": name, "group_id": group_id, "car_name": "Speed", "car_number": "1"},
        )
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    async def _create_race(self, name: str, num_lanes: int) -> int:
        resp = await self.client.post("/api/races", json={"name": name, "num_lanes": num_lanes})
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    async def test_preview_endpoint_returns_pdf(self) -> None:
        resp = await self.client.get("/api/certificates/preview?type=winner&place=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("content-type"), "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF"))

    async def test_generate_winner_and_participation_pdfs(self) -> None:
        g1 = await self._create_group("Tigers")
        g2 = await self._create_group("Wolves")

        # 4 racers, 2 groups
        for name, gid in [("A", g1), ("B", g1), ("C", g2), ("D", g2)]:
            await self._create_racer(name, gid)

        race_id = await self._create_race("Pack Finals", 4)
        resp = await self.client.post(f"/api/races/{race_id}/generate-heats")
        self.assertEqual(resp.status_code, 201)
        heat_id = resp.json()[0]["id"]

        # Complete first heat with times for all lanes to establish results.
        resp = await self.client.put(
            f"/api/heats/{heat_id}",
            json={
                "status": "completed",
                "lanes": [
                    {"lane_number": 1, "time_microseconds": 2_000_000},
                    {"lane_number": 2, "time_microseconds": 1_900_000},
                    {"lane_number": 3, "time_microseconds": 2_100_000},
                    {"lane_number": 4, "time_microseconds": 2_050_000},
                ],
            },
        )
        self.assertEqual(resp.status_code, 200)

        # Winners (overall + per-group)
        resp = await self.client.post(
            "/api/certificates/generate",
            json={
                "race_id": race_id,
                "mode": "winners",
                "places": [1, 2, 3],
                "include_overall": True,
                "include_per_group": True,
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("content-type"), "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF"))

        # Participants
        resp = await self.client.post(
            "/api/certificates/generate",
            json={
                "race_id": race_id,
                "mode": "participants",
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("content-type"), "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
