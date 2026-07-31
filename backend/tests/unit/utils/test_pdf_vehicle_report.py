"""Tests for vehicle analytics PDF report generation."""

from decimal import Decimal

import fitz  # PyMuPDF

from app.utils.pdf_vehicle_report import generate_vehicle_analytics_pdf

PDF_MAGIC = b"%PDF"


def _extract_text(pdf_bytes: bytes) -> str:
    """Extract all text from PDF bytes using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()  # type: ignore[operator]
    doc.close()
    return text


def _make_analytics_data(
    vehicle_name: str = "2021 Honda Accord",
    vin: str = "1HGCV1F31MA000001",
    total_cost: Decimal = Decimal("5000.00"),
    service_count: int = 10,
    fuel_count: int = 20,
    include_monthly: bool = True,
    include_service_breakdown: bool = True,
) -> dict:
    """Build minimal analytics data dict for testing."""
    monthly = []
    if include_monthly:
        monthly = [
            {
                "year": 2025,
                "month": 1,
                "month_name": "January",
                "total_service_cost": Decimal("300.00"),
                "total_fuel_cost": Decimal("150.00"),
                "total_def_cost": Decimal("0.00"),
                "total_cost": Decimal("450.00"),
                "service_count": 3,
                "fuel_count": 4,
            },
            {
                "year": 2025,
                "month": 2,
                "month_name": "February",
                "total_service_cost": Decimal("200.00"),
                "total_fuel_cost": Decimal("120.00"),
                "total_def_cost": Decimal("0.00"),
                "total_cost": Decimal("320.00"),
                "service_count": 2,
                "fuel_count": 3,
            },
        ]

    breakdown = []
    if include_service_breakdown:
        breakdown = [
            {
                "service_type": "Oil Change",
                "total_cost": Decimal("300.00"),
                "count": 4,
                "average_cost": Decimal("75.00"),
            },
            {
                "service_type": "Brake Service",
                "total_cost": Decimal("800.00"),
                "count": 2,
                "average_cost": Decimal("400.00"),
            },
        ]

    return {
        "vin": vin,
        "vehicle_name": vehicle_name,
        "vehicle_type": "Car",
        "days_owned": 365,
        "total_miles_driven": 12000,
        "average_miles_per_month": 1000,
        "cost_analysis": {
            "total_service_cost": Decimal("3000.00"),
            "total_fuel_cost": Decimal("2000.00"),
            "total_def_cost": Decimal("0.00"),
            "total_cost": total_cost,
            "average_monthly_cost": Decimal("416.67"),
            "service_count": service_count,
            "fuel_count": fuel_count,
            "def_count": 0,
            "months_tracked": 12,
            "cost_per_mile": Decimal("0.42"),
            "rolling_avg_3m": Decimal("400.00"),
            "rolling_avg_6m": Decimal("420.00"),
            "trend_direction": "decreasing",
            "monthly_breakdown": monthly,
            "service_type_breakdown": breakdown,
            "anomalies": [],
        },
        "cost_projection": {
            "monthly_average": Decimal("416.67"),
            "six_month_projection": Decimal("2500.00"),
            "twelve_month_projection": Decimal("5000.00"),
            "assumptions": "Projection assumes spending remains at recent averages.",
        },
        "fuel_economy": {
            "average_mpg": Decimal("30.5"),
            "best_mpg": Decimal("35.2"),
            "worst_mpg": Decimal("26.1"),
            "recent_mpg": Decimal("31.0"),
            "trend": "stable",
            "data_points": [],
        },
        "fuel_alerts": [],
        "service_history": [],
        "predictions": [],
    }


def _make_vendor_data() -> dict:
    """Build vendor analytics data dict for testing."""
    return {
        "vendors": [
            {
                "vendor_name": "AutoZone",
                "total_spent": Decimal("1200.00"),
                "service_count": 5,
                "average_cost": Decimal("240.00"),
                "service_types": ["Oil Change", "Brake Service"],
            },
            {
                "vendor_name": "Jiffy Lube",
                "total_spent": Decimal("600.00"),
                "service_count": 3,
                "average_cost": Decimal("200.00"),
                "service_types": ["Oil Change"],
            },
        ],
        "total_vendors": 2,
        "most_used_vendor": "AutoZone",
        "highest_spending_vendor": "AutoZone",
    }


def _make_seasonal_data() -> dict:
    """Build seasonal analytics data dict for testing."""
    return {
        "seasons": [
            {
                "season": "Winter",
                "total_cost": Decimal("1500.00"),
                "service_count": 4,
                "average_cost": Decimal("375.00"),
                "variance_from_annual": Decimal("12.5"),
                "common_services": ["Oil Change"],
            },
            {
                "season": "Spring",
                "total_cost": Decimal("1200.00"),
                "service_count": 3,
                "average_cost": Decimal("400.00"),
                "variance_from_annual": Decimal("-5.0"),
                "common_services": ["Brake Service"],
            },
            {
                "season": "Summer",
                "total_cost": Decimal("800.00"),
                "service_count": 2,
                "average_cost": Decimal("400.00"),
                "variance_from_annual": Decimal("-20.0"),
                "common_services": ["Tire Rotation"],
            },
            {
                "season": "Fall",
                "total_cost": Decimal("1000.00"),
                "service_count": 3,
                "average_cost": Decimal("333.33"),
                "variance_from_annual": Decimal("-8.5"),
                "common_services": ["Oil Change"],
            },
        ],
        "highest_cost_season": "Winter",
        "lowest_cost_season": "Summer",
        "annual_average": Decimal("1125.00"),
    }


class TestGenerateVehicleAnalyticsPdf:
    """Tests for generate_vehicle_analytics_pdf."""

    def test_returns_valid_pdf(self) -> None:
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        content = buf.read()
        assert content[:4] == PDF_MAGIC
        assert len(content) > 5000

    def test_contains_vehicle_name(self) -> None:
        data = _make_analytics_data(vehicle_name="2023 Ram 3500")
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "2023 Ram 3500" in text

    def test_contains_vin(self) -> None:
        data = _make_analytics_data(vin="3C63RRGL9NG000001")
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "3C63RRGL9NG000001" in text

    def test_contains_section_headings(self) -> None:
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "Monthly Spending" in text
        assert "Service Breakdown" in text

    def test_contains_kpi_labels(self) -> None:
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "TOTAL COST" in text
        assert "COST PER KM" in text
        assert "AVG MONTHLY" in text
        assert "PROJECTED 12-MO" in text

    def test_with_vendor_data(self) -> None:
        data = _make_analytics_data()
        vendor = _make_vendor_data()
        buf = generate_vehicle_analytics_pdf(data, vendor_data=vendor)
        text = _extract_text(buf.read())
        assert "Vendor Analysis" in text
        assert "AutoZone" in text

    def test_with_seasonal_data(self) -> None:
        data = _make_analytics_data()
        seasonal = _make_seasonal_data()
        buf = generate_vehicle_analytics_pdf(data, seasonal_data=seasonal)
        text = _extract_text(buf.read())
        assert "Seasonal Spending" in text

    def test_with_all_data(self) -> None:
        data = _make_analytics_data()
        vendor = _make_vendor_data()
        seasonal = _make_seasonal_data()
        buf = generate_vehicle_analytics_pdf(data, vendor, seasonal)
        text = _extract_text(buf.read())
        assert "MyGarage" in text

    def test_no_vendor_no_seasonal(self) -> None:
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data, vendor_data=None, seasonal_data=None)
        content = buf.read()
        assert content[:4] == PDF_MAGIC

    def test_zero_costs(self) -> None:
        data = _make_analytics_data(
            total_cost=Decimal("0.00"),
            service_count=0,
            fuel_count=0,
            include_monthly=False,
            include_service_breakdown=False,
        )
        buf = generate_vehicle_analytics_pdf(data)
        content = buf.read()
        assert content[:4] == PDF_MAGIC

    def test_contains_branded_footer(self) -> None:
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "homelabforge.io" in text


def _make_hours_accumulated(
    readings: list[tuple[str, Decimal]],
) -> list[dict]:
    """Build an ``hours_accumulated``-shaped list (date-ascending, per
    ``get_hours_accumulated_series``): list of {date, engine_hours}.
    """
    from datetime import date as date_type

    return [{"date": date_type.fromisoformat(d), "engine_hours": hours} for d, hours in readings]


def _make_reminder(
    title: str,
    reminder_type: str,
    due_date: str | None = None,
    due_mileage_km: Decimal | None = None,
    due_hours: Decimal | None = None,
) -> dict:
    """Build a reminder dict mirroring ``schemas.reminder.ReminderResponse``."""
    from datetime import date as date_type

    return {
        "title": title,
        "reminder_type": reminder_type,
        "due_date": date_type.fromisoformat(due_date) if due_date else None,
        "due_mileage_km": due_mileage_km,
        "due_hours": due_hours,
    }


class TestUsageEfficiencySection:
    """Tests for the hours-usage-model PDF section (Phase 10)."""

    def test_pure_hours_vehicle_shows_hours_summary(self) -> None:
        """Pure-hours vehicle: latest engine-hours + L/hr economy render;
        no distance/MPG card leaks in (nothing to hide behind since there's
        no odometer data at all)."""
        data = _make_analytics_data()
        data["total_km_driven"] = None
        data["average_km_per_month"] = None
        data["fuel_economy"] = {"average_l_per_100km": None}
        data["hours_economy"] = {
            "average_l_per_hr": Decimal("1.85"),
            "average_cost_per_hr": Decimal("7.40"),
        }
        data["hours_accumulated"] = _make_hours_accumulated(
            [
                ("2025-01-01", Decimal("100.0")),
                ("2025-03-01", Decimal("150.0")),
                ("2025-06-01", Decimal("250.0")),
            ]
        )

        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())

        assert "Usage & Efficiency" in text
        assert "ENGINE HOURS" in text
        assert "250.0 hr" in text
        assert "L/hr" in text
        assert "Hours History" in text
        # No distance card leaked in for a pure-hours vehicle.
        assert "DISTANCE DRIVEN" not in text
        assert "FUEL ECONOMY" not in text

    def test_pure_hours_vehicle_hours_history_table(self) -> None:
        """Hours history table lists (date, engine_hours) readings."""
        data = _make_analytics_data()
        data["total_km_driven"] = None
        data["hours_economy"] = {
            "average_l_per_hr": Decimal("1.85"),
            "average_cost_per_hr": Decimal("7.40"),
        }
        data["hours_accumulated"] = _make_hours_accumulated(
            [
                ("2025-01-01", Decimal("100.0")),
                ("2025-03-01", Decimal("150.0")),
            ]
        )

        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())

        assert "100.0 hr" in text
        assert "150.0 hr" in text

    def test_dual_vehicle_shows_both_dimensions(self) -> None:
        """Dual-track vehicle: both odometer/distance AND hours summaries
        render, each with its own economy figure."""
        data = _make_analytics_data()
        data["total_km_driven"] = Decimal("12000")
        data["average_km_per_month"] = Decimal("1000")
        data["fuel_economy"] = {"average_l_per_100km": Decimal("9.4")}
        data["hours_economy"] = {
            "average_l_per_hr": Decimal("1.85"),
            "average_cost_per_hr": Decimal("7.40"),
        }
        data["hours_accumulated"] = _make_hours_accumulated(
            [("2025-01-01", Decimal("100.0")), ("2025-06-01", Decimal("250.0"))]
        )

        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())

        assert "DISTANCE DRIVEN" in text
        assert "12,000 km" in text
        assert "FUEL ECONOMY" in text
        assert "9.4" in text
        assert "L/100km" in text
        assert "ENGINE HOURS" in text
        assert "250.0 hr" in text
        assert "HOURS ECONOMY" in text
        assert "L/hr" in text

    def test_pure_distance_vehicle_regression(self) -> None:
        """Pure-distance vehicle (no hours data at all): report is
        unchanged — no hours section, no hours history table leak in."""
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())

        assert "Usage & Efficiency" not in text
        assert "Hours History" not in text
        assert "ENGINE HOURS" not in text
        assert "L/hr" not in text

    def test_hours_reminder_renders_hours_target(self) -> None:
        """A reminder with due_hours set renders its target in hours, not
        blank and not a mileage figure."""
        data = _make_analytics_data()
        reminders = [
            _make_reminder("Oil change (hours)", "hours", due_hours=Decimal("250.0")),
        ]

        buf = generate_vehicle_analytics_pdf(data, reminders_data=reminders)
        text = _extract_text(buf.read())

        assert "Upcoming Reminders" in text
        assert "Oil change (hours)" in text
        assert "250.0 hr" in text

    def test_mileage_reminder_still_renders_mileage_target(self) -> None:
        """A mileage reminder (no due_hours) still renders its km target —
        the hours addition must not regress the distance path."""
        data = _make_analytics_data()
        reminders = [
            _make_reminder("Tire rotation", "mileage", due_mileage_km=Decimal("50000")),
        ]

        buf = generate_vehicle_analytics_pdf(data, reminders_data=reminders)
        text = _extract_text(buf.read())

        assert "Tire rotation" in text
        assert "50,000 km" in text

    def test_no_reminders_no_section(self) -> None:
        """Without reminders_data, no reminders section renders (backward
        compatible default)."""
        data = _make_analytics_data()
        buf = generate_vehicle_analytics_pdf(data)
        text = _extract_text(buf.read())
        assert "Upcoming Reminders" not in text

    def test_all_three_shapes_generate_valid_pdf(self) -> None:
        """Report generation succeeds (no reportlab exception) for
        pure-hours, dual, and pure-distance vehicle shapes."""
        pure_distance = _make_analytics_data()

        pure_hours = _make_analytics_data()
        pure_hours["total_km_driven"] = None
        pure_hours["hours_economy"] = {
            "average_l_per_hr": Decimal("1.85"),
            "average_cost_per_hr": Decimal("7.40"),
        }
        pure_hours["hours_accumulated"] = _make_hours_accumulated(
            [("2025-01-01", Decimal("100.0"))]
        )

        dual = _make_analytics_data()
        dual["total_km_driven"] = Decimal("12000")
        dual["hours_economy"] = {
            "average_l_per_hr": Decimal("1.85"),
            "average_cost_per_hr": Decimal("7.40"),
        }
        dual["hours_accumulated"] = _make_hours_accumulated([("2025-01-01", Decimal("100.0"))])

        for shape in (pure_distance, pure_hours, dual):
            buf = generate_vehicle_analytics_pdf(shape)
            content = buf.read()
            assert content[:4] == PDF_MAGIC
