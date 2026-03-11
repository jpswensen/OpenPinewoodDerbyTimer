"""Comprehensive tests for certificate generation."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from app.services.certificate_generator import (
    Certificate,
    CertificateMeta,
    _ordinal,
    generate_certificates_pdf,
)


class TestOrdinal:
    def test_first(self):
        assert _ordinal(1) == "1st"

    def test_second(self):
        assert _ordinal(2) == "2nd"

    def test_third(self):
        assert _ordinal(3) == "3rd"

    def test_fourth(self):
        assert _ordinal(4) == "4th"

    def test_eleventh(self):
        assert _ordinal(11) == "11th"

    def test_twelfth(self):
        assert _ordinal(12) == "12th"

    def test_thirteenth(self):
        assert _ordinal(13) == "13th"

    def test_twenty_first(self):
        assert _ordinal(21) == "21st"

    def test_twenty_second(self):
        assert _ordinal(22) == "22nd"

    def test_hundred_and_first(self):
        assert _ordinal(101) == "101st"

    def test_hundred_and_eleventh(self):
        assert _ordinal(111) == "111th"


class TestGenerateCertificatesPDF:
    @pytest.fixture()
    def meta(self) -> CertificateMeta:
        return CertificateMeta(
            event_name="Pack 123 Pinewood Derby",
            event_date=date(2026, 3, 15),
            generated_at=datetime.now(timezone.utc),
            issued_by="Pack 123",
        )

    def test_winner_certificate(self, meta):
        cert = Certificate(
            certificate_type="winner",
            scope="overall",
            recipient_name="Alice Smith",
            car_name="Speedy Gonzalez",
            car_number="7",
            place=1,
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert isinstance(pdf, bytes)
        assert pdf.startswith(b"%PDF")

    def test_participation_certificate(self, meta):
        cert = Certificate(
            certificate_type="participation",
            scope="participation",
            recipient_name="Bob Jones",
            car_name="The Rocket",
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert pdf.startswith(b"%PDF")

    def test_group_winner_certificate(self, meta):
        cert = Certificate(
            certificate_type="winner",
            scope="group",
            recipient_name="Charlie Brown",
            place=2,
            group_name="Tigers",
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert pdf.startswith(b"%PDF")

    def test_custom_message(self, meta):
        cert = Certificate(
            certificate_type="participation",
            scope="participation",
            recipient_name="Dave",
            custom_message="Great effort! Keep building!",
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert pdf.startswith(b"%PDF")

    def test_multiple_certificates_per_pdf(self, meta):
        certs = [
            Certificate(
                certificate_type="winner", scope="overall",
                recipient_name=f"Racer {i}", place=i,
            )
            for i in range(1, 4)
        ]
        pdf = generate_certificates_pdf(meta=meta, certificates=certs)
        assert pdf.startswith(b"%PDF")
        # Multiple pages = larger PDF
        single = generate_certificates_pdf(meta=meta, certificates=[certs[0]])
        assert len(pdf) > len(single)

    def test_all_page_size_orientations(self, meta):
        cert = Certificate(
            certificate_type="winner", scope="overall",
            recipient_name="Test", place=1,
        )
        for ps in ("letter", "a4"):
            for orient in ("portrait", "landscape"):
                pdf = generate_certificates_pdf(
                    meta=meta, certificates=[cert],
                    page_size=ps, orientation=orient,
                )
                assert pdf.startswith(b"%PDF")

    def test_no_event_date(self):
        meta = CertificateMeta(
            event_name="Test",
            event_date=None,
            generated_at=datetime.now(timezone.utc),
        )
        cert = Certificate(
            certificate_type="participation", scope="participation",
            recipient_name="Test Racer",
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert pdf.startswith(b"%PDF")

    def test_empty_certificates_list(self, meta):
        pdf = generate_certificates_pdf(meta=meta, certificates=[])
        assert pdf.startswith(b"%PDF")

    def test_minimal_certificate_fields(self, meta):
        cert = Certificate(
            certificate_type="participation",
            scope="participation",
            recipient_name="Name Only",
        )
        pdf = generate_certificates_pdf(meta=meta, certificates=[cert])
        assert pdf.startswith(b"%PDF")
