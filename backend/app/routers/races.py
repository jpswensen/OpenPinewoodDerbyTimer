from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import get_db_session
from app.models.models import Group, Heat, HeatLane, Race, RaceResult, Racer
from app.models.schemas import HeatWithLanesRead, RaceCreate, RaceRead, RaceResultRead, RaceUpdate
from app.services.event_bus import event_bus
from app.services.heat_scheduler import generate_round_robin_heats
from app.services.pdf_generator import (
    RaceResultsPDFMeta,
    RaceResultsRow,
    format_time_us,
    generate_race_results_pdf,
)
from app.services.race_results import recalculate_race_results

router = APIRouter(prefix="/api", tags=["races"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _validate_num_lanes(num_lanes: int) -> None:
    if num_lanes < 1 or num_lanes > 8:
        raise HTTPException(status_code=400, detail="num_lanes must be between 1 and 8")


@router.get("/races", response_model=list[RaceRead])
async def list_races(session: AsyncSession = Depends(get_db_session)) -> list[Race]:
    res = await session.execute(select(Race).order_by(Race.id))
    return list(res.scalars().all())


@router.post("/races", response_model=RaceRead, status_code=status.HTTP_201_CREATED)
async def create_race(payload: RaceCreate, session: AsyncSession = Depends(get_db_session)) -> Race:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Race name is required")
    _validate_num_lanes(payload.num_lanes)

    race = Race(name=name, num_lanes=payload.num_lanes, status=payload.status)
    session.add(race)
    await session.commit()
    await session.refresh(race)
    return race


@router.get("/races/{race_id}", response_model=RaceRead)
async def get_race(race_id: int, session: AsyncSession = Depends(get_db_session)) -> Race:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")
    return race


@router.put("/races/{race_id}", response_model=RaceRead)
async def update_race(
    race_id: int, payload: RaceUpdate, session: AsyncSession = Depends(get_db_session)
) -> Race:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Race name is required")
        race.name = name
    if payload.num_lanes is not None:
        _validate_num_lanes(payload.num_lanes)
        race.num_lanes = payload.num_lanes
    if payload.status is not None:
        race.status = payload.status

    await session.commit()
    await session.refresh(race)
    return race


@router.delete("/races/{race_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_race(race_id: int, session: AsyncSession = Depends(get_db_session)) -> None:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    await session.delete(race)
    await session.commit()


@router.get("/races/{race_id}/results", response_model=list[RaceResultRead])
async def get_race_results(
    race_id: int, session: AsyncSession = Depends(get_db_session)
) -> list[RaceResult]:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    res = await session.execute(
        select(RaceResult).where(RaceResult.race_id == race_id).order_by(RaceResult.overall_place)
    )
    return list(res.scalars().all())


@router.post(
    "/races/{race_id}/generate-heats",
    response_model=list[HeatWithLanesRead],
    status_code=status.HTTP_201_CREATED,
)
async def generate_heats(
    race_id: int,
    group_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> list[Heat]:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    _validate_num_lanes(race.num_lanes)
    num_lanes = race.num_lanes  # capture before expire

    stmt = select(Racer.id).where(Racer.disabled.is_(False)).order_by(Racer.id)
    if group_id is not None:
        stmt = stmt.where(Racer.group_id == group_id)
    res = await session.execute(stmt)
    racer_ids = list(res.scalars().all())
    if not racer_ids:
        raise HTTPException(status_code=400, detail="No racers available to schedule")

    # Replace existing schedule/results — delete heat_lanes explicitly
    # because bulk delete() doesn't trigger ORM cascades.
    await session.execute(delete(RaceResult).where(RaceResult.race_id == race_id))
    heat_ids_q = select(Heat.id).where(Heat.race_id == race_id)
    await session.execute(delete(HeatLane).where(HeatLane.heat_id.in_(heat_ids_q)))
    await session.execute(delete(Heat).where(Heat.race_id == race_id))
    await session.flush()
    session.expire_all()

    schedule = generate_round_robin_heats(racer_ids, num_lanes)

    heats: list[Heat] = []
    for heat_number, lane_assignments in enumerate(schedule, start=1):
        heat = Heat(race_id=race_id, heat_number=heat_number, status="pending")
        heat.lanes = [
            HeatLane(
                lane_number=lane_idx + 1,
                racer_id=lane_assignments[lane_idx],
            )
            for lane_idx in range(num_lanes)
        ]
        session.add(heat)
        heats.append(heat)

    await session.commit()

    # Reload with lanes for response.
    res = await session.execute(
        select(Heat)
        .where(Heat.race_id == race_id)
        .options(selectinload(Heat.lanes))
        .order_by(Heat.heat_number)
    )
    return list(res.scalars().all())


@router.get("/races/{race_id}/heats", response_model=list[HeatWithLanesRead])
async def list_heats(
    race_id: int, session: AsyncSession = Depends(get_db_session)
) -> list[Heat]:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    res = await session.execute(
        select(Heat)
        .where(Heat.race_id == race_id)
        .options(selectinload(Heat.lanes))
        .order_by(Heat.heat_number)
    )
    return list(res.scalars().all())


class HeatsReorderRequest(BaseModel):
    heat_ids: list[int]


@router.put("/races/{race_id}/heats/reorder", response_model=list[HeatWithLanesRead])
async def reorder_heats(
    race_id: int, payload: HeatsReorderRequest, session: AsyncSession = Depends(get_db_session)
) -> list[Heat]:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    res = await session.execute(select(Heat).where(Heat.race_id == race_id).order_by(Heat.heat_number))
    heats = list(res.scalars().all())

    if not heats:
        return []

    existing_ids = [h.id for h in heats]
    if len(payload.heat_ids) != len(existing_ids) or set(payload.heat_ids) != set(existing_ids):
        raise HTTPException(status_code=400, detail="heat_ids must include every heat exactly once")

    by_id = {h.id: h for h in heats}

    # Avoid UNIQUE(race_id, heat_number) collisions by using a two-phase renumber.
    max_num = max(h.heat_number for h in heats)
    temp_base = max_num + 1000

    for idx, hid in enumerate(payload.heat_ids, start=1):
        by_id[hid].heat_number = temp_base + idx
    await session.flush()

    for idx, hid in enumerate(payload.heat_ids, start=1):
        by_id[hid].heat_number = idx

    await session.commit()

    res = await session.execute(
        select(Heat)
        .where(Heat.race_id == race_id)
        .options(selectinload(Heat.lanes))
        .order_by(Heat.heat_number)
    )
    return list(res.scalars().all())


def _field_was_set(model: BaseModel, field: str) -> bool:
    fields_set = getattr(model, "model_fields_set", None)
    if isinstance(fields_set, set):
        return field in fields_set
    fields_set = getattr(model, "__fields_set__", None)
    if isinstance(fields_set, set):
        return field in fields_set
    return False


class HeatLaneUpdate(BaseModel):
    lane_number: int
    time_microseconds: int | None = None
    racer_id: int | None = None
    dnf: bool | None = None


class HeatUpdateRequest(BaseModel):
    status: Literal["pending", "in_progress", "completed"] | None = None
    lanes: list[HeatLaneUpdate] | None = None


@router.put("/heats/{heat_id}", response_model=HeatWithLanesRead)
async def update_heat(
    heat_id: int, payload: HeatUpdateRequest, session: AsyncSession = Depends(get_db_session)
) -> Heat:
    res = await session.execute(
        select(Heat).where(Heat.id == heat_id).options(selectinload(Heat.lanes))
    )
    heat = res.scalar_one_or_none()
    if heat is None:
        raise HTTPException(status_code=404, detail="Heat not found")

    if payload.status is not None:
        heat.status = payload.status
        if payload.status == "in_progress" and heat.scheduled_at is None:
            heat.scheduled_at = _utcnow()
        if payload.status == "completed":
            heat.completed_at = _utcnow()
        if payload.status == "pending":
            heat.completed_at = None
            heat.scheduled_at = None

    if payload.lanes is not None:
        lanes_by_num = {hl.lane_number: hl for hl in heat.lanes}

        assignment_updates = [upd for upd in payload.lanes if _field_was_set(upd, "racer_id")]
        if assignment_updates and heat.status != "pending":
            raise HTTPException(
                status_code=400,
                detail="Cannot change lane assignments unless the heat is pending",
            )

        racer_ids = {upd.racer_id for upd in assignment_updates if upd.racer_id is not None}
        if racer_ids:
            res = await session.execute(select(Racer.id).where(Racer.id.in_(racer_ids)))
            found = set(res.scalars().all())
            missing = sorted(set(racer_ids) - found)
            if missing:
                raise HTTPException(status_code=400, detail=f"Unknown racer_ids: {missing}")

        for upd in payload.lanes:
            hl = lanes_by_num.get(upd.lane_number)
            if hl is None:
                raise HTTPException(status_code=400, detail=f"Unknown lane_number: {upd.lane_number}")

            if _field_was_set(upd, "racer_id") and upd.racer_id != hl.racer_id:
                hl.racer_id = upd.racer_id
                # Changing a lane assignment invalidates any prior recorded time/place.
                hl.time_microseconds = None
                hl.place = None

            if _field_was_set(upd, "time_microseconds"):
                hl.time_microseconds = upd.time_microseconds

            if _field_was_set(upd, "dnf"):
                hl.dnf = bool(upd.dnf)
                if hl.dnf:
                    # DNF lanes lose their place (and optionally clear time)
                    hl.place = None

        assigned = [hl.racer_id for hl in heat.lanes if hl.racer_id is not None]
        if len(assigned) != len(set(assigned)):
            raise HTTPException(status_code=400, detail="Duplicate racer_id within a heat is not allowed")

        # Recompute per-heat place ordering.
        finished = [
            hl
            for hl in heat.lanes
            if hl.racer_id is not None and hl.time_microseconds is not None and not hl.dnf
        ]
        finished.sort(key=lambda x: (x.time_microseconds or 0, x.lane_number))

        for hl in heat.lanes:
            hl.place = None
        for idx, hl in enumerate(finished, start=1):
            hl.place = idx

    if heat.status == "completed":
        await recalculate_race_results(session, heat.race_id)

    await session.commit()

    # Refresh and return.
    res = await session.execute(
        select(Heat).where(Heat.id == heat_id).options(selectinload(Heat.lanes))
    )
    heat_out = res.scalar_one()

    if heat_out.status == "completed":
        await event_bus.publish(
            "heat_complete",
            {
                "heat_id": heat_out.id,
                "race_id": heat_out.race_id,
                "heat_number": heat_out.heat_number,
                "status": heat_out.status,
                "lanes": [
                    {
                        "lane_number": hl.lane_number,
                        "racer_id": hl.racer_id,
                        "time_microseconds": hl.time_microseconds,
                        "place": hl.place,
                    }
                    for hl in heat_out.lanes
                ],
            },
        )

    return heat_out


@router.delete("/heats/{heat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_heat(heat_id: int, session: AsyncSession = Depends(get_db_session)) -> None:
    res = await session.execute(
        select(Heat).where(Heat.id == heat_id).options(selectinload(Heat.lanes))
    )
    heat = res.scalar_one_or_none()
    if heat is None:
        raise HTTPException(status_code=404, detail="Heat not found")

    race_id = heat.race_id

    await session.delete(heat)
    await session.commit()

    # Renumber remaining heats so heat_number stays sequential.
    res = await session.execute(
        select(Heat).where(Heat.race_id == race_id).order_by(Heat.heat_number)
    )
    remaining = list(res.scalars().all())

    # Use a two-phase renumber to avoid UNIQUE constraint collisions.
    if remaining:
        max_num = max(h.heat_number for h in remaining)
        temp_base = max_num + 1000
        for idx, h in enumerate(remaining, start=1):
            h.heat_number = temp_base + idx
        await session.flush()
        for idx, h in enumerate(remaining, start=1):
            h.heat_number = idx
        await session.commit()

    # Recalculate race results since a heat was removed.
    await recalculate_race_results(session, race_id)
    await session.commit()


@router.post("/heats/{heat_id}/repeat", response_model=HeatWithLanesRead, status_code=status.HTTP_201_CREATED)
async def repeat_heat(heat_id: int, session: AsyncSession = Depends(get_db_session)) -> Heat:
    res = await session.execute(
        select(Heat).where(Heat.id == heat_id).options(selectinload(Heat.lanes))
    )
    heat = res.scalar_one_or_none()
    if heat is None:
        raise HTTPException(status_code=404, detail="Heat not found")

    max_num = await session.scalar(
        select(func.max(Heat.heat_number)).where(Heat.race_id == heat.race_id)
    )
    next_num = int(max_num or 0) + 1

    new_heat = Heat(
        race_id=heat.race_id,
        heat_number=next_num,
        status="pending",
    )
    new_heat.lanes = [
        HeatLane(lane_number=hl.lane_number, racer_id=hl.racer_id) for hl in heat.lanes
    ]

    session.add(new_heat)
    await session.commit()

    res = await session.execute(
        select(Heat).where(Heat.id == new_heat.id).options(selectinload(Heat.lanes))
    )
    return res.scalar_one()


@router.get("/races/{race_id}/export/pdf")
async def export_race_results_pdf(
    race_id: int,
    group_id: int | None = Query(default=None),
    page_size: str = Query(default="letter", pattern="^(letter|a4)$"),
    orientation: str = Query(default="landscape", pattern="^(portrait|landscape)$"),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    race = await session.get(Race, race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    scope_label = "Overall"
    if group_id is not None:
        grp = await session.get(Group, group_id)
        if grp is None:
            raise HTTPException(status_code=404, detail="Group not found")
        scope_label = f"Group: {grp.name}"

    num_heats = await session.scalar(select(func.count(Heat.id)).where(Heat.race_id == race_id))

    res = await session.execute(
        select(func.distinct(HeatLane.racer_id))
        .join(Heat, Heat.id == HeatLane.heat_id)
        .where(Heat.race_id == race_id)
        .where(HeatLane.racer_id.is_not(None))
    )
    racer_ids = [int(rid) for (rid,) in res.all() if rid is not None]

    if group_id is not None and racer_ids:
        res = await session.execute(
            select(Racer.id).where(Racer.id.in_(racer_ids)).where(Racer.group_id == group_id)
        )
        racer_ids = [int(rid) for (rid,) in res.all()]

    res = await session.execute(select(RaceResult).where(RaceResult.race_id == race_id))
    results_by_racer = {rr.racer_id: rr for rr in res.scalars().all()}

    racers: list[Racer] = []
    if racer_ids:
        res = await session.execute(select(Racer).where(Racer.id.in_(racer_ids)).order_by(Racer.id))
        racers = list(res.scalars().all())

    res = await session.execute(
        select(HeatLane.racer_id, HeatLane.time_microseconds)
        .join(Heat, Heat.id == HeatLane.heat_id)
        .where(Heat.race_id == race_id)
        .where(Heat.status == "completed")
        .where(HeatLane.racer_id.is_not(None))
        .where(HeatLane.time_microseconds.is_not(None))
    )
    times_by_racer: dict[int, list[int]] = {}
    for racer_id, time_us in res.all():
        if racer_id is None or time_us is None:
            continue
        rid = int(racer_id)
        times_by_racer.setdefault(rid, []).append(int(time_us))

    group_place: dict[int, int] = {}
    if group_id is not None:
        scored = []
        for r in racers:
            rr = results_by_racer.get(r.id)
            avg = rr.average_time if rr is not None else None
            if avg is None:
                continue
            scored.append((int(avg), int(rr.best_time or avg), r.id))
        scored.sort()
        for idx, (_avg, _best, rid) in enumerate(scored, start=1):
            group_place[rid] = idx

    rows: list[RaceResultsRow] = []
    for r in racers:
        rr = results_by_racer.get(r.id)
        times = sorted(times_by_racer.get(r.id, []))
        times_str = ", ".join(format_time_us(t) for t in times)

        if group_id is not None:
            place = str(group_place.get(r.id, ""))
        else:
            place = str(rr.overall_place) if (rr is not None and rr.overall_place is not None) else ""

        avg_us = rr.average_time if rr is not None else None
        avg_str = format_time_us(int(avg_us)) if avg_us is not None else ""

        car = ""
        if r.car_name and r.car_number:
            car = f"{r.car_name} (#{r.car_number})"
        elif r.car_name:
            car = r.car_name
        elif r.car_number:
            car = f"#{r.car_number}"

        rows.append(
            RaceResultsRow(
                place=place,
                name=r.name,
                car=car,
                group=(r.group.name if r.group else ""),
                times=times_str,
                average=avg_str,
            )
        )

    def _sort_key(row: RaceResultsRow):
        if row.place.isdigit():
            return (0, int(row.place))
        return (1, row.name.lower())

    rows.sort(key=_sort_key)

    pdf_bytes = generate_race_results_pdf(
        meta=RaceResultsPDFMeta(
            event_name=race.name,
            generated_at=_utcnow(),
            race_date=race.created_at,
            num_heats=int(num_heats) if num_heats is not None else None,
            scope_label=scope_label,
        ),
        rows=rows,
        page_size=page_size,  # type: ignore[arg-type]
        orientation=orientation,  # type: ignore[arg-type]
    )

    filename = f"race-{race_id}-results.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
