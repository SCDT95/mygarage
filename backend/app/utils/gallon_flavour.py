"""Resolve the instance gallon flavour from settings.

Phase 0 of the custom-units work replaces `UnitConverter.set_gallon_standard()`,
which mutated process-global class state. This module is the single explicit
source of that value for backend callers. Phase 1 replaces the body with a
per-user lookup; the signature does not change.

Gallon-consumer classification (phase 0 deliverable)
----------------------------------------------------

Three classes, each with a different source of truth. Phase 1 must not collapse
them into one.

1. USER PREFERENCE -- resolve from the caller's UnitSet (phase 1) or, today,
   from this module:
     - services/notifications/dispatcher.py  DEF-low volume
     - services/widget_aggregation.py        widget v1/v2 MPG fields
     - routes/export.py                      CSV export values and marker

2. FILE OR REQUEST MARKER -- the flavour travels with the data, never from a
   preference:
     - routes/import_data.py `_row_gallons_to_liters`  reads the file's own
       `unit_system` marker; already explicit, already correct, do not change
     - routes/export.py `?units=` query parameter      caller's explicit request

3. INTRINSICALLY US -- a fixed constant, never a preference:
     - EPA / window-sticker MPG figures (vehicles.fuel_economy_*), which are US
       MPG by definition regardless of where the user lives
     - webhook `gal` ingress, which documents US gallons in its contract
     - migrations/053, a frozen historical transform with a literal numerator
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import Setting
from app.utils.units import GallonFlavour

GALLON_STANDARD_KEY = "imperial_gallon_standard"


async def resolve_gallon_flavour(db: AsyncSession) -> GallonFlavour:
    """Return the configured gallon flavour, defaulting to US.

    Anything other than a case-insensitive "uk" resolves to "us", so a missing
    row, an empty value, or a typo degrades to the historical default rather
    than raising.
    """
    row = (
        await db.execute(select(Setting).where(Setting.key == GALLON_STANDARD_KEY))
    ).scalar_one_or_none()
    if row is not None and (row.value or "").strip().lower() == "uk":
        return "uk"
    return "us"
