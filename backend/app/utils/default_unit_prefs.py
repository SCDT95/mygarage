"""The instance-wide default unit set, for clients with no user.

Anonymous visitors and every client on an ``auth_mode=none`` instance skip
``/auth/me`` entirely, so they have no user row to resolve units from. Before
this, they learned gallon flavour from the public ``imperial_gallon_standard``
setting; this row replaces it with a full unit set (spec D5).

Every parse failure degrades to the imperial preset rather than raising. This
value is read during frontend bootstrap, so an exception here would take the
whole app down for logged-out users on nothing worse than a hand-edited setting.
The fallback is logged at warning level so a malformed row is still visible.
"""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.units import IMPERIAL_PRESET, UnitSet
from app.models.settings import Setting

logger = logging.getLogger(__name__)

DEFAULT_UNIT_PREFS_KEY = "default_unit_prefs"


def parse_default_unit_prefs(raw: str | None) -> UnitSet:
    """Parse a stored default unit set, falling back to the imperial preset.

    A partial or out-of-vocabulary set falls back whole rather than being
    patched field by field: filling the gaps from the imperial preset would hand
    a metric instance imperial pressure, which is a worse outcome than an honest
    default.
    """
    if not raw:
        return IMPERIAL_PRESET
    try:
        payload = json.loads(raw)
    except ValueError, TypeError:
        logger.warning("default_unit_prefs is not valid JSON; using the imperial preset")
        return IMPERIAL_PRESET
    if not isinstance(payload, dict):
        logger.warning("default_unit_prefs is not a JSON object; using the imperial preset")
        return IMPERIAL_PRESET
    try:
        return UnitSet.model_validate(payload)
    except ValidationError:
        logger.warning(
            "default_unit_prefs does not describe a complete unit set; using the imperial preset"
        )
        return IMPERIAL_PRESET


async def load_default_unit_prefs(db: AsyncSession) -> UnitSet:
    """Return the instance default unit set, or the imperial preset."""
    row = (
        await db.execute(select(Setting).where(Setting.key == DEFAULT_UNIT_PREFS_KEY))
    ).scalar_one_or_none()
    return parse_default_unit_prefs(row.value if row is not None else None)
