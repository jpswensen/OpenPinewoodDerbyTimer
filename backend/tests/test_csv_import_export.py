"""Comprehensive tests for CSV import/export endpoints."""

from __future__ import annotations

import csv
import io

import httpx
import pytest


class TestCSVImport:
    """Tests for POST /api/import/csv."""

    async def test_basic_import(self, client: httpx.AsyncClient):
        csv_data = "name,car_name,car_number,group\nAlice,Speedy,1,Tigers\nBob,Flash,2,Bears\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("racers.csv", csv_data.encode(), "text/csv")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["racers_created"] == 2
        assert data["groups_created"] == 2
        assert data["errors"] == []

    async def test_import_creates_groups(self, client: httpx.AsyncClient):
        csv_data = "name,group\nAlice,Tigers\nBob,Tigers\nCharlie,Bears\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        data = resp.json()
        assert data["groups_created"] == 2  # Tigers and Bears
        assert data["racers_created"] == 3

        # Verify groups created correctly
        resp = await client.get("/api/groups")
        groups = resp.json()
        assert len(groups) == 2

    async def test_import_reuses_existing_group(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers")
        csv_data = "name,group\nAlice,Tigers\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        data = resp.json()
        assert data["groups_created"] == 0
        assert data["racers_created"] == 1

        resp = await client.get(f"/api/racers?group_id={g['id']}")
        assert len(resp.json()) == 1

    async def test_import_missing_name_reports_error(self, client: httpx.AsyncClient):
        csv_data = "name,car_name\n,Fast\nBob,Speedy\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        data = resp.json()
        assert data["racers_created"] == 1
        assert len(data["errors"]) == 1
        assert data["errors"][0]["row"] == 2

    async def test_import_alternative_column_names(self, client: httpx.AsyncClient):
        csv_data = "Name,Car Name,Car Number,Group\nAlice,Lightning,7,Wolves\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        data = resp.json()
        assert data["racers_created"] == 1

    async def test_import_no_group_column(self, client: httpx.AsyncClient):
        csv_data = "name,car_name\nAlice,Speedy\nBob,Flash\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        data = resp.json()
        assert data["racers_created"] == 2
        assert data["groups_created"] == 0

    async def test_import_utf8_bom(self, client: httpx.AsyncClient):
        csv_data = "name,car_name\nAlice,Speedy\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode("utf-8-sig"), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["racers_created"] == 1

    async def test_import_empty_csv(self, client: httpx.AsyncClient):
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", b"", "text/csv")},
        )
        assert resp.status_code == 400

    async def test_import_header_only(self, client: httpx.AsyncClient):
        csv_data = "name,car_name\n"
        resp = await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )
        assert resp.status_code == 200
        assert resp.json()["racers_created"] == 0


class TestCSVExport:
    """Tests for GET /api/export/csv."""

    async def test_export_empty(self, client: httpx.AsyncClient):
        resp = await client.get("/api/export/csv")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 1  # header only
        assert rows[0] == ["name", "car_name", "car_number", "group"]

    async def test_export_with_data(self, client: httpx.AsyncClient, helpers):
        g = await helpers.create_group("Tigers")
        await helpers.create_racer("Alice", car_name="Speedy", car_number="7", group_id=g["id"])
        await helpers.create_racer("Bob", car_name="Flash")

        resp = await client.get("/api/export/csv")
        assert resp.status_code == 200

        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 3  # header + 2 racers
        # Alice should have group Tigers
        assert rows[1][0] == "Alice"
        assert rows[1][3] == "Tigers"
        # Bob has no group
        assert rows[2][0] == "Bob"
        assert rows[2][3] == ""

    async def test_export_content_disposition(self, client: httpx.AsyncClient):
        resp = await client.get("/api/export/csv")
        cd = resp.headers.get("content-disposition", "")
        assert "racers.csv" in cd

    async def test_round_trip_import_export(self, client: httpx.AsyncClient, helpers):
        """Import CSV, export, and verify data is preserved."""
        g = await helpers.create_group("Tigers")
        csv_data = f"name,car_name,car_number,group\nAlice,Speedy,7,Tigers\nBob,Flash,42,Tigers\n"
        await client.post(
            "/api/import/csv",
            files={"file": ("r.csv", csv_data.encode(), "text/csv")},
        )

        resp = await client.get("/api/export/csv")
        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 2
        names = {r["name"] for r in rows}
        assert names == {"Alice", "Bob"}
