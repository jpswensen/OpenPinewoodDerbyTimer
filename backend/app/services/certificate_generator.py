from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Literal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, LETTER, landscape, portrait
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PageSizeName = Literal["letter", "a4"]
PageOrientation = Literal["portrait", "landscape"]
CertificateType = Literal["winner", "participation"]
CertificateScope = Literal["overall", "group", "participation"]


@dataclass(frozen=True)
class CertificateMeta:
    event_name: str
    generated_at: datetime
    event_date: date | None = None
    issued_by: str = "PWDTimer"


@dataclass(frozen=True)
class Certificate:
    certificate_type: CertificateType
    scope: CertificateScope
    recipient_name: str
    car_name: str | None = None
    car_number: str | None = None
    place: int | None = None
    group_name: str | None = None
    custom_message: str | None = None


def _resolve_pagesize(page_size: PageSizeName, orientation: PageOrientation):
    base = A4 if page_size == "a4" else LETTER
    return landscape(base) if orientation == "landscape" else portrait(base)


def _try_register_fonts() -> None:
    """Register optional bundled fonts, if present.

    The PRD mentions decorative fonts (e.g., Great Vibes). We do not fetch fonts at runtime;
    instead, we opportunistically register font files if the repo provides them.
    """

    fonts_dir = Path(__file__).resolve().parent / ".." / "assets" / "fonts"
    fonts_dir = fonts_dir.resolve()
    if not fonts_dir.exists():
        return

    candidates = [
        ("GreatVibes", fonts_dir / "GreatVibes-Regular.ttf"),
        ("PlayfairDisplay", fonts_dir / "PlayfairDisplay-Regular.ttf"),
    ]
    for name, path in candidates:
        try:
            if path.exists() and name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont(name, str(path)))
        except Exception:
            # Fonts are purely cosmetic; fall back to built-in fonts.
            continue


def _ordinal(n: int) -> str:
    if 10 <= (n % 100) <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _safe_line(*parts: str | None) -> str:
    return " ".join([p.strip() for p in parts if p and p.strip()])


def _draw_border(c: canvas.Canvas, w: float, h: float) -> None:
    margin = 36

    c.setStrokeColor(colors.HexColor("#111827"))
    c.setLineWidth(3)
    c.rect(margin, margin, w - 2 * margin, h - 2 * margin)

    c.setStrokeColor(colors.HexColor("#d1a25a"))
    c.setLineWidth(1.5)
    c.rect(margin + 12, margin + 12, w - 2 * (margin + 12), h - 2 * (margin + 12))

    # Corner accents
    c.setStrokeColor(colors.HexColor("#d1a25a"))
    c.setLineWidth(2)
    corner = 22
    inset = margin + 12
    for (x0, y0, sx, sy) in [
        (inset, inset, 1, 1),
        (w - inset, inset, -1, 1),
        (inset, h - inset, 1, -1),
        (w - inset, h - inset, -1, -1),
    ]:
        c.line(x0, y0, x0 + sx * corner, y0)
        c.line(x0, y0, x0, y0 + sy * corner)


def _draw_seal(c: canvas.Canvas, w: float) -> None:
    r = 42
    x = w - 96
    y = 96
    c.setStrokeColor(colors.HexColor("#111827"))
    c.setFillColor(colors.HexColor("#f3f4f6"))
    c.setLineWidth(2)
    c.circle(x, y, r, stroke=1, fill=1)

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(colors.HexColor("#111827"))
    c.drawCentredString(x, y + 6, "PWDTimer")
    c.setFont("Helvetica", 8)
    c.drawCentredString(x, y - 8, "Official")


def _draw_certificate_page(
    c: canvas.Canvas,
    *,
    pagesize: tuple[float, float],
    meta: CertificateMeta,
    cert: Certificate,
) -> None:
    w, h = pagesize
    _draw_border(c, w, h)
    _draw_seal(c, w)

    title = (
        "Certificate of Achievement" if cert.certificate_type == "winner" else "Certificate of Participation"
    )

    # Title
    c.setFillColor(colors.HexColor("#111827"))
    c.setFont("Helvetica-Bold", 34)
    c.drawCentredString(w / 2, h - 120, title)

    # Subtitle
    c.setFont("Helvetica", 14)
    c.setFillColor(colors.HexColor("#374151"))
    c.drawCentredString(w / 2, h - 150, "This certifies that")

    # Recipient name (use decorative font if available)
    name_font = "GreatVibes" if "GreatVibes" in pdfmetrics.getRegisteredFontNames() else "Times-BoldItalic"
    c.setFont(name_font, 44)
    c.setFillColor(colors.HexColor("#111827"))
    c.drawCentredString(w / 2, h - 220, cert.recipient_name)

    # Details
    c.setFont("Helvetica", 14)
    c.setFillColor(colors.HexColor("#374151"))

    detail_lines: list[str] = []
    if cert.certificate_type == "winner":
        place = _ordinal(cert.place or 1)
        if cert.scope == "group" and cert.group_name:
            scope_line = f"{place} Place in {cert.group_name}"
        else:
            scope_line = f"{place} Place Overall"
        detail_lines.append(f"For earning {scope_line} at {meta.event_name}.")
    else:
        detail_lines.append(f"In recognition of participation in {meta.event_name}.")

    car_line = _safe_line(
        "Car:",
        cert.car_name,
        f"#{cert.car_number}" if cert.car_number else None,
    )
    if car_line and car_line != "Car:":
        detail_lines.append(car_line)

    if cert.custom_message:
        detail_lines.append(cert.custom_message)

    y = h - 280
    for line in detail_lines:
        c.drawCentredString(w / 2, y, line)
        y -= 22

    # Footer (date + signatures)
    footer_y = 140
    c.setStrokeColor(colors.HexColor("#9ca3af"))
    c.setLineWidth(1)

    c.line(w * 0.2, footer_y, w * 0.45, footer_y)
    c.line(w * 0.55, footer_y, w * 0.8, footer_y)

    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#6b7280"))
    c.drawCentredString(w * 0.325, footer_y - 14, "Race Director")
    c.drawCentredString(w * 0.675, footer_y - 14, "Committee")

    if meta.event_date is not None:
        c.drawCentredString(w / 2, 110, f"Date: {meta.event_date.isoformat()}")

    c.setFont("Helvetica", 9)
    c.drawCentredString(w / 2, 88, f"Issued by {meta.issued_by} • Generated {meta.generated_at.isoformat(timespec='seconds')}")


def generate_certificates_pdf(
    *,
    meta: CertificateMeta,
    certificates: Iterable[Certificate],
    page_size: PageSizeName = "letter",
    orientation: PageOrientation = "landscape",
) -> bytes:
    """Generate one certificate per page and return raw PDF bytes."""

    _try_register_fonts()
    pagesize = _resolve_pagesize(page_size, orientation)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=pagesize)
    for cert in certificates:
        _draw_certificate_page(c, pagesize=pagesize, meta=meta, cert=cert)
        c.showPage()
    c.save()
    return buf.getvalue()
