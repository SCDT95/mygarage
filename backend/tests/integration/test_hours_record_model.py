"""Model round-trip tests for the hours-usage foundation (migration 083).

Exercises the new ``HoursRecord`` ORM model against the create_all schema:
source-identity FKs (``fuel_record_id`` / ``service_visit_id``), the
``Vehicle.hours_records`` relationship, and the ``Vehicle.secondary_usage_enabled``
default.
"""

import datetime as dt
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.fuel import FuelRecord
from app.models.hours import HoursRecord
from app.models.service_visit import ServiceVisit
from app.models.vehicle import Vehicle


@pytest.mark.asyncio
async def test_hours_record_round_trip_with_source_fks(
    db_session: AsyncSession, test_vehicle: dict[str, object]
) -> None:
    """A HoursRecord persists with fuel_record_id and with service_visit_id set."""
    vin = str(test_vehicle["vin"])

    fuel = FuelRecord(vin=vin, date=dt.date(2026, 7, 1), liters=Decimal("40.0"))
    visit = ServiceVisit(vin=vin, date=dt.date(2026, 7, 2))
    db_session.add_all([fuel, visit])
    await db_session.commit()
    await db_session.refresh(fuel)
    await db_session.refresh(visit)

    fuel_hours = HoursRecord(
        vin=vin,
        date=dt.date(2026, 7, 1),
        engine_hours=Decimal("101.5"),
        source="fuel",
        fuel_record_id=fuel.id,
    )
    visit_hours = HoursRecord(
        vin=vin,
        date=dt.date(2026, 7, 2),
        engine_hours=Decimal("102.5"),
        source="service_visit",
        service_visit_id=visit.id,
    )
    db_session.add_all([fuel_hours, visit_hours])
    await db_session.commit()
    await db_session.refresh(fuel_hours)
    await db_session.refresh(visit_hours)

    assert fuel_hours.fuel_record_id == fuel.id
    assert fuel_hours.service_visit_id is None
    assert visit_hours.service_visit_id == visit.id
    assert visit_hours.fuel_record_id is None
    # Decimal precision preserved on round-trip.
    assert fuel_hours.engine_hours == Decimal("101.5")


@pytest.mark.asyncio
async def test_vehicle_hours_records_relationship_loads(
    db_session: AsyncSession, test_vehicle: dict[str, object]
) -> None:
    """Vehicle.hours_records back_populates and eager-loads the child rows."""
    vin = str(test_vehicle["vin"])
    db_session.add_all(
        [
            HoursRecord(vin=vin, date=dt.date(2026, 6, 1), engine_hours=Decimal("50.0")),
            HoursRecord(vin=vin, date=dt.date(2026, 6, 2), engine_hours=Decimal("51.0")),
        ]
    )
    await db_session.commit()

    result = await db_session.execute(
        select(Vehicle).where(Vehicle.vin == vin).options(selectinload(Vehicle.hours_records))
    )
    vehicle = result.scalar_one()
    loaded = {r.engine_hours for r in vehicle.hours_records}
    assert Decimal("50.0") in loaded
    assert Decimal("51.0") in loaded


@pytest.mark.asyncio
async def test_secondary_usage_enabled_defaults_false(
    db_session: AsyncSession, test_vehicle: dict[str, object]
) -> None:
    """secondary_usage_enabled defaults to False when not explicitly set."""
    vin = str(test_vehicle["vin"])
    result = await db_session.execute(select(Vehicle).where(Vehicle.vin == vin))
    vehicle = result.scalar_one()
    assert vehicle.secondary_usage_enabled is False
