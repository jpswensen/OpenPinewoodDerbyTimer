from __future__ import annotations

from collections import defaultdict

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Heat, HeatLane, RaceResult


async def recalculate_race_results(session: AsyncSession, race_id: int) -> None:
    """Recompute RaceResult rows for a race based on completed heats.

    - average_time/best_time are computed from completed HeatLane times.
    - total_points is the sum of per-heat places (lower is better) when available.
    - overall_place is assigned by ascending average_time (None averages are unplaced).

    Caller is responsible for committing.
    """

    # All racers that appear anywhere in the schedule (including incomplete heats).
    res = await session.execute(
        select(distinct(HeatLane.racer_id))
        .join(Heat, Heat.id == HeatLane.heat_id)
        .where(Heat.race_id == race_id)
        .where(HeatLane.racer_id.is_not(None))
    )
    racer_ids = [rid for (rid,) in res.all() if rid is not None]

    times_by_racer: dict[int, list[int]] = defaultdict(list)
    points_by_racer: dict[int, list[int]] = defaultdict(list)

    res = await session.execute(
        select(HeatLane.racer_id, HeatLane.time_microseconds, HeatLane.place)
        .join(Heat, Heat.id == HeatLane.heat_id)
        .where(Heat.race_id == race_id)
        .where(Heat.status == "completed")
        .where(HeatLane.racer_id.is_not(None))
        .where(HeatLane.time_microseconds.is_not(None))
    )

    for racer_id, time_us, place in res.all():
        if racer_id is None or time_us is None:
            continue
        times_by_racer[int(racer_id)].append(int(time_us))
        if place is not None:
            points_by_racer[int(racer_id)].append(int(place))

    res = await session.execute(select(RaceResult).where(RaceResult.race_id == race_id))
    existing = {rr.racer_id: rr for rr in res.scalars().all()}

    computed: list[RaceResult] = []
    for racer_id in racer_ids:
        rr = existing.get(racer_id)
        if rr is None:
            rr = RaceResult(race_id=race_id, racer_id=racer_id)
            session.add(rr)

        times = times_by_racer.get(racer_id, [])
        if times:
            rr.best_time = min(times)
            rr.average_time = int(round(sum(times) / len(times)))
        else:
            rr.best_time = None
            rr.average_time = None

        pts = points_by_racer.get(racer_id, [])
        rr.total_points = sum(pts) if pts else None

        computed.append(rr)

    placed = [rr for rr in computed if rr.average_time is not None]
    placed.sort(key=lambda r: (r.average_time or 0, r.best_time or 0, r.racer_id))

    for idx, rr in enumerate(placed, start=1):
        rr.overall_place = idx

    for rr in computed:
        if rr.average_time is None:
            rr.overall_place = None
