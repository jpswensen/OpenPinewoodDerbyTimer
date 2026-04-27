from __future__ import annotations

import csv
import io
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import get_db_session
from app.models.models import Group, Racer

router = APIRouter(prefix="/api", tags=["import/export"])


@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...), session: AsyncSession = Depends(get_db_session)
) -> dict[str, Any]:
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a header row")

    def get_field(row: dict[str, str], *names: str) -> str:
        for n in names:
            if n in row and row[n] is not None:
                return str(row[n])
        return ""

    groups_created = 0
    racers_created = 0
    errors: list[dict[str, Any]] = []

    group_cache: dict[str, int] = {}

    for idx, row in enumerate(reader, start=2):
        name = get_field(row, "name", "Name").strip()
        if not name:
            errors.append({"row": idx, "error": "missing name"})
            continue

        car_name = get_field(row, "car_name", "Car Name", "car").strip() or None
        car_number = get_field(row, "car_number", "Car Number", "number").strip() or None
        group_name = get_field(row, "group", "group_name", "Group").strip()

        group_id: int | None = None
        if group_name:
            if group_name in group_cache:
                group_id = group_cache[group_name]
            else:
                res = await session.execute(select(Group).where(Group.name == group_name))
                g = res.scalar_one_or_none()
                if g is None:
                    g = Group(name=group_name)
                    session.add(g)
                    await session.flush()  # assign g.id
                    groups_created += 1
                group_cache[group_name] = g.id
                group_id = g.id

        session.add(
            Racer(
                name=name,
                car_name=car_name,
                car_number=car_number,
                group_id=group_id,
            )
        )
        racers_created += 1

    await session.commit()

    return {
        "groups_created": groups_created,
        "racers_created": racers_created,
        "errors": errors,
    }


@router.get("/export/csv")
async def export_csv(session: AsyncSession = Depends(get_db_session)) -> Response:
    res = await session.execute(select(Racer).order_by(Racer.id))
    racers = list(res.scalars().all())

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["name", "car_name", "car_number", "group"])
    for r in racers:
        writer.writerow(
            [
                r.name,
                r.car_name or "",
                r.car_number or "",
                (r.group.name if r.group else ""),
            ]
        )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=racers.csv"},
    )


@router.post("/reset-all-data")
async def reset_all_data(session: AsyncSession = Depends(get_db_session)) -> dict[str, str]:
    """Delete all data from every table, preserving the schema."""
    # Delete in FK-safe order
    await session.execute(text("DELETE FROM race_results"))
    await session.execute(text("DELETE FROM heat_lanes"))
    await session.execute(text("DELETE FROM heats"))
    await session.execute(text("DELETE FROM races"))
    await session.execute(text("DELETE FROM racers"))
    await session.execute(text("DELETE FROM groups"))
    await session.commit()
    return {"status": "ok"}
