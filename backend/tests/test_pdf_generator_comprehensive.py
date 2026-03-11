"""Comprehensive tests for PDF generation."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.pdf_generator import (
    RaceResultsPDFMeta,
    RaceResultsRow,
    format_time_us,
    generate_race_results_pdf,
)


class TestFormatTimeUs:
    def test_none_returns_empty(self):
        assert format_time_us(None) == ""

    def test_zero(self):
        assert format_time_us(0) == "0.0000"

    def test_typical_race_time(self):
        # 3.5 seconds = 3_500_000 microseconds
        assert format_time_us(3_500_000) == "3.5000"

    def test_sub_second(self):
        assert format_time_us(500_000) == "0.5000"

    def test_precision_four_decimals(self):
        result = format_time_us(3_456_789)
        assert result == "3.4568"  # rounded to 4 decimals

    def test_large_time(self):
        # 10 seconds
        result = format_time_us(10_000_000)
        assert result == "10.0000"


class TestGenerateRaceResultsPDF:
    @pytest.fixture()
    def meta(self) -> RaceResultsPDFMeta:
        return RaceResultsPDFMeta(
            event_name="Test Derby",
            generated_at=datetime.now(timezone.utc),
            race_date=datetime.now(timezone.utc),
            num_heats=5,
            scope_label="Overall",
        )

    @pytest.fixture()
    def sample_rows(self) -> list[RaceResultsRow]:
        return [
            RaceResultsRow(place="1", name="Alice", car="Speedy", group="Tigers", times="3.5000, 3.6000", average="3.5500"),
            RaceResultsRow(place="2", name="Bob", car="Flash", group="Bears", times="3.7000, 3.8000", average="3.7500"),
            RaceResultsRow(place="3", name="Charlie", car="Bolt", group="Tigers", times="3.9000, 4.0000", average="3.9500"),
        ]

    def test_returns_valid_pdf_bytes(self, meta, sample_rows):
        pdf = generate_race_results_pdf(meta=meta, rows=sample_rows)
        assert isinstance(pdf, bytes)
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 100

    def test_empty_rows(self, meta):
        pdf = generate_race_results_pdf(meta=meta, rows=[])
        assert pdf.startswith(b"%PDF")

    def test_letter_portrait(self, meta, sample_rows):
        pdf = generate_race_results_pdf(
            meta=meta, rows=sample_rows, page_size="letter", orientation="portrait"
        )
        assert pdf.startswith(b"%PDF")

    def test_a4_landscape(self, meta, sample_rows):
        pdf = generate_race_results_pdf(
            meta=meta, rows=sample_rows, page_size="a4", orientation="landscape"
        )
        assert pdf.startswith(b"%PDF")

    def test_a4_portrait(self, meta, sample_rows):
        pdf = generate_race_results_pdf(
            meta=meta, rows=sample_rows, page_size="a4", orientation="portrait"
        )
        assert pdf.startswith(b"%PDF")

    def test_letter_landscape(self, meta, sample_rows):
        pdf = generate_race_results_pdf(
            meta=meta, rows=sample_rows, page_size="letter", orientation="landscape"
        )
        assert pdf.startswith(b"%PDF")

    def test_no_race_date(self, sample_rows):
        meta = RaceResultsPDFMeta(
            event_name="No Date Race",
            generated_at=datetime.now(timezone.utc),
            race_date=None,
            num_heats=None,
            scope_label="Test",
        )
        pdf = generate_race_results_pdf(meta=meta, rows=sample_rows)
        assert pdf.startswith(b"%PDF")

    def test_many_rows(self, meta):
        rows = [
            RaceResultsRow(
                place=str(i), name=f"Racer {i}", car=f"Car {i}",
                group="Group", times="3.5000", average="3.5000",
            )
            for i in range(1, 51)
        ]
        pdf = generate_race_results_pdf(meta=meta, rows=rows)
        assert pdf.startswith(b"%PDF")
        assert len(pdf) > 1000
