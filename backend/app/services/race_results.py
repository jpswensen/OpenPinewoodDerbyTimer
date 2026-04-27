from __future__ import annotations

from collections import defaultdict

from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Heat, HeatLane, RaceResult, Racer


async def recalculate_race_results(session: AsyncSession, race_id: int) -> None:
    """Recompute RaceResult rows for a race based on completed heats.

    - DNF lanes are penalised with the worst recorded time across the entire
      race so they are never *rewarded* for failing to finish.
    - average_time/best_time include these penalty times.
    - total_points is the sum of per-heat places (lower is better); DNF lanes
      receive num_racers_in_heat + 1 as their point value.
    - overall_place is assigned by ascending average_time.
    - dnf_count tracks how many heats a racer did not finish.

    Caller is responsible for committing.
    """

    # All racers that appear anywhere in the schedule (including incomplete heats).
    # Exclude disabled (no-show) racers from results.
    res = await session.execute(
        select(distinct(HeatLane.racer_id))
        .join(Heat, Heat.id == HeatLane.heat_id)
        .join(Racer, Racer.id == HeatLane.racer_id)
        .where(Heat.race_id == race_id)
        .where(HeatLane.racer_id.is_not(None))
        .where(Racer.disabled.is_(False))
    )
    racer_ids = [rid for (rid,) in res.all() if rid is not None]

    # ── Gather all completed-heat lanes (both finished and DNF) ──────────
    res = await session.execute(
        select(
            HeatLane.heat_id,
            HeatLane.racer_id,
            HeatLane.time_microseconds,
            HeatLane.place,
            HeatLane.dnf,
        )
        .join(Heat, Heat.id == HeatLane.heat_id)
        .where(Heat.race_id == race_id)
        .where(Heat.status == "completed")
        .where(HeatLane.racer_id.is_not(None))
    )
    all_rows = res.all()

    # Find the worst (slowest) legitimate time across the entire race.
    # `time_microseconds == 0` is an inactive-lane sentinel from the firmware
    # (it always emits 8 lane fields zero-padded), not a 0-second finish.
    worst_time: int | None = None
    for _, _, time_us, _, is_dnf in all_rows:
        if time_us is not None and time_us > 0 and not is_dnf:
            if worst_time is None or time_us > worst_time:
                worst_time = time_us

    # Count racers per heat (for DNF points penalty).
    racers_per_heat: dict[int, int] = defaultdict(int)
    for heat_id, racer_id, _, _, _ in all_rows:
        if racer_id is not None:
            racers_per_heat[heat_id] += 1

    times_by_racer: dict[int, list[int]] = defaultdict(list)
    points_by_racer: dict[int, list[int]] = defaultdict(list)
    dnf_count_by_racer: dict[int, int] = defaultdict(int)

    for heat_id, racer_id, time_us, place, is_dnf in all_rows:
        if racer_id is None:
            continue

        if is_dnf:
            dnf_count_by_racer[int(racer_id)] += 1
            # Penalise: use worst overall time (if available) for averages.
            if worst_time is not None:
                times_by_racer[int(racer_id)].append(worst_time)
            # Points penalty: last place + 1 in this heat.
            points_by_racer[int(racer_id)].append(racers_per_heat[heat_id] + 1)
        elif time_us is not None and time_us > 0:
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

        rr.dnf_count = dnf_count_by_racer.get(racer_id, 0)

        computed.append(rr)

    placed = [rr for rr in computed if rr.average_time is not None]
    placed.sort(key=lambda r: (r.average_time or 0, r.best_time or 0, r.racer_id))

    for idx, rr in enumerate(placed, start=1):
        rr.overall_place = idx

    for rr in computed:
        if rr.average_time is None:
            rr.overall_place = None
