"""Shared engine-hours read helpers (used by dashboard + vehicle-detail routes).

The ONE canonical helper for "current hours" — see the hours-usage-model plan
§1. Every consumer (detail-stats, hero/card, reminders, widget, analytics,
PDF) calls this; none may re-derive "latest" differently. Latest hours is
derived at read time from ``hours_records`` — there is no cache column to
keep consistent (``vehicles.current_hours`` is retired as a read source).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HoursRecord


async def latest_engine_hours_and_date(
    db: AsyncSession, vin: str
) -> tuple[Decimal | None, date | None]:
    """Return the single canonical engine-hours reading and its date for a vin.

    ``ORDER BY engine_hours DESC, date DESC, id DESC LIMIT 1``: a physical
    hour-meter is monotonic, so "current" is the MAX reading on record, not
    necessarily the most recently dated one — a lower-hours manual correction
    entered after a higher reading must not make current hours appear to go
    backwards. Ties on ``engine_hours`` break to the newest ``date``; ties on
    both break to the highest ``id``. Deterministic on SQLite (prod) AND
    PostgreSQL (CI). Fetched ONCE per call so the displayed reading and any
    hours-reminder evaluation always agree. Returns ``(None, None)`` when the
    vehicle has no hours reading.
    """
    row = (
        await db.execute(
            select(HoursRecord.engine_hours, HoursRecord.date)
            .where(HoursRecord.vin == vin)
            .order_by(
                HoursRecord.engine_hours.desc(),
                HoursRecord.date.desc(),
                HoursRecord.id.desc(),
            )
            .limit(1)
        )
    ).first()
    if row is None:
        return None, None
    return row[0], row[1]
