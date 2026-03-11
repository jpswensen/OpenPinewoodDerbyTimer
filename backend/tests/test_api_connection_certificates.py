"""Comprehensive tests for the connection API endpoints."""

from __future__ import annotations

import httpx
import pytest


class TestConnectionAPI:
    """Tests for /api/connection/* endpoints."""

    async def test_status_endpoint(self, client: httpx.AsyncClient):
        resp = await client.get("/api/connection/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "connection_state" in data

    async def test_connect_requires_mode(self, client: httpx.AsyncClient):
        resp = await client.post("/api/connection/connect", json={"mode": "invalid"})
        assert resp.status_code == 400

    async def test_serial_connect_requires_port(self, client: httpx.AsyncClient):
        resp = await client.post(
            "/api/connection/connect",
            json={"mode": "serial"},
        )
        assert resp.status_code == 400

    async def test_tcp_connect_requires_host(self, client: httpx.AsyncClient):
        resp = await client.post(
            "/api/connection/connect",
            json={"mode": "tcp"},
        )
        assert resp.status_code == 400

    async def test_disconnect(self, client: httpx.AsyncClient):
        resp = await client.post("/api/connection/disconnect")
        assert resp.status_code == 200
        data = resp.json()
        assert data["connection_state"] == "disconnected"

    async def test_arm_when_not_connected(self, client: httpx.AsyncClient):
        resp = await client.post("/api/connection/arm")
        assert resp.status_code == 409

    async def test_reset_when_not_connected(self, client: httpx.AsyncClient):
        resp = await client.post("/api/connection/reset")
        assert resp.status_code == 409

    async def test_set_lanes_when_not_connected(self, client: httpx.AsyncClient):
        resp = await client.post("/api/connection/set-lanes", json={"num_lanes": 4})
        assert resp.status_code == 409

    async def test_set_lanes_invalid_value(self, client: httpx.AsyncClient):
        # Even though not connected, validation of num_lanes may happen first
        # or the "not connected" error takes precedence — both are acceptable.
        resp = await client.post("/api/connection/set-lanes", json={"num_lanes": 0})
        assert resp.status_code in (400, 409)

    async def test_serial_ports_endpoint(self, client: httpx.AsyncClient):
        resp = await client.get("/api/connection/serial-ports")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestCertificateAPI:
    """Tests for /api/certificates/* endpoints."""

    async def test_preview_winner(self, client: httpx.AsyncClient):
        resp = await client.get("/api/certificates/preview?type=winner&place=1")
        assert resp.status_code == 200
        assert resp.content.startswith(b"%PDF")

    async def test_preview_participation(self, client: httpx.AsyncClient):
        resp = await client.get("/api/certificates/preview?type=participation")
        assert resp.status_code == 200
        assert resp.content.startswith(b"%PDF")

    async def test_generate_participants_certificates(self, client: httpx.AsyncClient, helpers):
        race = await helpers.create_race("Derby", num_lanes=4)
        for i in range(4):
            await helpers.create_racer(f"R{i}")
        heats = await helpers.generate_heats(race["id"])

        # Complete at least one heat
        lane_times = {
            lane["lane_number"]: 3000000 + lane["lane_number"] * 100000
            for lane in heats[0]["lanes"]
            if lane["racer_id"] is not None
        }
        await helpers.complete_heat(heats[0]["id"], lane_times)

        resp = await client.post(
            "/api/certificates/generate",
            json={"race_id": race["id"], "mode": "participants"},
        )
        assert resp.status_code == 200
        assert resp.content.startswith(b"%PDF")

    async def test_generate_winner_certificates(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers")
        race = await helpers.create_race("Derby", num_lanes=4)
        racer_ids = []
        for i in range(4):
            r = await helpers.create_racer(f"R{i}", group_id=g["id"])
            racer_ids.append(r["id"])

        heats = await helpers.generate_heats(race["id"])
        for heat in heats:
            lane_times = {}
            for lane in heat["lanes"]:
                if lane["racer_id"] is not None:
                    lane_times[lane["lane_number"]] = 3000000 + lane["racer_id"] * 50000
            await helpers.complete_heat(heat["id"], lane_times)

        resp = await client.post(
            "/api/certificates/generate",
            json={
                "race_id": race["id"],
                "mode": "winners",
                "places": [1, 2, 3],
                "include_overall": True,
                "include_per_group": True,
            },
        )
        assert resp.status_code == 200
        assert resp.content.startswith(b"%PDF")

    async def test_generate_nonexistent_race(self, client: httpx.AsyncClient):
        resp = await client.post(
            "/api/certificates/generate",
            json={"race_id": 9999, "mode": "winners"},
        )
        assert resp.status_code == 404


class TestHealthEndpoint:
    async def test_health(self, client: httpx.AsyncClient):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
