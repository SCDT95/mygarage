"""Tests for service history PDF report generation."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import fitz  # PyMuPDF

from app.utils.pdf_generator import PDFReportGenerator


def _extract_text(pdf_bytes: bytes) -> str:
    """Extract all text from PDF bytes using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()  # type: ignore[operator]
    doc.close()
    return text


class TestGenerateServiceHistoryPdf:
    """Tests for PDFReportGenerator.generate_service_history_pdf."""

    def test_service_history_pdf_renders_real_line_item_text(self) -> None:
        """The Description column used to print 'N/A' on every row — `description`
        was never a key the caller passes. PR #145 put service_type (which holds
        item.description) there instead.
        """
        generator = PDFReportGenerator(currency_code="USD", locale="en_US")
        buf = generator.generate_service_history_pdf(
            {
                "vin": "1HGBH41JXMN109186",
                "year": 2018,
                "make": "Honda",
                "model": "Accord",
                "license_plate": "TEST-123",
            },
            [
                {
                    "date": date(2024, 3, 1),
                    "odometer_km": Decimal("19312"),
                    "service_category": "Maintenance",
                    "service_type": "5W-30 synthetic, filter replaced",
                    "cost": Decimal("45.99"),
                    "vendor_name": "Jiffy Lube",
                }
            ],
            None,
            None,
        )
        text = _extract_text(buf.read())
        assert "5W-30 synthetic" in text
        assert "Maintenance" in text
        assert "N/A" not in text

    def test_service_history_pdf_does_not_branch_on_language(self) -> None:
        """The de-only branch helped one locale and left fr/pl/ru/uk on US format."""
        source = Path("app/utils/pdf_generator.py").read_text()
        assert 'if "de" in self.locale' not in source
