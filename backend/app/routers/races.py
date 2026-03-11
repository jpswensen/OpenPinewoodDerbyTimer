from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import get_db_session
from app.models.models import Heat, HeatLane, Race, RaceResult, Racer
from app.models.schemas import HeatWithLanesRead, RaceCreate, RaceRead, RaceUpdate
from app.services.event_bus import event_bus
from app.services.heat_scheduler import generate_round_robin_heats
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

    stmt = select(Racer.id).order_by(Racer.id)
    if group_id is not None:
        stmt = stmt.where(Racer.group_id == group_id)
    res = await session.execute(stmt)
    racer_ids = list(res.scalars().all())
    if not racer_ids:
        raise HTTPException(status_code=400, detail="No racers available to schedule")

    # Replace existing schedule/results.
    await session.execute(delete(RaceResult).where(RaceResult.race_id == race_id))
    await session.execute(delete(Heat).where(Heat.race_id == race_id))

    schedule = generate_round_robin_heats(racer_ids, race.num_lanes)

    heats: list[Heat] = []
    for heat_number, lane_assignments in enumerate(schedule, start=1):
        heat = Heat(race_id=race_id, heat_number=heat_number, status="pending")
        heat.lanes = [
            HeatLane(
                lane_number=lane_idx + 1,
                racer_id=lane_assignments[lane_idx],
            )
            for lane_idx in range(race.num_lanes)
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


class HeatLaneTimeUpdate(BaseModel):
    lane_number: int
    time_microseconds: int | None = None


class HeatUpdateRequest(BaseModel):
    status: str | None = None
    lanes: list[HeatLaneTimeUpdate] | None = None


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

    if payload.lanes is not None:
        lanes_by_num = {hl.lane_number: hl for hl in heat.lanes}
        for upd in payload.lanes:
            hl = lanes_by_num.get(upd.lane_number)
            if hl is None:
                raise HTTPException(status_code=400, detail=f"Unknown lane_number: {upd.lane_number}")
            hl.time_microseconds = upd.time_microseconds

        # Recompute per-heat place ordering.
        finished = [
            hl
            for hl in heat.lanes
            if hl.racer_id is not None and hl.time_microseconds is not None
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


@router.post("/heats/{heat_id}/repeat", response_model=HeatWithLanesRead, status_code=201)
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
        scheduled_at=_utcnow(),
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
