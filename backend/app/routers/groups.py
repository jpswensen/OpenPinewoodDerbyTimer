from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db_session
from app.models.models import Group, Racer
from app.models.schemas import GroupCreate, GroupRead, GroupUpdate

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=list[GroupRead])
async def list_groups(session: AsyncSession = Depends(get_db_session)) -> list[Group]:
    res = await session.execute(select(Group).order_by(Group.id))
    return list(res.scalars().all())


@router.post("", response_model=GroupRead, status_code=status.HTTP_201_CREATED)
async def create_group(
    payload: GroupCreate, session: AsyncSession = Depends(get_db_session)
) -> Group:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    g = Group(name=name, description=payload.description)
    session.add(g)
    await session.commit()
    await session.refresh(g)
    return g


@router.put("/{group_id}", response_model=GroupRead)
async def update_group(
    group_id: int, payload: GroupUpdate, session: AsyncSession = Depends(get_db_session)
) -> Group:
    g = await session.get(Group, group_id)
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Group name is required")
        g.name = name
    if payload.description is not None:
        g.description = payload.description

    await session.commit()
    await session.refresh(g)
    return g


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(group_id: int, session: AsyncSession = Depends(get_db_session)) -> None:
    g = await session.get(Group, group_id)
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")

    # Keep racers; un-assign them from this group.
    await session.execute(
        update(Racer).where(Racer.group_id == group_id).values(group_id=None)
    )
    await session.delete(g)
    await session.commit()
