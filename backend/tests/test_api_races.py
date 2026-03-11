from __future__ import annotations

import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

import httpx
from sqlalchemy import select

from app.main import app
from app.models.database import get_db_session, init_db, make_engine, make_sessionmaker
from app.models.models import RaceResult


class TestAPIRaces(unittest.IsolatedAsyncioTestCase):
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

    async def _create_racer(self, name: str, group_id: int | None = None) -> int:
        payload = {"name": name}
        if group_id is not None:
            payload["group_id"] = group_id
        resp = await self.client.post("/api/racers", json=payload)
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    async def _create_race(self, name: str, num_lanes: int) -> int:
        resp = await self.client.post("/api/races", json={"name": name, "num_lanes": num_lanes})
        self.assertEqual(resp.status_code, 201)
        return resp.json()["id"]

    async def test_races_crud(self) -> None:
        race_id = await self._create_race("Pack Finals", 4)

        resp = await self.client.get("/api/races")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([r["id"] for r in resp.json()], [race_id])

        resp = await self.client.get(f"/api/races/{race_id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Pack Finals")

        resp = await self.client.put(f"/api/races/{race_id}", json={"name": "Updated"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["name"], "Updated")

        resp = await self.client.delete(f"/api/races/{race_id}")
        self.assertEqual(resp.status_code, 204)

        resp = await self.client.get("/api/races")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    async def test_generate_heats_lane_rotation_n_ge_l(self) -> None:
        gid = await self._create_group("G1")
        racer_ids = [await self._create_racer(f"R{i}", gid) for i in range(1, 6)]  # 5
        race_id = await self._create_race("Race", 4)

        resp = await self.client.post(f"/api/races/{race_id}/generate-heats")
        self.assertEqual(resp.status_code, 201)
        heats = resp.json()
        self.assertEqual(len(heats), 5)

        counts: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        for h in heats:
            lanes = h["lanes"]
            self.assertEqual([ln["lane_number"] for ln in lanes], [1, 2, 3, 4])
            assigned = [ln["racer_id"] for ln in lanes if ln["racer_id"] is not None]
            self.assertEqual(len(assigned), len(set(assigned)))
            for ln in lanes:
                rid = ln["racer_id"]
                if rid is None:
                    continue
                counts[rid][ln["lane_number"]] += 1

        for rid in racer_ids:
            self.assertEqual(set(counts[rid].keys()), {1, 2, 3, 4})
            self.assertTrue(all(v == 1 for v in counts[rid].values()))

    async def test_generate_heats_with_byes_n_lt_l(self) -> None:
        gid = await self._create_group("G2")
        racer_ids = [await self._create_racer(f"R{i}", gid) for i in range(1, 4)]  # 3
        race_id = await self._create_race("Race", 4)

        resp = await self.client.post(f"/api/races/{race_id}/generate-heats")
        self.assertEqual(resp.status_code, 201)
        heats = resp.json()
        self.assertEqual(len(heats), 4)  # num_lanes heats when racers < lanes

        counts: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        for h in heats:
            lanes = h["lanes"]
            byes = [ln for ln in lanes if ln["racer_id"] is None]
            self.assertEqual(len(byes), 1)
            for ln in lanes:
                rid = ln["racer_id"]
                if rid is None:
                    continue
                counts[rid][ln["lane_number"]] += 1

        for rid in racer_ids:
            self.assertEqual(set(counts[rid].keys()), {1, 2, 3, 4})
            self.assertTrue(all(v == 1 for v in counts[rid].values()))

    async def test_heat_update_places_results_and_repeat(self) -> None:
        gid = await self._create_group("G3")
        racer_ids = [await self._create_racer(f"R{i}", gid) for i in range(1, 5)]
        race_id = await self._create_race("Race", 4)

        resp = await self.client.post(f"/api/races/{race_id}/generate-heats")
        self.assertEqual(resp.status_code, 201)
        heats = resp.json()
        heat = heats[0]
        heat_id = heat["id"]

        # Assign times such that lane 2 wins.
        lane_times = {1: 1200, 2: 900, 3: 1100, 4: 1300}
        upd = {
            "status": "completed",
            "lanes": [
                {"lane_number": ln, "time_microseconds": t} for ln, t in lane_times.items()
            ],
        }
        resp = await self.client.put(f"/api/heats/{heat_id}", json=upd)
        self.assertEqual(resp.status_code, 200)
        updated = resp.json()

        places = {ln["lane_number"]: ln["place"] for ln in updated["lanes"]}
        self.assertEqual(places[2], 1)
        self.assertEqual(places[1], 3)

        async with self.Session() as session:
            res = await session.execute(select(RaceResult).where(RaceResult.race_id == race_id))
            results = {rr.racer_id: rr for rr in res.scalars().all()}
            self.assertEqual(set(results.keys()), set(racer_ids))
            for rr in results.values():
                self.assertIsNotNone(rr.best_time)
                self.assertIsNotNone(rr.average_time)
                self.assertIsNotNone(rr.overall_place)

        resp = await self.client.post(f"/api/heats/{heat_id}/repeat")
        self.assertEqual(resp.status_code, 201)
        repeated = resp.json()
        self.assertGreater(repeated["heat_number"], heat["heat_number"])
        self.assertEqual(
            [ln["racer_id"] for ln in repeated["lanes"]],
            [ln["racer_id"] for ln in heat["lanes"]],
        )
        self.assertTrue(all(ln["time_microseconds"] is None for ln in repeated["lanes"]))
        self.assertTrue(all(ln["place"] is None for ln in repeated["lanes"]))

    async def test_export_race_results_pdf(self) -> None:
        gid = await self._create_group("Gpdf")
        racers = [await self._create_racer(f"R{i}", gid) for i in range(1, 5)]
        race_id = await self._create_race("Pack Finals", 4)

        resp = await self.client.post(f"/api/races/{race_id}/generate-heats")
        self.assertEqual(resp.status_code, 201)
        heat_id = resp.json()[0]["id"]

        upd = {
            "status": "completed",
            "lanes": [
                {"lane_number": 1, "time_microseconds": 2_000_000},
                {"lane_number": 2, "time_microseconds": 1_900_000},
                {"lane_number": 3, "time_microseconds": 2_100_000},
                {"lane_number": 4, "time_microseconds": 2_050_000},
            ],
        }
        resp = await self.client.put(f"/api/heats/{heat_id}", json=upd)
        self.assertEqual(resp.status_code, 200)

        resp = await self.client.get(f"/api/races/{race_id}/export/pdf")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.headers.get("content-type"), "application/pdf")
        self.assertTrue(resp.content.startswith(b"%PDF"))

        # Options
        resp = await self.client.get(
            f"/api/races/{race_id}/export/pdf?page_size=a4&orientation=portrait"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.content.startswith(b"%PDF"))

        # Group filter
        resp = await self.client.get(f"/api/races/{race_id}/export/pdf?group_id={gid}")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.content.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
