"""Comprehensive integration tests for Groups and Racers API endpoints."""

from __future__ import annotations

import pytest
import httpx


class TestGroupsAPI:
    """Full CRUD and edge case testing for /api/groups."""

    async def test_list_groups_empty(self, client: httpx.AsyncClient):
        resp = await client.get("/api/groups")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_group(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers", description="Cub Scout Tigers")
        assert g["name"] == "Tigers"
        assert g["description"] == "Cub Scout Tigers"
        assert "id" in g
        assert "created_at" in g
        assert "updated_at" in g

    async def test_create_group_strips_whitespace(self, client: httpx.AsyncClient):
        resp = await client.post("/api/groups", json={"name": "  Bears  "})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Bears"

    async def test_create_group_empty_name(self, client: httpx.AsyncClient):
        resp = await client.post("/api/groups", json={"name": "  "})
        assert resp.status_code == 400

    async def test_update_group(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Old Name")
        resp = await client.put(
            f"/api/groups/{g['id']}", json={"name": "New Name"}
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    async def test_update_group_empty_name(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Group")
        resp = await client.put(f"/api/groups/{g['id']}", json={"name": ""})
        assert resp.status_code == 400

    async def test_update_nonexistent_group(self, client: httpx.AsyncClient):
        resp = await client.put("/api/groups/9999", json={"name": "X"})
        assert resp.status_code == 404

    async def test_delete_group(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Delete Me")
        resp = await client.delete(f"/api/groups/{g['id']}")
        assert resp.status_code == 204

        resp = await client.get("/api/groups")
        assert len(resp.json()) == 0

    async def test_delete_group_keeps_racers(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Temp Group")
        r = await helpers.create_racer("Alice", group_id=g["id"])

        await client.delete(f"/api/groups/{g['id']}")

        resp = await client.get("/api/racers")
        racers = resp.json()
        assert len(racers) == 1
        assert racers[0]["name"] == "Alice"
        assert racers[0]["group_id"] is None

    async def test_delete_nonexistent_group(self, client: httpx.AsyncClient):
        resp = await client.delete("/api/groups/9999")
        assert resp.status_code == 404

    async def test_list_groups_ordered(self, client: httpx.AsyncClient, helpers):
        g1 = await helpers.create_group("Alpha")
        g2 = await helpers.create_group("Beta")
        resp = await client.get("/api/groups")
        ids = [g["id"] for g in resp.json()]
        assert ids == [g1["id"], g2["id"]]


class TestRacersAPI:
    """Full CRUD and edge case testing for /api/racers."""

    async def test_list_racers_empty(self, client: httpx.AsyncClient):
        resp = await client.get("/api/racers")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_create_racer_minimal(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_racer("Bob")
        assert r["name"] == "Bob"
        assert r["car_name"] is None
        assert r["group_id"] is None

    async def test_create_racer_full(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers")
        r = await helpers.create_racer("Alice", car_name="Lightning", car_number="42", group_id=g["id"])
        assert r["car_name"] == "Lightning"
        assert r["car_number"] == "42"
        assert r["group_id"] == g["id"]

    async def test_create_racer_empty_name(self, client: httpx.AsyncClient):
        resp = await client.post("/api/racers", json={"name": "  "})
        assert resp.status_code == 400

    async def test_create_racer_invalid_group(self, client: httpx.AsyncClient):
        resp = await client.post("/api/racers", json={"name": "Bob", "group_id": 9999})
        assert resp.status_code == 400

    async def test_update_racer(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_racer("Old")
        resp = await client.put(
            f"/api/racers/{r['id']}", json={"name": "New", "car_name": "Fast"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New"
        assert data["car_name"] == "Fast"

    async def test_update_racer_empty_name(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_racer("Bob")
        resp = await client.put(f"/api/racers/{r['id']}", json={"name": ""})
        assert resp.status_code == 400

    async def test_update_nonexistent_racer(self, client: httpx.AsyncClient):
        resp = await client.put("/api/racers/9999", json={"name": "X"})
        assert resp.status_code == 404

    async def test_delete_racer(self, client: httpx.AsyncClient, helpers):
        r = await helpers.create_racer("Delete Me")
        resp = await client.delete(f"/api/racers/{r['id']}")
        assert resp.status_code == 204
        resp = await client.get("/api/racers")
        assert len(resp.json()) == 0

    async def test_delete_nonexistent_racer(self, client: httpx.AsyncClient):
        resp = await client.delete("/api/racers/9999")
        assert resp.status_code == 404

    async def test_filter_by_group(self, client: httpx.AsyncClient, helpers):
        g1 = await helpers.create_group("A")
        g2 = await helpers.create_group("B")
        await helpers.create_racer("R1", group_id=g1["id"])
        await helpers.create_racer("R2", group_id=g2["id"])
        await helpers.create_racer("R3", group_id=g1["id"])

        resp = await client.get(f"/api/racers?group_id={g1['id']}")
        assert resp.status_code == 200
        racers = resp.json()
        assert len(racers) == 2
        assert all(r["group_id"] == g1["id"] for r in racers)


class TestBulkRacers:
    """Tests for POST /api/racers/bulk."""

    async def test_bulk_create(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("G")
        payload = [
            {"name": "A", "group_id": g["id"]},
            {"name": "B"},
            {"name": "C", "car_name": "Fast"},
        ]
        resp = await client.post("/api/racers/bulk", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert len(data) == 3

    async def test_bulk_create_empty_list(self, client: httpx.AsyncClient):
        resp = await client.post("/api/racers/bulk", json=[])
        assert resp.status_code == 201
        assert resp.json() == []

    async def test_bulk_create_invalid_group(self, client: httpx.AsyncClient):
        payload = [{"name": "A", "group_id": 9999}]
        resp = await client.post("/api/racers/bulk", json=payload)
        assert resp.status_code == 400

    async def test_bulk_create_empty_name(self, client: httpx.AsyncClient):
        payload = [{"name": "Valid"}, {"name": "  "}]
        resp = await client.post("/api/racers/bulk", json=payload)
        assert resp.status_code == 400
