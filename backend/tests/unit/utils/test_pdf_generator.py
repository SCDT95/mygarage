"""Tests for service history PDF report generation."""

from datetime import date
from decimal import Decimal
from pathlib import Path

import fitz  # PyMuPDF

from app.constants.units import IMPERIAL_PRESET, METRIC_PRESET
from app.utils.pdf_generator import PDFReportGenerator
from app.utils.render_context import RenderContext

# See tests/unit/utils/test_pdf_vehicle_report.py's METRIC_CTX: the metric,
# no-counterpart context, under which every assertion written before these
# reports became unit-aware must still hold.
METRIC_CTX = RenderContext(units=METRIC_PRESET, show_both=False)


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
        generator = PDFReportGenerator(
            render_context=METRIC_CTX, currency_code="USD", locale="en_US"
        )
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


IMPERIAL_CTX = RenderContext(units=IMPERIAL_PRESET, show_both=False)

_VEHICLE_INFO = {
    "vin": "1HGBH41JXMN109186",
    "year": 2018,
    "make": "Honda",
    "model": "Accord",
    "license_plate": "TEST-123",
}


def _normalized_text(pdf_bytes: bytes) -> str:
    """Extracted text with every whitespace run collapsed to one space.

    The odometer header is a Paragraph in a 0.9-inch column, so
    "Odometer (km)" wraps and extracts with a newline in the middle.
    Collapsing whitespace asserts on the rendered CONTENT, not the layout.
    """
    return " ".join(_extract_text(pdf_bytes).split())


def _service_record(odometer_km: Decimal | None) -> dict:
    """One service-history row carrying `odometer_km` and nothing surprising."""
    return {
        "date": date(2024, 3, 1),
        "odometer_km": odometer_km,
        "service_category": "Maintenance",
        "service_type": "Oil change",
        "cost": Decimal("45.99"),
        "vendor_name": "Jiffy Lube",
    }


class TestOdometerColumnFollowsTheRenderContext:
    """Both odometer columns name their unit once in the header and print a
    bare number in each cell.

    Expected values computed from the distance adapters, not transcribed:
    19,312 km / 1.609344 km per mi = 11,999.92 mi, at the mi adapter's
    precision of 0 -> "12,000".
    """

    def test_service_history_header_and_cell_are_metric_under_a_metric_context(self) -> None:
        generator = PDFReportGenerator(render_context=METRIC_CTX)
        buf = generator.generate_service_history_pdf(
            _VEHICLE_INFO, [_service_record(Decimal("19312"))]
        )
        text = _normalized_text(buf.read())

        assert "Odometer (km)" in text
        assert "19,312" in text

    def test_service_history_header_and_cell_are_imperial_under_an_imperial_context(
        self,
    ) -> None:
        generator = PDFReportGenerator(render_context=IMPERIAL_CTX)
        buf = generator.generate_service_history_pdf(
            _VEHICLE_INFO, [_service_record(Decimal("19312"))]
        )
        text = _normalized_text(buf.read())

        assert "Odometer (mi)" in text
        assert "12,000" in text
        assert "Odometer (km)" not in text
        assert "19,312" not in text

    def test_sale_history_header_and_cell_are_metric_under_a_metric_context(self) -> None:
        """The sale PDF is a separate generator method with its own header
        row, so it needs its own assertion, not the service PDF's."""
        generator = PDFReportGenerator(render_context=METRIC_CTX)
        buf = generator.generate_sale_history_pdf(
            _VEHICLE_INFO, [_service_record(Decimal("19312"))]
        )
        text = _normalized_text(buf.read())

        assert "Vehicle History Summary" in text
        assert "Odometer (km)" in text
        assert "19,312" in text

    def test_sale_history_header_and_cell_are_imperial_under_an_imperial_context(self) -> None:
        generator = PDFReportGenerator(render_context=IMPERIAL_CTX)
        buf = generator.generate_sale_history_pdf(
            _VEHICLE_INFO, [_service_record(Decimal("19312"))]
        )
        text = _normalized_text(buf.read())

        assert "Odometer (mi)" in text
        assert "12,000" in text
        assert "Odometer (km)" not in text
        assert "19,312" not in text

    def test_both_reports_now_round_a_fractional_odometer_identically(self) -> None:
        """AUTHORISED BEHAVIOUR CHANGE, recorded in the changelog.

        These two reports disagreed: the service history truncated with
        `int()` and rendered 123.90 as "123", while the sale history
        formatted the raw Decimal and rendered "123.90". One adapter
        precision cannot reproduce both, so both now round through the
        distance adapter (precision 0) and render "124".
        """
        record = [_service_record(Decimal("123.90"))]

        service = _normalized_text(
            PDFReportGenerator(render_context=METRIC_CTX)
            .generate_service_history_pdf(_VEHICLE_INFO, record)
            .read()
        )
        sale = _normalized_text(
            PDFReportGenerator(render_context=METRIC_CTX)
            .generate_sale_history_pdf(_VEHICLE_INFO, record)
            .read()
        )

        assert "124" in service
        assert "124" in sale
        # The two old renderings are gone from both reports.
        assert "123.90" not in service
        assert "123.90" not in sale

    def test_a_missing_odometer_still_renders_na(self) -> None:
        """Unchanged by the unit rewrite: a null or zero reading is a
        missing reading, not a real one at the origin."""
        generator = PDFReportGenerator(render_context=IMPERIAL_CTX)
        buf = generator.generate_service_history_pdf(
            _VEHICLE_INFO, [_service_record(None), _service_record(Decimal("0"))]
        )
        text = _normalized_text(buf.read())

        assert "N/A" in text
        assert "Odometer (mi)" in text
