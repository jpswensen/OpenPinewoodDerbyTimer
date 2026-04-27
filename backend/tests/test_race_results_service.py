"""Tests for race results calculation service."""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Group, Heat, HeatLane, Race, RaceResult, Racer
from app.services.race_results import recalculate_race_results


class TestRecalculateRaceResults:
    async def _setup_race(self, db_session: AsyncSession, num_racers: int = 4, num_lanes: int = 4):
        """Helper: create a race with racers and one heat with lane assignments."""
        race = Race(name="Test", num_lanes=num_lanes)
        db_session.add(race)
        await db_session.flush()

        racers = []
        for i in range(num_racers):
            r = Racer(name=f"Racer {i}")
            db_session.add(r)
            racers.append(r)
        await db_session.flush()

        return race, racers

    async def _create_completed_heat(
        self, db_session, race_id, heat_number, assignments: list[tuple[int, int]]
    ):
        """Create a completed heat. assignments = [(racer_id, time_us), ...]"""
        heat = Heat(race_id=race_id, heat_number=heat_number, status="completed")
        heat.lanes = []
        for lane_idx, (racer_id, time_us) in enumerate(assignments):
            heat.lanes.append(
                HeatLane(
                    lane_number=lane_idx + 1,
                    racer_id=racer_id,
                    time_microseconds=time_us,
                )
            )
        db_session.add(heat)
        await db_session.flush()

        # Assign places
        finished = sorted(
            [(hl, hl.time_microseconds) for hl in heat.lanes if hl.time_microseconds],
            key=lambda x: x[1],
        )
        for idx, (hl, _) in enumerate(finished, start=1):
            hl.place = idx

        return heat

    async def test_basic_results_calculation(self, db_session: AsyncSession):
        race, racers = await self._setup_race(db_session, 2, 2)

        # Heat 1: Racer 0 faster
        await self._create_completed_heat(
            db_session, race.id, 1,
            [(racers[0].id, 3000000), (racers[1].id, 3500000)],
        )

        # Heat 2: Racer 0 still faster
        await self._create_completed_heat(
            db_session, race.id, 2,
            [(racers[1].id, 3400000), (racers[0].id, 3100000)],
        )

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        from sqlalchemy import select
        res = await db_session.execute(
            select(RaceResult).where(RaceResult.race_id == race.id).order_by(RaceResult.overall_place)
        )
        results = list(res.scalars().all())
        assert len(results) == 2

        # Racer 0 should be first (lower average)
        assert results[0].racer_id == racers[0].id
        assert results[0].overall_place == 1
        assert results[0].best_time == 3000000
        assert results[0].average_time == 3050000  # (3000000 + 3100000) / 2

    async def test_racer_with_no_times_unplaced(self, db_session: AsyncSession):
        race, racers = await self._setup_race(db_session, 3, 2)

        # Only 2 racers have times
        await self._create_completed_heat(
            db_session, race.id, 1,
            [(racers[0].id, 3000000), (racers[1].id, 3500000)],
        )

        # Racer 2 is in schedule but in a pending heat — no times
        pending_heat = Heat(race_id=race.id, heat_number=2, status="pending")
        pending_heat.lanes = [
            HeatLane(lane_number=1, racer_id=racers[2].id),
            HeatLane(lane_number=2, racer_id=racers[0].id),
        ]
        db_session.add(pending_heat)
        await db_session.flush()

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        from sqlalchemy import select
        res = await db_session.execute(
            select(RaceResult).where(RaceResult.race_id == race.id)
        )
        results = {rr.racer_id: rr for rr in res.scalars().all()}

        assert results[racers[0].id].overall_place == 1
        assert results[racers[1].id].overall_place == 2
        assert results[racers[2].id].overall_place is None
        assert results[racers[2].id].average_time is None

    async def test_total_points_sum(self, db_session: AsyncSession):
        race, racers = await self._setup_race(db_session, 2, 2)

        # Heat 1: Racer 0 gets place 1, Racer 1 gets place 2
        await self._create_completed_heat(
            db_session, race.id, 1,
            [(racers[0].id, 3000000), (racers[1].id, 3500000)],
        )

        # Heat 2: Racer 1 gets place 1, Racer 0 gets place 2
        await self._create_completed_heat(
            db_session, race.id, 2,
            [(racers[1].id, 3000000), (racers[0].id, 3500000)],
        )

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        from sqlalchemy import select
        res = await db_session.execute(
            select(RaceResult).where(RaceResult.race_id == race.id)
        )
        results = {rr.racer_id: rr for rr in res.scalars().all()}

        # Both should have total_points = 1 + 2 = 3
        assert results[racers[0].id].total_points == 3
        assert results[racers[1].id].total_points == 3

    async def test_updates_existing_results(self, db_session: AsyncSession):
        race, racers = await self._setup_race(db_session, 2, 2)

        await self._create_completed_heat(
            db_session, race.id, 1,
            [(racers[0].id, 3000000), (racers[1].id, 3500000)],
        )

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        # Add another heat and recalculate
        await self._create_completed_heat(
            db_session, race.id, 2,
            [(racers[1].id, 2800000), (racers[0].id, 3200000)],
        )

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        from sqlalchemy import select
        res = await db_session.execute(
            select(RaceResult).where(RaceResult.race_id == race.id)
        )
        results = {rr.racer_id: rr for rr in res.scalars().all()}

        # Racer 0: avg = (3000000 + 3200000) / 2 = 3100000
        assert results[racers[0].id].average_time == 3100000
        # Racer 1: avg = (3500000 + 2800000) / 2 = 3150000
        assert results[racers[1].id].average_time == 3150000
        # Racer 0 still first
        assert results[racers[0].id].overall_place == 1


    async def test_zero_time_microseconds_treated_as_did_not_finish(
        self, db_session: AsyncSession
    ):
        """
        Regression: the firmware always emits 8 lane fields zero-padded for
        inactive lanes. If a stray 0us reaches the database (e.g. from an old
        client), it must NOT be counted as a 0-second finish — it should be
        ignored exactly like None.
        """
        race, racers = await self._setup_race(db_session, 2, 2)

        # Heat 1: Racer 0 finishes legitimately, Racer 1 has bogus 0us time.
        await self._create_completed_heat(
            db_session, race.id, 1,
            [(racers[0].id, 3000000), (racers[1].id, 0)],
        )
        # Heat 2: Both finish legitimately.
        await self._create_completed_heat(
            db_session, race.id, 2,
            [(racers[0].id, 3100000), (racers[1].id, 3400000)],
        )

        await recalculate_race_results(db_session, race.id)
        await db_session.commit()

        from sqlalchemy import select
        res = await db_session.execute(
            select(RaceResult).where(RaceResult.race_id == race.id)
        )
        results = {rr.racer_id: rr for rr in res.scalars().all()}

        # Racer 1's 0us time must be excluded from best/average. Only the
        # 3.4s finish counts.
        assert results[racers[1].id].best_time == 3400000
        assert results[racers[1].id].average_time == 3400000
        # Racer 0 unaffected.
        assert results[racers[0].id].best_time == 3000000
