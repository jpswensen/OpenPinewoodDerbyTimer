"""Shared pytest fixtures for the PWDTimer backend test suite."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import AsyncIterator

import httpx
import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.main import app
from app.models.database import Base, get_db_session, make_engine, make_sessionmaker
from app.services.connection_manager import ConnectionManager
from app.services.event_bus import EventBus


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def engine(tmp_path: Path) -> AsyncIterator[AsyncEngine]:
    """Create a fresh SQLite engine for each test with foreign keys enabled."""
    db_path = tmp_path / "test.db"
    eng = make_engine(f"sqlite+aiosqlite:///{db_path}")

    # Enable foreign key enforcement for SQLite
    @event.listens_for(eng.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture()
async def session_maker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return make_sessionmaker(engine)


@pytest.fixture()
async def db_session(session_maker: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    """Provide a single database session for direct ORM operations."""
    async with session_maker() as session:
        yield session


# ---------------------------------------------------------------------------
# HTTP client fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
async def client(session_maker: async_sessionmaker[AsyncSession]) -> AsyncIterator[httpx.AsyncClient]:
    """Create an httpx async client wired to the FastAPI app with a test database."""

    async def _override_db_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db_session] = _override_db_session

    # Ensure connection manager is available (some endpoints depend on app.state)
    if not hasattr(app.state, "connection_manager") or app.state.connection_manager is None:
        app.state.connection_manager = ConnectionManager(event_bus=EventBus())

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers — exposed as fixtures for convenience
# ---------------------------------------------------------------------------


class APIHelpers:
    """Helper methods for creating test entities via the API."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def create_group(self, name: str = "Test Group", description: str | None = None) -> dict:
        payload: dict = {"name": name}
        if description is not None:
            payload["description"] = description
        resp = await self._client.post("/api/groups", json=payload)
        assert resp.status_code == 201, resp.text
        return resp.json()

    async def create_racer(
        self,
        name: str = "Test Racer",
        car_name: str | None = None,
        car_number: str | None = None,
        group_id: int | None = None,
    ) -> dict:
        payload: dict = {"name": name}
        if car_name is not None:
            payload["car_name"] = car_name
        if car_number is not None:
            payload["car_number"] = car_number
        if group_id is not None:
            payload["group_id"] = group_id
        resp = await self._client.post("/api/racers", json=payload)
        assert resp.status_code == 201, resp.text
        return resp.json()

    async def create_race(
        self, name: str = "Test Race", num_lanes: int = 4, status: str = "setup"
    ) -> dict:
        resp = await self._client.post(
            "/api/races", json={"name": name, "num_lanes": num_lanes, "status": status}
        )
        assert resp.status_code == 201, resp.text
        return resp.json()

    async def generate_heats(self, race_id: int, group_id: int | None = None) -> list[dict]:
        url = f"/api/races/{race_id}/generate-heats"
        if group_id is not None:
            url += f"?group_id={group_id}"
        resp = await self._client.post(url)
        assert resp.status_code == 201, resp.text
        return resp.json()

    async def complete_heat(
        self, heat_id: int, lane_times: dict[int, int]
    ) -> dict:
        """Mark a heat as completed with given lane times (lane_number -> time_us)."""
        lanes = [
            {"lane_number": ln, "time_microseconds": t}
            for ln, t in lane_times.items()
        ]
        resp = await self._client.put(
            f"/api/heats/{heat_id}",
            json={"status": "completed", "lanes": lanes},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()


@pytest.fixture()
def helpers(client: httpx.AsyncClient) -> APIHelpers:
    return APIHelpers(client)
