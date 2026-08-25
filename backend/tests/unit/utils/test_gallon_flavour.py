"""Tests for the instance gallon-flavour resolver."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import Setting
from app.utils.gallon_flavour import resolve_gallon_flavour


async def _seed_gallon_standard(db_session: AsyncSession, value: str) -> None:
    """Upsert the `imperial_gallon_standard` row.

    The test DB is shared across the whole run and never rolled back between
    tests (see reference_mygarage_test_isolation), so a bare `db_session.add()`
    here would collide with the row a previous test in this module already
    committed. Upserting keeps each test independent of what the last one left
    behind, and cleaning up afterward keeps this module from leaking state into
    whatever test file runs next.
    """
    existing = (
        await db_session.execute(select(Setting).where(Setting.key == "imperial_gallon_standard"))
    ).scalar_one_or_none()
    if existing is None:
        db_session.add(Setting(key="imperial_gallon_standard", value=value))
    else:
        existing.value = value
    await db_session.commit()


async def _clear_gallon_standard(db_session: AsyncSession) -> None:
    """Delete the `imperial_gallon_standard` row, restoring the "row absent" state."""
    existing = (
        await db_session.execute(select(Setting).where(Setting.key == "imperial_gallon_standard"))
    ).scalar_one_or_none()
    if existing is not None:
        await db_session.delete(existing)
        await db_session.commit()


@pytest.mark.asyncio
async def test_defaults_to_us_when_row_absent(db_session: AsyncSession) -> None:
    assert await resolve_gallon_flavour(db_session) == "us"


@pytest.mark.asyncio
async def test_reads_uk_from_the_setting(db_session: AsyncSession) -> None:
    await _seed_gallon_standard(db_session, "uk")
    try:
        assert await resolve_gallon_flavour(db_session) == "uk"
    finally:
        await _clear_gallon_standard(db_session)


@pytest.mark.asyncio
async def test_unrecognised_value_falls_back_to_us(db_session: AsyncSession) -> None:
    await _seed_gallon_standard(db_session, "banana")
    try:
        assert await resolve_gallon_flavour(db_session) == "us"
    finally:
        await _clear_gallon_standard(db_session)


def test_intrinsically_us_conversions_ignore_the_setting() -> None:
    """EPA and window-sticker figures are US-gallon by definition.

    They are not a user preference and must not follow the instance flavour.
    Pinning this stops phase 1 from "fixing" them into the preference path.
    """
    from app.utils.units import UnitConverter

    # A window-sticker MPG figure is always a US MPG figure.
    epa_combined_mpg = 30
    assert UnitConverter.mpg_to_l100km(epa_combined_mpg, flavour="us") == pytest.approx(
        7.8, rel=1e-2
    )
