from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Literal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

PageSizeName = Literal["letter", "a4"]
PageOrientation = Literal["portrait", "landscape"]


@dataclass(frozen=True)
class RaceResultsPDFMeta:
    event_name: str
    generated_at: datetime
    race_date: datetime | None
    num_heats: int | None
    scope_label: str


@dataclass(frozen=True)
class RaceResultsRow:
    place: str
    name: str
    car: str
    group: str
    times: str
    average: str


def format_time_us(time_us: int | None) -> str:
    if time_us is None:
        return ""
    # Store/compute in microseconds; display in seconds with 4 decimals.
    return f"{(time_us / 1_000_000):.4f}"


def _resolve_pagesize(page_size: PageSizeName, orientation: PageOrientation):
    if page_size == "a4":
        base = A4
    else:
        base = LETTER

    return landscape(base) if orientation == "landscape" else portrait(base)


def generate_race_results_pdf(
    *,
    meta: RaceResultsPDFMeta,
    rows: Iterable[RaceResultsRow],
    page_size: PageSizeName = "letter",
    orientation: PageOrientation = "landscape",
) -> bytes:
    """Generate a race results PDF.

    Uses ReportLab; returns raw PDF bytes.
    """

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=_resolve_pagesize(page_size, orientation),
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
        title=f"{meta.event_name} Results",
    )

    styles = getSampleStyleSheet()
    h1 = styles["Title"]
    h2 = styles["Heading2"]
    body = styles["BodyText"]

    elements = []

    header_left = [
        Paragraph("PWDTimer", h1),
        Paragraph("Race Results", h2),
    ]

    # Simple logo placeholder box.
    logo_box = Table([["Logo"]], colWidths=[120], rowHeights=[50])
    logo_box.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1, colors.black),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.grey),
            ]
        )
    )

    header = Table([[header_left, logo_box]], colWidths=[doc.width - 140, 140])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(header)
    elements.append(Spacer(1, 12))

    meta_lines: list[str] = [
        f"Event: {meta.event_name}",
        f"Generated: {meta.generated_at.isoformat(timespec='seconds')}",
        f"Scope: {meta.scope_label}",
    ]
    if meta.race_date is not None:
        meta_lines.append(f"Race date: {meta.race_date.isoformat(timespec='seconds')}")
    if meta.num_heats is not None:
        meta_lines.append(f"Heats: {meta.num_heats}")

    for line in meta_lines:
        elements.append(Paragraph(line, body))
    elements.append(Spacer(1, 12))

    data = [["Place", "Name", "Car", "Group", "Times (s)", "Average (s)"]]
    for r in rows:
        data.append([r.place, r.name, r.car, r.group, r.times, r.average])

    table = Table(
        data,
        colWidths=[40, 140, 120, 110, doc.width - (40 + 140 + 120 + 110 + 90), 90],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
            ]
        )
    )
    elements.append(table)

    doc.build(elements)
    return buf.getvalue()
