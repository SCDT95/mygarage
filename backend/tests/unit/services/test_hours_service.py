"""
Unit tests for hours_service — the ONE canonical "latest engine hours" helper.

Every consumer (detail-stats, hero/card, reminders, widget, analytics, PDF)
must call ``latest_engine_hours_and_date`` — see the hours-usage-model plan
§1. A physical hour-meter is monotonic, so "current" means the MAX reading
on record, not the most recently dated one; ties break to newest date, then
highest id.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HoursRecord, Vehicle
from app.services.hours_service import latest_engine_hours_and_date

# clean_hours_records is a shared fixture in tests/unit/conftest.py (also
# used by tests/unit/utils/test_hours_sync.py).


async def _add_hours_record(
    db_session: AsyncSession, vin: str, reading_date: date, engine_hours: Decimal
) -> HoursRecord:
    record = HoursRecord(vin=vin, date=reading_date, engine_hours=engine_hours, source="manual")
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(record)
    return record


@pytest.mark.unit
@pytest.mark.asyncio
class TestLatestEngineHoursAndDate:
    """Test the deterministic latest-hours selection."""

    async def test_empty_vehicle_returns_none_none(
        self, db_session: AsyncSession, test_vehicle, clean_hours_records
    ):
        engine_hours, reading_date = await latest_engine_hours_and_date(
            db_session, test_vehicle["vin"]
        )
        assert engine_hours is None
        assert reading_date is None

    async def test_returns_max_reading_even_when_later_date_is_lower(
        self, db_session: AsyncSession, test_vehicle, clean_hours_records
    ):
        """Non-monotonic history: a later date with a LOWER reading must lose.

        e.g. a correction/manual backdated entry shouldn't make "current
        hours" appear to go backwards — the highest physical reading wins.
        """
        vin = test_vehicle["vin"]
        await _add_hours_record(db_session, vin, date(2024, 1, 1), Decimal("500.0"))
        await _add_hours_record(db_session, vin, date(2024, 6, 1), Decimal("120.0"))

        engine_hours, reading_date = await latest_engine_hours_and_date(db_session, vin)

        assert engine_hours == Decimal("500.0")
        assert reading_date == date(2024, 1, 1)

    async def test_tie_on_engine_hours_breaks_to_newest_date(
        self, db_session: AsyncSession, test_vehicle, clean_hours_records
    ):
        vin = test_vehicle["vin"]
        await _add_hours_record(db_session, vin, date(2024, 1, 1), Decimal("300.0"))
        await _add_hours_record(db_session, vin, date(2024, 3, 1), Decimal("300.0"))

        engine_hours, reading_date = await latest_engine_hours_and_date(db_session, vin)

        assert engine_hours == Decimal("300.0")
        assert reading_date == date(2024, 3, 1)

    async def test_tie_on_engine_hours_and_date_resolves_to_one_deterministic_row(
        self, db_session: AsyncSession, test_vehicle, clean_hours_records
    ):
        """A full (engine_hours, date) tie across multiple ids never raises and
        always returns exactly that tied value pair (id DESC is the final,
        deterministic tie-break — unobservable in the return shape here since
        both candidate rows carry identical engine_hours/date, but the query
        must resolve to a SINGLE row, not error on multiple matches)."""
        vin = test_vehicle["vin"]
        await _add_hours_record(db_session, vin, date(2024, 4, 1), Decimal("400.0"))
        await _add_hours_record(db_session, vin, date(2024, 4, 1), Decimal("400.0"))

        engine_hours, reading_date = await latest_engine_hours_and_date(db_session, vin)

        assert engine_hours == Decimal("400.0")
        assert reading_date == date(2024, 4, 1)

    async def test_other_vehicle_readings_do_not_leak(
        self, db_session: AsyncSession, test_vehicle, clean_hours_records
    ):
        """The helper is vin-scoped — a higher reading on another vin must not win."""
        vin = test_vehicle["vin"]
        other_vin = "1FTFW1ET1EFA00001"

        # HoursRecord.vin FKs to vehicles.vin (FK enforcement is ON in tests,
        # mirroring prod's PRAGMA foreign_keys=ON), so the other vin needs a
        # real parent row.
        other_vehicle = Vehicle(vin=other_vin, nickname="Other Vehicle", vehicle_type="Car")
        db_session.add(other_vehicle)
        await db_session.commit()

        await _add_hours_record(db_session, vin, date(2024, 1, 1), Decimal("50.0"))
        await _add_hours_record(db_session, other_vin, date(2024, 1, 1), Decimal("9999.0"))

        engine_hours, reading_date = await latest_engine_hours_and_date(db_session, vin)

        assert engine_hours == Decimal("50.0")
        assert reading_date == date(2024, 1, 1)

        # Cleanup — HoursRecord/Vehicle FK is ON DELETE CASCADE, so removing
        # the vehicle takes its hours row with it.
        await db_session.delete(other_vehicle)
        await db_session.commit()
