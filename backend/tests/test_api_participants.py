from __future__ import annotations

import csv
import io
import tempfile
import unittest
from pathlib import Path

import httpx

from app.main import app
from app.models.database import get_db_session, init_db, make_engine, make_sessionmaker


class TestAPIParticipants(unittest.IsolatedAsyncioTestCase):
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

    async def test_groups_crud(self) -> None:
        resp = await self.client.post(
            "/api/groups", json={"name": "Tigers", "description": "Pack"}
        )
        self.assertEqual(resp.status_code, 201)
        group = resp.json()
        self.assertEqual(group["name"], "Tigers")
        gid = group["id"]

        resp = await self.client.get("/api/groups")
        self.assertEqual(resp.status_code, 200)
        groups = resp.json()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["id"], gid)

        resp = await self.client.put(f"/api/groups/{gid}", json={"description": "Updated"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["description"], "Updated")

        resp = await self.client.delete(f"/api/groups/{gid}")
        self.assertEqual(resp.status_code, 204)

        resp = await self.client.get("/api/groups")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), [])

    async def test_group_delete_keeps_racers(self) -> None:
        resp = await self.client.post("/api/groups", json={"name": "Wolves"})
        gid = resp.json()["id"]

        resp = await self.client.post(
            "/api/racers",
            json={"name": "Alice", "car_name": "Lightning", "group_id": gid},
        )
        self.assertEqual(resp.status_code, 201)
        rid = resp.json()["id"]

        resp = await self.client.delete(f"/api/groups/{gid}")
        self.assertEqual(resp.status_code, 204)

        resp = await self.client.get("/api/racers")
        self.assertEqual(resp.status_code, 200)
        racers = resp.json()
        self.assertEqual(len(racers), 1)
        self.assertEqual(racers[0]["id"], rid)
        self.assertIsNone(racers[0]["group_id"])

    async def test_racers_crud_filtering_and_validation(self) -> None:
        g1 = (await self.client.post("/api/groups", json={"name": "G1"})).json()["id"]
        g2 = (await self.client.post("/api/groups", json={"name": "G2"})).json()["id"]

        resp = await self.client.post(
            "/api/racers",
            json={"name": "Bob", "car_number": "7", "group_id": g1},
        )
        self.assertEqual(resp.status_code, 201)
        r1 = resp.json()

        resp = await self.client.post(
            "/api/racers",
            json={"name": "Cara", "car_number": "8", "group_id": g2},
        )
        self.assertEqual(resp.status_code, 201)
        r2 = resp.json()

        resp = await self.client.get(f"/api/racers?group_id={g1}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([r["id"] for r in resp.json()], [r1["id"]])

        resp = await self.client.put(
            f"/api/racers/{r1['id']}",
            json={"car_name": "Speedster", "group_id": g2},
        )
        self.assertEqual(resp.status_code, 200)
        updated = resp.json()
        self.assertEqual(updated["car_name"], "Speedster")
        self.assertEqual(updated["group_id"], g2)

        resp = await self.client.delete(f"/api/racers/{r2['id']}")
        self.assertEqual(resp.status_code, 204)

        resp = await self.client.post("/api/racers", json={"name": "X", "group_id": 99999})
        self.assertEqual(resp.status_code, 400)

    async def test_bulk_create_racers(self) -> None:
        gid = (await self.client.post("/api/groups", json={"name": "Pack"})).json()["id"]

        resp = await self.client.post(
            "/api/racers/bulk",
            json=[
                {"name": "A", "group_id": gid},
                {"name": "B", "group_id": gid, "car_number": "12"},
            ],
        )
        self.assertEqual(resp.status_code, 201)
        racers = resp.json()
        self.assertEqual(len(racers), 2)

        resp = await self.client.post(
            "/api/racers/bulk",
            json=[{"name": "C", "group_id": 123456}],
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Unknown group_ids", resp.json()["detail"])

    async def test_csv_export_and_import(self) -> None:
        gid = (await self.client.post("/api/groups", json={"name": "Bears"})).json()["id"]
        await self.client.post(
            "/api/racers",
            json={"name": "Drew", "car_name": "Rocket", "car_number": "1", "group_id": gid},
        )

        resp = await self.client.get("/api/export/csv")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/csv", resp.headers.get("content-type", ""))

        rows = list(csv.DictReader(io.StringIO(resp.text)))
        self.assertEqual(rows[0]["name"], "Drew")
        self.assertEqual(rows[0]["group"], "Bears")

        csv_in = "name,car_name,car_number,group\nEve,Flash,2,Lions\nFrank,,,\n"
        resp = await self.client.post(
            "/api/import/csv",
            files={"file": ("racers.csv", csv_in.encode("utf-8"), "text/csv")},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["racers_created"], 2)

        resp = await self.client.get("/api/groups")
        group_names = sorted([g["name"] for g in resp.json()])
        self.assertEqual(group_names, ["Bears", "Lions"])

        resp = await self.client.get("/api/racers")
        self.assertEqual(len(resp.json()), 3)


if __name__ == "__main__":
    unittest.main()
