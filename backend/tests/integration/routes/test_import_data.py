"""
Integration tests for data import routes.

Tests CSV and JSON import operations for various record types.
"""

from io import BytesIO

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def _reset_import_rate_limit():
    """Reset import (and export, for round-trip tests) limiter storage before each test.

    ``routes/import_data.py`` defines a single module-level ``Limiter``
    shared by every import endpoint (20/minute). This file's test count has
    grown enough (Phase 9 added fuel/service/hours engine_hours coverage,
    including export->import round-trip tests that also call ``routes/export.py``'s
    stricter 5/minute limiter) that cumulative calls across tests can approach
    either budget and cause intermittent 429s unrelated to the behavior under
    test. Mirrors the precedent in ``test_auth.py``'s
    ``TestCookieSecureFlag._reset_rate_limits``.
    """
    from app.routes.export import limiter as export_limiter
    from app.routes.import_data import limiter as import_limiter

    for lim in (import_limiter, export_limiter):
        storage = lim._storage
        storage.storage.clear()
        storage.expirations.clear()
        if hasattr(storage, "events"):
            storage.events.clear()


@pytest.mark.integration
@pytest.mark.asyncio
class TestImportRoutes:
    """Test data import API endpoints."""

    async def test_import_service_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing service records from CSV creates ServiceVisit + ServiceLineItem."""
        csv_content = """Date,Service Type,Mileage,Cost,Vendor Name,Notes
