"""Comprehensive integration tests for race and heat management API."""

from __future__ import annotations

from collections import defaultdict

import httpx
import pytest


class TestRaceCRUD:
    """Full CRUD tests for /api/races."""

    async def test_list_races_empty(self, client: httpx.AsyncClient):
        resp = await client.get("/api/races")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_race(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_race("Derby 2026", num_lanes=4)
        assert r["name"] == "Derby 2026"
        assert r["num_lanes"] == 4
        assert r["status"] == "setup"
        assert "id" in r

    async def test_create_race_empty_name(self, client: httpx.AsyncClient):
        resp = await client.post("/api/races", json={"name": " ", "num_lanes": 4})
        assert resp.status_code == 400

    async def test_create_race_invalid_lanes(self, client: httpx.AsyncClient):
        resp = await client.post("/api/races", json={"name": "R", "num_lanes": 0})
        assert resp.status_code == 400
        resp = await client.post("/api/races", json={"name": "R", "num_lanes": 9})
        assert resp.status_code == 400

    async def test_get_race(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_race("My Race")
        resp = await client.get(f"/api/races/{r['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Race"

    async def test_get_nonexistent_race(self, client: httpx.AsyncClient):
        resp = await client.get("/api/races/9999")
        assert resp.status_code == 404

    async def test_update_race(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_race("Old")
        resp = await client.put(
            f"/api/races/{r['id']}",
            json={"name": "New", "status": "in_progress"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New"
        assert data["status"] == "in_progress"

    async def test_update_race_invalid_lanes(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_race("R")
        resp = await client.put(f"/api/races/{r['id']}", json={"num_lanes": 0})
        assert resp.status_code == 400

    async def test_delete_race(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_race("Delete Me")
        resp = await client.delete(f"/api/races/{r['id']}")
        assert resp.status_code == 204

        resp = await client.get(f"/api/races/{r['id']}")
        assert resp.status_code == 404


class TestHeatGeneration:
    """Tests for heat generation and scheduling."""

    async def test_generate_heats_basic(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(5):
            await helpers.create_racer(f"Racer {i}")

        heats = await helpers.generate_heats(race["id"])
        assert len(heats) == 5
        for h in heats:
            assert len(h["lanes"]) == 4

    async def test_generate_heats_no_racers(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("Empty", num_lanes=4)
        resp = await client.post(f"/api/races/{race['id']}/generate-heats")
        assert resp.status_code == 400

    async def test_generate_heats_with_group_filter(self, client: httpx.AsyncClient, helpers):
        g1 = await helpers.create_group("Tigers")
        g2 = await helpers.create_group("Bears")
        for i in range(3):
            await helpers.create_racer(f"T{i}", group_id=g1["id"])
        for i in range(2):
            await helpers.create_racer(f"B{i}", group_id=g2["id"])

        race = await helpers.create_race("Filtered", num_lanes=4)
        heats = await helpers.generate_heats(race["id"], group_id=g1["id"])
        # 3 racers < 4 lanes → 4 heats
        assert len(heats) == 4

    async def test_generate_heats_replaces_existing(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"Racer {i}")

        heats1 = await helpers.generate_heats(race["id"])
        assert len(heats1) == 4

        # Add another racer and regenerate
        await helpers.create_racer("Extra")
        heats2 = await helpers.generate_heats(race["id"])
        assert len(heats2) == 5  # Now 5 racers

    async def test_lane_rotation_fairness(self, client: httpx.AsyncClient, helpers):
        """Each racer should appear in each lane exactly once with n == num_lanes."""
        race = await helpers.create_race("Fair", num_lanes=4)
        racer_ids = []
        for i in range(4):
            r = await helpers.create_racer(f"R{i}")
            racer_ids.append(r["id"])

        heats = await helpers.generate_heats(race["id"])
        lane_counts = defaultdict(lambda: defaultdict(int))
        for h in heats:
            for lane in h["lanes"]:
                rid = lane["racer_id"]
                ln = lane["lane_number"]
                if rid is not None:
                    lane_counts[rid][ln] += 1

        for rid in racer_ids:
            for ln in range(1, 5):
                assert lane_counts[rid][ln] == 1

    async def test_bye_lanes_with_fewer_racers(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("Byes", num_lanes=4)
        for i in range(2):
            await helpers.create_racer(f"R{i}")

        heats = await helpers.generate_heats(race["id"])
        assert len(heats) == 4
        for h in heats:
            nones = sum(1 for lane in h["lanes"] if lane["racer_id"] is None)
            assert nones == 2


class TestHeatUpdates:
    """Tests for PUT /api/heats/{id}."""

    async def _setup_race_with_heats(self, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])
        return race, heats

    async def test_update_heat_status(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        resp = await client.put(
            f"/api/heats/{heat_id}",
            json={"status": "in_progress"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "in_progress"
        assert data["scheduled_at"] is not None

    async def test_complete_heat_with_times(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        lane_times = {}
        for lane in heats[0]["lanes"]:
            lane_times[lane["lane_number"]] = 3000000 + lane["lane_number"] * 100000

        result = await helpers.complete_heat(heat_id, lane_times)
        assert result["status"] == "completed"
        assert result["completed_at"] is not None

        # Verify places assigned
        places = [lane["place"] for lane in result["lanes"]]
        assert sorted(places) == [1, 2, 3, 4]

    async def test_place_ordering_by_time(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        lanes = [
            {"lane_number": 1, "time_microseconds": 4000000},
            {"lane_number": 2, "time_microseconds": 3000000},
            {"lane_number": 3, "time_microseconds": 3500000},
            {"lane_number": 4, "time_microseconds": 3200000},
        ]
        resp = await client.put(
            f"/api/heats/{heat_id}",
            json={"status": "completed", "lanes": lanes},
        )
        data = resp.json()
        lane_map = {l["lane_number"]: l for l in data["lanes"]}
        assert lane_map[2]["place"] == 1  # fastest
        assert lane_map[4]["place"] == 2
        assert lane_map[3]["place"] == 3
        assert lane_map[1]["place"] == 4  # slowest

    async def test_update_nonexistent_heat(self, client: httpx.AsyncClient):
        resp = await client.put("/api/heats/9999", json={"status": "completed"})
        assert resp.status_code == 404

    async def test_change_lane_assignment_only_when_pending(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        # Set to in_progress first
        await client.put(f"/api/heats/{heat_id}", json={"status": "in_progress"})

        # Try changing racer assignment — should fail
        resp = await client.put(
            f"/api/heats/{heat_id}",
            json={"lanes": [{"lane_number": 1, "racer_id": 9999}]},
        )
        assert resp.status_code == 400

    async def test_duplicate_racer_in_heat_rejected(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        first_lane = heats[0]["lanes"][0]
        second_lane = heats[0]["lanes"][1]
        resp = await client.put(
            f"/api/heats/{heat_id}",
            json={"lanes": [{"lane_number": second_lane["lane_number"], "racer_id": first_lane["racer_id"]}]},
        )
        assert resp.status_code == 400

    async def test_revert_to_pending_clears_timestamps(self, client: httpx.AsyncClient, helpers):
        race, heats = await self._setup_race_with_heats(helpers)
        heat_id = heats[0]["id"]

        await client.put(f"/api/heats/{heat_id}", json={"status": "in_progress"})
        resp = await client.put(f"/api/heats/{heat_id}", json={"status": "pending"})
        data = resp.json()
        assert data["status"] == "pending"
        assert data["scheduled_at"] is None
        assert data["completed_at"] is None


class TestHeatRepeat:
    """Tests for POST /api/heats/{id}/repeat."""

    async def test_repeat_heat(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])

        resp = await client.post(f"/api/heats/{heats[0]['id']}/repeat")
        assert resp.status_code == 201
        new_heat = resp.json()
        assert new_heat["status"] == "pending"
        assert new_heat["heat_number"] == len(heats) + 1

        # Same racer assignments
        orig_racers = sorted(l["racer_id"] for l in heats[0]["lanes"] if l["racer_id"])
        new_racers = sorted(l["racer_id"] for l in new_heat["lanes"] if l["racer_id"])
        assert orig_racers == new_racers

    async def test_repeat_nonexistent_heat(self, client: httpx.AsyncClient):
        resp = await client.post("/api/heats/9999/repeat")
        assert resp.status_code == 404


class TestHeatReorder:
    """Tests for PUT /api/races/{id}/heats/reorder."""

    async def test_reorder_heats(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])

        original_order = [h["id"] for h in heats]
        reversed_order = list(reversed(original_order))

        resp = await client.put(
            f"/api/races/{race['id']}/heats/reorder",
            json={"heat_ids": reversed_order},
        )
        assert resp.status_code == 200
        new_heats = resp.json()
        assert [h["id"] for h in new_heats] == reversed_order

    async def test_reorder_mismatched_ids(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])

        resp = await client.put(
            f"/api/races/{race['id']}/heats/reorder",
            json={"heat_ids": [heats[0]["id"]]},  # missing heats
        )
        assert resp.status_code == 400


class TestRaceResults:
    """Tests for race result computation and retrieval."""

    async def test_results_after_completion(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        racer_ids = []
        for i in range(4):
            r = await helpers.create_racer(f"R{i}")
            racer_ids.append(r["id"])

        heats = await helpers.generate_heats(race["id"])

        for heat in heats:
            lane_times = {}
            for lane in heat["lanes"]:
                if lane["racer_id"] is not None:
                    # Different times per racer for variety
                    lane_times[lane["lane_number"]] = 3000000 + lane["racer_id"] * 50000
            await helpers.complete_heat(heat["id"], lane_times)

        resp = await client.get(f"/api/races/{race['id']}/results")
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 4

        # Verify all racers have results
        result_racer_ids = {r["racer_id"] for r in results}
        assert result_racer_ids == set(racer_ids)

        # First place should have the lowest average time
        placed = [r for r in results if r["overall_place"] is not None]
        assert len(placed) == 4
        assert placed[0]["overall_place"] == 1

    async def test_results_nonexistent_race(self, client: httpx.AsyncClient):
        resp = await client.get("/api/races/9999/results")
        assert resp.status_code == 404


class TestPDFExport:
    """Tests for GET /api/races/{id}/export/pdf."""

    async def test_export_pdf(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])

        for heat in heats:
            lane_times = {
                lane["lane_number"]: 3000000 + lane["lane_number"] * 100000
                for lane in heat["lanes"]
                if lane["racer_id"] is not None
            }
            await helpers.complete_heat(heat["id"], lane_times)

        resp = await client.get(f"/api/races/{race['id']}/export/pdf")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "application/pdf"
        assert resp.content.startswith(b"%PDF")

    async def test_export_pdf_page_sizes(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")

        for ps in ("letter", "a4"):
            for orient in ("portrait", "landscape"):
                resp = await client.get(
                    f"/api/races/{race['id']}/export/pdf?page_size={ps}&orientation={orient}"
                )
                assert resp.status_code == 200

    async def test_export_pdf_nonexistent_race(self, client: httpx.AsyncClient):
        resp = await client.get("/api/races/9999/export/pdf")
        assert resp.status_code == 404

    async def test_export_pdf_with_group_filter(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers")
        race = await helpers.create_race("R", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}", group_id=g["id"])
        await helpers.generate_heats(race["id"])

        resp = await client.get(
            f"/api/races/{race['id']}/export/pdf?group_id={g['id']}"
        )
        assert resp.status_code == 200
        assert resp.content.startswith(b"%PDF")
