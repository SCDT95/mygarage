"""Resolve the instance gallon flavour from settings.

Phase 0 of the custom-units work replaces `UnitConverter.set_gallon_standard()`,
which mutated process-global class state. This module is the single explicit
source of that value for backend callers. Phase 1 replaces the body with a
per-user lookup; the signature does not change.
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
