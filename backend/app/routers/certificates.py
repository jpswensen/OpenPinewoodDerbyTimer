from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import get_db_session
from app.models.models import Group, Heat, HeatLane, Race, RaceResult, Racer
from app.services.certificate_generator import (
    Certificate,
    CertificateMeta,
    PageOrientation,
    PageSizeName,
    generate_certificates_pdf,
)

router = APIRouter(prefix="/api/certificates", tags=["certificates"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CertificatesGenerateRequest(BaseModel):
    race_id: int
    mode: Literal["winners", "participants"] = "winners"

    # Winners options
    places: list[int] = Field(default_factory=lambda: [1, 2, 3])
    include_overall: bool = True
    include_per_group: bool = True

    # Recipient filters
    group_id: int | None = None
    racer_ids: list[int] | None = None

    # Presentation
    event_name: str | None = None
    event_date: date | None = None
    issued_by: str = "PWDTimer"
    custom_message: str | None = None

    # PDF output
    page_size: PageSizeName = "letter"
    orientation: PageOrientation = "landscape"


@router.get("/preview")
async def preview_certificate(
    type: Literal["winner", "participation"] = Query(default="winner"),
    place: int = Query(default=1, ge=1),
) -> Response:
    meta = CertificateMeta(
        event_name="Sample Event",
        event_date=date.today(),
        generated_at=_utcnow(),
        issued_by="PWDTimer",
    )

    cert = Certificate(
        certificate_type=type,
        scope="overall" if type == "winner" else "participation",
        recipient_name="Alex Racer",
        car_name="Lightning",
        car_number="7",
        place=place if type == "winner" else None,
        group_name="Tigers" if type == "winner" else None,
        custom_message=None,
    )

    pdf = generate_certificates_pdf(meta=meta, certificates=[cert], page_size="letter", orientation="landscape")
    return Response(content=pdf, media_type="application/pdf")


@router.post("/generate")
async def generate_certificates(
    payload: CertificatesGenerateRequest, session: AsyncSession = Depends(get_db_session)
) -> Response:
    race = await session.get(Race, payload.race_id)
    if race is None:
        raise HTTPException(status_code=404, detail="Race not found")

    event_name = (payload.event_name or race.name).strip() or race.name
    meta = CertificateMeta(
        event_name=event_name,
        event_date=payload.event_date or date.today(),
        generated_at=_utcnow(),
        issued_by=payload.issued_by,
    )

    certs: list[Certificate] = []

    if payload.mode == "participants":
        racer_ids_stmt = (
            select(distinct(HeatLane.racer_id))
            .join(Heat, Heat.id == HeatLane.heat_id)
            .where(Heat.race_id == payload.race_id)
            .where(HeatLane.racer_id.is_not(None))
        )
        res = await session.execute(racer_ids_stmt)
        racer_ids = [int(rid) for (rid,) in res.all() if rid is not None]

        if payload.racer_ids is not None:
            allowed = set(payload.racer_ids)
            racer_ids = [rid for rid in racer_ids if rid in allowed]

        if not racer_ids:
            raise HTTPException(status_code=400, detail="No participants available for certificates")

        res = await session.execute(
            select(Racer)
            .where(Racer.id.in_(racer_ids))
            .options(selectinload(Racer.group))
            .order_by(Racer.id)
        )
        racers = list(res.scalars().all())

        if payload.group_id is not None:
            racers = [r for r in racers if r.group_id == payload.group_id]

        for r in racers:
            certs.append(
                Certificate(
                    certificate_type="participation",
                    scope="participation",
                    recipient_name=r.name,
                    car_name=r.car_name,
                    car_number=r.car_number,
                    group_name=r.group.name if r.group is not None else None,
                    custom_message=payload.custom_message,
                )
            )

    else:  # winners
        places = sorted({p for p in payload.places if p >= 1})
        if not places:
            raise HTTPException(status_code=400, detail="places must include at least one positive integer")

        # Overall winners
        if payload.include_overall:
            stmt = (
                select(RaceResult, Racer)
                .join(Racer, Racer.id == RaceResult.racer_id)
                .where(RaceResult.race_id == payload.race_id)
                .where(RaceResult.overall_place.in_(places))
                .where(RaceResult.average_time.is_not(None))
                .order_by(RaceResult.overall_place.asc())
            )
            res = await session.execute(stmt)
            for rr, r in res.all():
                if payload.racer_ids is not None and r.id not in set(payload.racer_ids):
                    continue
                if payload.group_id is not None and r.group_id != payload.group_id:
                    continue
                certs.append(
                    Certificate(
                        certificate_type="winner",
                        scope="overall",
                        recipient_name=r.name,
                        car_name=r.car_name,
                        car_number=r.car_number,
                        place=int(rr.overall_place or 1),
                        group_name=None,
                        custom_message=payload.custom_message,
                    )
                )

        # Per-group winners
        if payload.include_per_group:
            group_ids_stmt = (
                select(distinct(Racer.group_id))
                .join(RaceResult, RaceResult.racer_id == Racer.id)
                .where(RaceResult.race_id == payload.race_id)
                .where(Racer.group_id.is_not(None))
                .where(RaceResult.average_time.is_not(None))
            )
            res = await session.execute(group_ids_stmt)
            group_ids = [int(gid) for (gid,) in res.all() if gid is not None]
            if payload.group_id is not None:
                group_ids = [gid for gid in group_ids if gid == payload.group_id]

            for gid in sorted(group_ids):
                group = await session.get(Group, gid)
                if group is None:
                    continue

                stmt = (
                    select(RaceResult, Racer)
                    .join(Racer, Racer.id == RaceResult.racer_id)
                    .where(RaceResult.race_id == payload.race_id)
                    .where(Racer.group_id == gid)
                    .where(RaceResult.average_time.is_not(None))
                    .order_by(RaceResult.average_time.asc(), RaceResult.best_time.asc(), Racer.id.asc())
                )
                res = await session.execute(stmt)
                ranked = [(rr, r) for rr, r in res.all()]

                if payload.racer_ids is not None:
                    allowed = set(payload.racer_ids)
                    ranked = [(rr, r) for rr, r in ranked if r.id in allowed]

                for place in places:
                    idx = place - 1
                    if idx < 0 or idx >= len(ranked):
                        continue
                    rr, r = ranked[idx]
                    certs.append(
                        Certificate(
                            certificate_type="winner",
                            scope="group",
                            recipient_name=r.name,
                            car_name=r.car_name,
                            car_number=r.car_number,
                            place=place,
                            group_name=group.name,
                            custom_message=payload.custom_message,
                        )
                    )

        if not certs:
            raise HTTPException(status_code=400, detail="No winners available for certificates")

    pdf = generate_certificates_pdf(
        meta=meta,
        certificates=certs,
        page_size=payload.page_size,
        orientation=payload.orientation,
    )

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=certificates.pdf"},
    )