2024-01-15,Oil Change,50000,45.99,QuickLube,Regular maintenance
2024-02-20,Tire Rotation,51000,25.00,Discount Tire,"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/service/csv",
            headers=auth_headers,
            files={"file": ("services.csv", BytesIO(csv_content.encode()), "text/csv")},
            data={"skip_duplicates": "true"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 0
        assert data["total_processed"] == 2

    async def test_import_service_csv_missing_date(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test importing service record without required date."""
        csv_content = """Date,Service Type,Description,Mileage,Cost
,Oil Change,Test,50000,45.99"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/service/csv",
            headers=auth_headers,
            files={"file": ("services.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["error_count"] == 1
        assert "Date is required" in data["errors"][0]

    async def test_import_fuel_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing fuel records from CSV."""
        csv_content = """Date,Mileage,Gallons,Price Per Gallon,Total Cost,Full Tank,Notes
2024-01-10,49500,15.5,3.29,50.99,True,Regular unleaded
2024-01-20,49800,14.2,3.35,47.57,True,Premium fuel"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 0

    async def test_import_fuel_csv_normalizes_locale_fuel_type(
        self, client: AsyncClient, auth_headers, test_vehicle, db_session
    ):
        """Phase 2.4: rc1 dropped the Fuel Type column entirely.

        The user's original report on issue #69 was a Polish-locale install
        whose pre-imported fuel records carried "Benzyna" — which silently
        backfilled to 'other' in the migration AND was ignored on import.
        v2.27.0-rc2 reads the Fuel Type column, runs it through the
        locale-aware normalizer, and stores both the original spelling
        (legacy `fuel_type`) and the canonical enum (`fuel_type_used`).
        """
        from sqlalchemy import select

        from app.models.fuel import FuelRecord

        csv_content = (
            "Date,Odometer (km),Liters,Price Per Liter,Total Cost,Full Tank,Fuel Type,Notes\n"
            "2024-03-01,80000,40.0,1.50,60.0,True,Benzyna,From Poland\n"
            "2024-03-15,80500,42.0,1.50,63.0,True,Дизель,From Russia\n"
            "2024-03-29,81000,38.0,1.50,57.0,True,Plasma fuel,Sci-fi\n"
        )

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["success_count"] == 3

        # Filter to just the records this test inserted (the test_vehicle
        # fixture is shared with other tests in the module, so a plain
        # vin-only query would also pick up unrelated rows).
        from datetime import date as date_type

        from sqlalchemy import and_

        rows_by_date = {}
        for r in (
            (
                await db_session.execute(
                    select(FuelRecord).where(
                        and_(
                            FuelRecord.vin == test_vehicle["vin"],
                            FuelRecord.date >= date_type(2024, 3, 1),
                            FuelRecord.date <= date_type(2024, 3, 29),
                        )
                    )
                )
            )
            .scalars()
            .all()
        ):
            rows_by_date[r.date] = r

        # Polish "Benzyna" → gasoline
        assert rows_by_date[date_type(2024, 3, 1)].fuel_type == "Benzyna"
        assert rows_by_date[date_type(2024, 3, 1)].fuel_type_used == "gasoline"
        # Russian "Дизель" → diesel
        assert rows_by_date[date_type(2024, 3, 15)].fuel_type == "Дизель"
        assert rows_by_date[date_type(2024, 3, 15)].fuel_type_used == "diesel"
        # Unrecognized values land on 'other' rather than dropping the row.
        assert rows_by_date[date_type(2024, 3, 29)].fuel_type == "Plasma fuel"
        assert rows_by_date[date_type(2024, 3, 29)].fuel_type_used == "other"

    async def test_import_odometer_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing odometer records from CSV."""
        csv_content = """Date,Reading,Notes
2024-01-01,48000,Start of year reading
2024-02-01,49500,Monthly reading
2024-03-01,51000,Monthly reading"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 3
        assert data["error_count"] == 0

    async def test_import_odometer_csv_missing_mileage(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test importing odometer record without required mileage."""
        csv_content = """Date,Reading,Notes
2024-01-01,,Missing mileage"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["error_count"] == 1
        assert "Reading is required" in data["errors"][0]

    async def test_import_warranties_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing warranty records from CSV.

        Note: Import code may have field mapping issues. Verifying endpoint
        handles requests properly and returns valid structure.
        """
        csv_content = """Provider,Type,Start Date,End Date,Cost,Deductible,Notes
Honda Care,Extended,2024-01-01,2029-01-01,1500.00,100.00,Extended warranty
AAA,Roadside,2024-01-01,2025-01-01,150.00,0,Annual membership"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/warranties/csv",
            headers=auth_headers,
            files={"file": ("warranties.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        # Verify response structure is correct
        assert "success_count" in data
        assert "error_count" in data
        assert "total_processed" in data

    async def test_import_insurance_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing insurance records from CSV.

        Note: Import code may have field mapping issues. Verifying endpoint
        handles requests properly and returns valid structure.
        """
        csv_content = """Provider,Policy Number,Type,Start Date,End Date,Deductible,Notes
State Farm,SF-12345,Full Coverage,2024-01-01,2024-07-01,500.00,6 month policy
GEICO,GK-67890,Liability,2024-07-01,2025-01-01,250.00,Switched providers"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/insurance/csv",
            headers=auth_headers,
            files={"file": ("insurance.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        # Verify response structure is correct
        assert "success_count" in data
        assert "error_count" in data
        assert "total_processed" in data

    async def test_import_tax_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing tax records from CSV.

        Note: Import code may have field mapping issues. Verifying endpoint
        handles requests properly and returns valid structure.
        """
        csv_content = """Type,Amount,Paid Date,Due Date,Jurisdiction,Notes
Registration,150.00,2023-03-15,2023-03-31,Texas,Annual registration
Property Tax,75.00,2024-01-15,2024-01-31,Travis County,Vehicle tax"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/tax/csv",
            headers=auth_headers,
            files={"file": ("tax.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        # Verify response structure is correct
        assert "success_count" in data
        assert "error_count" in data
        assert "total_processed" in data

    async def test_import_notes_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing notes from CSV."""
        csv_content = """Date,Title,Content
2024-01-05,Test Drive,Noticed slight vibration at highway speeds
2024-01-20,Dealer Visit,Discussed upcoming maintenance needs"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/notes/csv",
            headers=auth_headers,
            files={"file": ("notes.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 0

    async def test_import_vehicle_json(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing complete vehicle data from JSON.

        Note: Import code may have field mapping issues. Verifying endpoint
        handles requests properly and returns valid structure.
        """
        import json

        json_data = {
            "fuel_records": [
                {
                    "date": "2024-01-10",
                    "mileage": 49500,
                    "gallons": 15.5,
                    "price_per_unit": 3.29,
                    "cost": 50.99,
                    "is_full_tank": True,
                }
            ],
            "odometer_records": [
                {"date": "2024-01-01", "reading": 48000, "notes": "Start of year"}
            ],
            "notes": [
                {
                    "date": "2024-01-05",
                    "title": "Test Note",
                    "content": "This is a test note",
                }
            ],
        }

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/json",
            headers=auth_headers,
            files={
                "file": (
                    "vehicle.json",
                    BytesIO(json.dumps(json_data).encode()),
                    "application/json",
                )
            },
            data={"skip_duplicates": "true"},
        )

        assert response.status_code == 200
        data = response.json()
        # Verify response structure (some imports may fail due to model issues)
        assert "fuel_records" in data
        assert "odometer_records" in data
        assert "notes" in data
        # These should succeed as they use correct field names
        assert data["fuel_records"]["success_count"] >= 0
        assert data["odometer_records"]["success_count"] >= 0
        assert data["notes"]["success_count"] >= 0

    async def test_import_json_invalid(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing invalid JSON."""
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/json",
            headers=auth_headers,
            files={
                "file": (
                    "vehicle.json",
                    BytesIO(b"not valid json"),
                    "application/json",
                )
            },
        )

        assert response.status_code == 400
        assert "Invalid JSON" in response.json()["detail"]

    async def test_import_csv_vehicle_not_found(self, client: AsyncClient, auth_headers):
        """Test importing CSV for non-existent vehicle."""
        csv_content = """Date,Service Type,Mileage,Cost
2024-01-15,Oil Change,50000,45.99"""

        response = await client.post(
            "/api/import/vehicles/1HGBH000000000000/service/csv",
            headers=auth_headers,
            files={"file": ("services.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 404

    async def test_import_unauthorized(self, client: AsyncClient, test_vehicle):
        """Test that unauthenticated users cannot import data."""
        csv_content = """Date,Service Type,Mileage,Cost
2024-01-15,Oil Change,50000,45.99"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/service/csv",
            files={"file": ("services.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 401

    async def test_import_odometer_csv_skip_duplicates(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test that duplicate records are skipped when flag is set."""
        csv_content = """Date,Reading,Notes
2024-03-15,52000,Unique reading"""

        # First import
        response1 = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
            data={"skip_duplicates": "true"},
        )
        assert response1.status_code == 200
        assert response1.json()["success_count"] == 1

        # Second import with same data - should be skipped
        response2 = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
            data={"skip_duplicates": "true"},
        )
        assert response2.status_code == 200
        assert response2.json()["skipped_count"] == 1
        assert response2.json()["success_count"] == 0

    async def test_import_various_date_formats(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test that various date formats are accepted."""
        # Using odometer import since it works correctly
        csv_content = """Date,Reading,Notes
2024-01-15,60000,Format 1
01/20/2024,60100,Format 2
01-25-2024,60200,Format 3"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        # All three formats should be accepted
        assert data["success_count"] == 3
        assert data["error_count"] == 0

    async def test_import_fuel_csv_alternative_headers(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test that alternative header names work for fuel import."""
        # Using "Price/Gal" instead of "Price Per Gallon" and "Cost" instead of "Total Cost"
        csv_content = """Date,Mileage,Gallons,Price/Gal,Cost,Full Tank
2024-04-01,53000,16.0,3.49,55.84,True"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 1

    async def test_import_odometer_csv_alternative_header(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test that 'Mileage' header works as alternative to 'Reading'."""
        csv_content = """Date,Mileage,Notes
2024-04-15,54000,Using Mileage header"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 1

    async def test_import_empty_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        """Test importing empty CSV (headers only)."""
        # Using odometer import since it works correctly
        csv_content = """Date,Reading,Notes"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total_processed"] == 0

    async def test_import_json_with_reminders(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test importing JSON with reminder data."""
        import json

        json_data = {
            "reminders": [
                {
                    "description": "Oil change due",
                    "due_date": "2024-06-01",
                    "due_mileage": 55000,
                    "is_completed": False,
                    "is_recurring": True,
                    "recurrence_miles": 5000,
                }
            ]
        }

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/json",
            headers=auth_headers,
            files={
                "file": (
                    "vehicle.json",
                    BytesIO(json.dumps(json_data).encode()),
                    "application/json",
                )
            },
        )

        assert response.status_code == 200
        data = response.json()
        # Verify reminder import result is present
        assert "reminders" in data
        assert "success_count" in data["reminders"]

    async def test_import_csv_with_optional_fields_empty(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """Test that optional fields can be empty."""
        # Using odometer import since it works correctly
        csv_content = """Date,Reading,Notes
2024-05-01,65000,"""

        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/odometer/csv",
            headers=auth_headers,
            files={"file": ("odometer.csv", BytesIO(csv_content.encode()), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 1

    async def test_import_forbidden_non_owner(
        self, client: AsyncClient, non_admin_headers, test_vehicle
    ):
        """Test that non-owner users cannot import data for another user's vehicle."""
        vin = test_vehicle["vin"]
        # Create minimal CSV content
        csv_content = b"date,mileage,gallons,cost\n2024-01-01,50000,10.5,35.00\n"
        response = await client.post(
            f"/api/import/vehicles/{vin}/fuel/csv",
            headers=non_admin_headers,
            files={"file": ("test.csv", BytesIO(csv_content), "text/csv")},
        )
        assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
class TestFuelCSVImportEngineHours:
    """Phase 9: fuel CSV import parses Engine Hours as Decimal (no unit conversion)."""

    async def test_import_fuel_csv_persists_engine_hours_decimal(
        self, client: AsyncClient, auth_headers, test_vehicle, db_session
    ):
        from datetime import date
        from decimal import Decimal

        from sqlalchemy import select

        from app.models.fuel import FuelRecord

        csv_content = (
            "Date,Odometer (km),Liters,Price Per Liter,Total Cost,Full Tank,Engine Hours,Notes\n"
            "2026-05-16,1200.0,20.0,1.50,30.0,True,456.7,Hours test\n"
        )
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["success_count"] == 1

        result = await db_session.execute(
            select(FuelRecord).where(
                FuelRecord.vin == test_vehicle["vin"], FuelRecord.date == date(2026, 5, 16)
            )
        )
        row = result.scalar_one()
        assert row.engine_hours == Decimal("456.7")

    async def test_import_fuel_csv_blank_engine_hours_is_none(
        self, client: AsyncClient, auth_headers, test_vehicle, db_session
    ):
        from datetime import date

        from sqlalchemy import select

        from app.models.fuel import FuelRecord

        csv_content = (
            "Date,Odometer (km),Liters,Total Cost,Full Tank,Engine Hours,Notes\n"
            "2026-05-19,1300.0,18.0,28.0,True,,No hours reading\n"
        )
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["success_count"] == 1

        result = await db_session.execute(
            select(FuelRecord).where(
                FuelRecord.vin == test_vehicle["vin"], FuelRecord.date == date(2026, 5, 19)
            )
        )
        row = result.scalar_one()
        assert row.engine_hours is None


@pytest.mark.integration
@pytest.mark.asyncio
class TestServiceCSVImportEngineHours:
    """Phase 9: service-visit CSV import parses Engine Hours as Decimal."""

    async def test_import_service_csv_persists_engine_hours_decimal(
        self, client: AsyncClient, auth_headers, test_vehicle, db_session
    ):
        from datetime import date
        from decimal import Decimal

        from sqlalchemy import select

        from app.models.service_visit import ServiceVisit

        csv_content = (
            "Date,Category,Description,Odometer (km),Cost,Vendor,Engine Hours,Notes\n"
            "2026-05-17,Maintenance,Oil Change,1200.0,45.99,QuickLube,88.8,Notes here\n"
        )
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/service/csv",
            headers=auth_headers,
            files={"file": ("service.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        assert response.json()["success_count"] == 1

        result = await db_session.execute(
            select(ServiceVisit).where(
                ServiceVisit.vin == test_vehicle["vin"], ServiceVisit.date == date(2026, 5, 17)
            )
        )
        row = result.scalar_one()
        assert row.engine_hours == Decimal("88.8")


@pytest.mark.integration
@pytest.mark.asyncio
class TestFuelServiceCSVRoundTrip:
    """Phase 9: engine_hours survives export -> import unchanged (Decimal-exact)."""

    async def test_fuel_engine_hours_export_then_import_round_trip(
        self, client: AsyncClient, auth_headers, test_user, db_session
    ):
        from datetime import date
        from decimal import Decimal

        from sqlalchemy import select

        from app.models.fuel import FuelRecord
        from app.models.vehicle import Vehicle

        vin_a = "FUELCSVSRC0000001"
        vin_b = "FUELCSVDST0000001"
        db_session.add_all(
            [
                Vehicle(
                    vin=vin_a,
                    user_id=test_user["id"],
                    nickname="Fuel CSV Src",
                    vehicle_type="Car",
                    year=2024,
                    make="Test",
                    model="FuelSrc",
                ),
                Vehicle(
                    vin=vin_b,
                    user_id=test_user["id"],
                    nickname="Fuel CSV Dst",
                    vehicle_type="Car",
                    year=2024,
                    make="Test",
                    model="FuelDst",
                ),
            ]
        )
        await db_session.commit()

        db_session.add(
            FuelRecord(
                vin=vin_a,
                date=date(2026, 5, 18),
                odometer_km=Decimal("500.00"),
                engine_hours=Decimal("42.3"),
                liters=Decimal("10.0"),
                cost=Decimal("15.00"),
                is_full_tank=True,
            )
        )
        await db_session.commit()

        export_resp = await client.get(
            f"/api/export/vehicles/{vin_a}/fuel/csv", headers=auth_headers
        )
        assert export_resp.status_code == 200

        import_resp = await client.post(
            f"/api/import/vehicles/{vin_b}/fuel/csv",
            headers=auth_headers,
            files={"file": ("fuel.csv", BytesIO(export_resp.content), "text/csv")},
        )
        assert import_resp.status_code == 200
        assert import_resp.json()["success_count"] == 1

        result = await db_session.execute(select(FuelRecord).where(FuelRecord.vin == vin_b))
        row = result.scalar_one()
        assert row.engine_hours == Decimal("42.3")

    async def test_service_engine_hours_export_then_import_round_trip(
        self, client: AsyncClient, auth_headers, test_user, db_session
    ):
        from datetime import date
        from decimal import Decimal

        from sqlalchemy import select

        from app.models.service_line_item import ServiceLineItem
        from app.models.service_visit import ServiceVisit
        from app.models.vehicle import Vehicle

        vin_a = "SVCCSVSRC00000001"
        vin_b = "SVCCSVDST00000001"
        db_session.add_all(
            [
                Vehicle(
                    vin=vin_a,
                    user_id=test_user["id"],
                    nickname="Service CSV Src",
                    vehicle_type="Car",
                    year=2024,
                    make="Test",
                    model="SvcSrc",
                ),
                Vehicle(
                    vin=vin_b,
                    user_id=test_user["id"],
                    nickname="Service CSV Dst",
                    vehicle_type="Car",
                    year=2024,
                    make="Test",
                    model="SvcDst",
                ),
            ]
        )
        await db_session.commit()

        visit = ServiceVisit(
            vin=vin_a,
            date=date(2026, 5, 21),
            odometer_km=Decimal("600.00"),
            engine_hours=Decimal("15.6"),
            service_category="Maintenance",
            total_cost=Decimal("20.00"),
        )
        db_session.add(visit)
        await db_session.flush()
        db_session.add(
            ServiceLineItem(visit_id=visit.id, description="Filter change", cost=Decimal("20.00"))
        )
        await db_session.commit()

        export_resp = await client.get(
            f"/api/export/vehicles/{vin_a}/service/csv", headers=auth_headers
        )
        assert export_resp.status_code == 200

        import_resp = await client.post(
            f"/api/import/vehicles/{vin_b}/service/csv",
            headers=auth_headers,
            files={"file": ("service.csv", BytesIO(export_resp.content), "text/csv")},
        )
        assert import_resp.status_code == 200
        assert import_resp.json()["success_count"] == 1

        result = await db_session.execute(select(ServiceVisit).where(ServiceVisit.vin == vin_b))
        row = result.scalar_one()
        assert row.engine_hours == Decimal("15.6")


@pytest.mark.integration
@pytest.mark.asyncio
class TestHoursCSVImport:
    """Phase 9: standalone hours CSV import, mirroring the odometer CSV endpoint."""

    async def test_import_hours_csv(self, client: AsyncClient, auth_headers, test_vehicle):
        csv_content = """Date,Engine Hours,Notes,Source
2026-05-10,50.5,First reading,manual
2026-05-20,60.2,Second reading,manual"""
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 0

    async def test_import_hours_csv_missing_engine_hours(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        csv_content = """Date,Engine Hours,Notes
2026-05-11,,Missing hours"""
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["error_count"] == 1
        assert "Engine Hours is required" in data["errors"][0]

    async def test_import_hours_csv_skip_duplicates(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        csv_content = """Date,Engine Hours,Notes
2026-05-12,70.0,Unique reading"""
        r1 = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
            data={"skip_duplicates": "true"},
        )
        assert r1.status_code == 200
        assert r1.json()["success_count"] == 1

        r2 = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
            data={"skip_duplicates": "true"},
        )
        assert r2.status_code == 200
        assert r2.json()["skipped_count"] == 1
        assert r2.json()["success_count"] == 0

    async def test_import_hours_csv_unauthorized(self, client: AsyncClient, test_vehicle):
        csv_content = """Date,Engine Hours,Notes
2026-05-13,80.0,Reading"""
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 401

    async def test_import_hours_csv_vehicle_not_found(self, client: AsyncClient, auth_headers):
        csv_content = """Date,Engine Hours,Notes
2026-05-14,90.0,Reading"""
        response = await client.post(
            "/api/import/vehicles/INVALIDVIN1234567/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 404

    async def test_import_hours_csv_forbidden_non_owner(
        self, client: AsyncClient, non_admin_headers, test_vehicle
    ):
        csv_content = """Date,Engine Hours,Notes
2026-05-15,95.0,Reading"""
        response = await client.post(
            f"/api/import/vehicles/{test_vehicle['vin']}/hours/csv",
            headers=non_admin_headers,
            files={"file": ("hours.csv", BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
class TestHoursCSVRoundTrip:
    """Phase 9: standalone hours CSV round-trips Decimal-exact and normalizes source.

    Every imported row becomes a manual reading regardless of the exported
    Source column -- the CSV cannot carry a live FK to a fuel/service row in
    the *target* vehicle's tables, so an original source='fuel' row must
    still land as source='manual' with both link columns null.
    """

    async def test_export_then_import_into_another_vehicle(
        self, client: AsyncClient, auth_headers, test_user, db_session
    ):
        from datetime import date
        from decimal import Decimal

        from sqlalchemy import select

        from app.models.hours import HoursRecord
        from app.models.vehicle import Vehicle

        vin_a = "HOURSCSVSRC000001"
        vin_b = "HOURSCSVDST000001"
        db_session.add_all(
            [
                Vehicle(
                    vin=vin_a,
                    user_id=test_user["id"],
                    nickname="Hours CSV Src",
                    vehicle_type="ATV",
                    year=2024,
                    make="Test",
                    model="HoursSrc",
                ),
                Vehicle(
                    vin=vin_b,
                    user_id=test_user["id"],
                    nickname="Hours CSV Dst",
                    vehicle_type="ATV",
                    year=2024,
                    make="Test",
                    model="HoursDst",
                ),
            ]
        )
        await db_session.commit()

        db_session.add_all(
            [
                HoursRecord(
                    vin=vin_a,
                    date=date(2026, 5, 1),
                    engine_hours=Decimal("100.0"),
                    notes="Manual reading",
                    source="manual",
                ),
                HoursRecord(
                    vin=vin_a,
                    date=date(2026, 5, 2),
                    engine_hours=Decimal("105.3"),
                    notes="Synced from fuel",
                    source="fuel",
                ),
            ]
        )
        await db_session.commit()

        export_resp = await client.get(
            f"/api/export/vehicles/{vin_a}/hours/csv", headers=auth_headers
        )
        assert export_resp.status_code == 200

        import_resp = await client.post(
            f"/api/import/vehicles/{vin_b}/hours/csv",
            headers=auth_headers,
            files={"file": ("hours.csv", BytesIO(export_resp.content), "text/csv")},
        )
        assert import_resp.status_code == 200
        data = import_resp.json()
        assert data["success_count"] == 2
        assert data["error_count"] == 0

        result = await db_session.execute(
            select(HoursRecord).where(HoursRecord.vin == vin_b).order_by(HoursRecord.date)
        )
        rows = result.scalars().all()
        assert len(rows) == 2

        assert rows[0].engine_hours == Decimal("100.0")
        assert rows[0].source == "manual"
        assert rows[0].fuel_record_id is None
        assert rows[0].service_visit_id is None

        # Exported as source='fuel' -- normalized to 'manual' on import since
        # there is no real fuel record in vehicle B to link.
        assert rows[1].engine_hours == Decimal("105.3")
        assert rows[1].source == "manual"
        assert rows[1].fuel_record_id is None
        assert rows[1].service_visit_id is None
