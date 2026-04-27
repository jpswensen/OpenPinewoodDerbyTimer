from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db_session
from app.models.models import Group, Racer
from app.models.schemas import RacerCreate, RacerRead, RacerUpdate

router = APIRouter(prefix="/api/racers", tags=["racers"])


async def _validate_group_id(group_id: int | None, session: AsyncSession) -> None:
    if group_id is None:
        return
    g = await session.get(Group, group_id)
    if g is None:
        raise HTTPException(status_code=400, detail=f"Unknown group_id: {group_id}")


@router.get("", response_model=list[RacerRead])
async def list_racers(
    group_id: int | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> list[Racer]:
    stmt = select(Racer).order_by(Racer.id)
    if group_id is not None:
        stmt = stmt.where(Racer.group_id == group_id)
    res = await session.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=RacerRead, status_code=status.HTTP_201_CREATED)
async def create_racer(
    payload: RacerCreate, session: AsyncSession = Depends(get_db_session)
) -> Racer:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Racer name is required")

    await _validate_group_id(payload.group_id, session)

    r = Racer(
        name=name,
        car_name=payload.car_name,
        car_number=payload.car_number,
        group_id=payload.group_id,
        disabled=payload.disabled,
    )
    session.add(r)
    await session.commit()
    await session.refresh(r)
    return r


@router.post("/bulk", response_model=list[RacerRead], status_code=status.HTTP_201_CREATED)
async def bulk_create_racers(
    payload: list[RacerCreate], session: AsyncSession = Depends(get_db_session)
) -> list[Racer]:
    if not payload:
        return []

    group_ids = {p.group_id for p in payload if p.group_id is not None}
    if group_ids:
        res = await session.execute(select(Group.id).where(Group.id.in_(group_ids)))
        found = set(res.scalars().all())
        missing = sorted(group_ids - found)
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown group_ids: {missing}")

    racers: list[Racer] = []
    for p in payload:
        name = p.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Racer name is required")
        racers.append(
            Racer(
                name=name,
                car_name=p.car_name,
                car_number=p.car_number,
                group_id=p.group_id,
            )
        )

    session.add_all(racers)
    await session.commit()
    for r in racers:
        await session.refresh(r)
    return racers


@router.put("/{racer_id}", response_model=RacerRead)
async def update_racer(
    racer_id: int, payload: RacerUpdate, session: AsyncSession = Depends(get_db_session)
) -> Racer:
    r = await session.get(Racer, racer_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Racer not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Racer name is required")
        r.name = name

    if payload.car_name is not None:
        r.car_name = payload.car_name
    if payload.car_number is not None:
        r.car_number = payload.car_number

    # group_id is nullable: explicit None means "unassign". Use model_fields_set
    # to distinguish "field omitted" from "field explicitly set to null".
    if "group_id" in payload.model_fields_set:
        await _validate_group_id(payload.group_id, session)
        r.group_id = payload.group_id

    if payload.disabled is not None:
        r.disabled = payload.disabled

    await session.commit()
    await session.refresh(r)
    return r


@router.delete("/{racer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_racer(racer_id: int, session: AsyncSession = Depends(get_db_session)) -> None:
    r = await session.get(Racer, racer_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Racer not found")

    await session.delete(r)
    await session.commit()
