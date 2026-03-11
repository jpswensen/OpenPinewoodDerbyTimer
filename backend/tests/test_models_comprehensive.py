"""Unit tests for ORM models — relationships, defaults, and constraints."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Group, Heat, HeatLane, Race, RaceResult, Racer


class TestGroupModel:
    async def test_create_group(self, db_session: AsyncSession):
        g = Group(name="Tigers", description="Cub Scout Tigers")
        db_session.add(g)
        await db_session.commit()
        await db_session.refresh(g)

        assert g.id is not None
        assert g.name == "Tigers"
        assert g.created_at is not None
        assert g.updated_at is not None

    async def test_group_racer_relationship(self, db_session: AsyncSession):
        g = Group(name="Bears")
        db_session.add(g)
        await db_session.flush()

        r = Racer(name="Alice", group_id=g.id)
        db_session.add(r)
        await db_session.commit()
        await db_session.refresh(g)

        assert len(g.racers) == 1
        assert g.racers[0].name == "Alice"


class TestRacerModel:
    async def test_create_racer_without_group(self, db_session: AsyncSession):
        r = Racer(name="Bob", car_name="Speedy", car_number="7")
        db_session.add(r)
        await db_session.commit()
        await db_session.refresh(r)

        assert r.id is not None
        assert r.group_id is None
        assert r.car_name == "Speedy"

    async def test_racer_group_relationship(self, db_session: AsyncSession):
        g = Group(name="Wolves")
        db_session.add(g)
        await db_session.flush()

        r = Racer(name="Charlie", group_id=g.id)
        db_session.add(r)
        await db_session.commit()
        await db_session.refresh(r)

        assert r.group is not None
        assert r.group.name == "Wolves"


class TestRaceModel:
    async def test_create_race(self, db_session: AsyncSession):
        race = Race(name="Derby 2026", num_lanes=4)
        db_session.add(race)
        await db_session.commit()
        await db_session.refresh(race)

        assert race.id is not None
        assert race.status == "setup"
        assert race.num_lanes == 4

    async def test_race_heat_cascade_delete(self, db_session: AsyncSession):
        # Enable foreign keys for this session (SQLite-specific)
        await db_session.execute(text("PRAGMA foreign_keys=ON"))

        race = Race(name="Test", num_lanes=4)
        db_session.add(race)
        await db_session.flush()

        heat = Heat(race_id=race.id, heat_number=1, status="pending")
        heat.lanes = [HeatLane(lane_number=i + 1) for i in range(4)]
        db_session.add(heat)
        await db_session.commit()

        await db_session.delete(race)
        await db_session.commit()

        result = await db_session.execute(select(Heat))
        assert len(result.all()) == 0

        result = await db_session.execute(select(HeatLane))
        assert len(result.all()) == 0


class TestHeatModel:
    async def test_create_heat_with_lanes(self, db_session: AsyncSession):
        race = Race(name="Test", num_lanes=4)
        db_session.add(race)
        await db_session.flush()

        heat = Heat(race_id=race.id, heat_number=1)
        heat.lanes = [
            HeatLane(lane_number=i + 1, racer_id=None)
            for i in range(4)
        ]
        db_session.add(heat)
        await db_session.commit()
        await db_session.refresh(heat)

        assert len(heat.lanes) == 4
        assert heat.lanes[0].lane_number == 1

    async def test_heat_lane_ordering(self, db_session: AsyncSession):
        race = Race(name="Test", num_lanes=4)
        db_session.add(race)
        await db_session.flush()

        heat = Heat(race_id=race.id, heat_number=1)
        # Add lanes in reverse order
        heat.lanes = [
            HeatLane(lane_number=4),
            HeatLane(lane_number=2),
            HeatLane(lane_number=1),
            HeatLane(lane_number=3),
        ]
        db_session.add(heat)
        await db_session.commit()
        await db_session.refresh(heat)

        # Should be ordered by lane_number
        lane_numbers = [l.lane_number for l in heat.lanes]
        assert lane_numbers == [1, 2, 3, 4]


class TestRaceResultModel:
    async def test_create_race_result(self, db_session: AsyncSession):
        race = Race(name="Test", num_lanes=4)
        racer = Racer(name="Alice")
        db_session.add_all([race, racer])
        await db_session.flush()

        rr = RaceResult(
            race_id=race.id, racer_id=racer.id,
            average_time=3500000, best_time=3400000,
            total_points=5, overall_place=1,
        )
        db_session.add(rr)
        await db_session.commit()
        await db_session.refresh(rr)

        assert rr.average_time == 3500000
        assert rr.overall_place == 1

    async def test_race_result_cascade_delete(self, db_session: AsyncSession):
        await db_session.execute(text("PRAGMA foreign_keys=ON"))

        race = Race(name="Test", num_lanes=4)
        racer = Racer(name="Bob")
        db_session.add_all([race, racer])
        await db_session.flush()

        rr = RaceResult(race_id=race.id, racer_id=racer.id)
        db_session.add(rr)
        await db_session.commit()

        await db_session.delete(race)
        await db_session.commit()

        result = await db_session.execute(select(RaceResult))
        assert len(result.all()) == 0
