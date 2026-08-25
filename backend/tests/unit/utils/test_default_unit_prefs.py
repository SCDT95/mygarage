"""The public default unit set: parsing, validation, and fallback.

This row replaces the public imperial_gallon_standard setting for anonymous and
auth_mode=none clients (spec D5). Every failure mode must degrade to the
imperial preset rather than raising: it is read during frontend bootstrap, and a
500 there takes the whole app down for logged-out users.
"""

from __future__ import annotations

import json

import pytest

from app.constants.units import IMPERIAL_PRESET, METRIC_PRESET, UnitSet
from app.models.settings import Setting
from app.utils.default_unit_prefs import (
    DEFAULT_UNIT_PREFS_KEY,
    load_default_unit_prefs,
    parse_default_unit_prefs,
)


class TestParsing:
    def test_parses_a_full_valid_set(self) -> None:
        raw = json.dumps(METRIC_PRESET.model_dump())
        assert parse_default_unit_prefs(raw) == METRIC_PRESET

    def test_absent_value_falls_back_to_imperial(self) -> None:
        assert parse_default_unit_prefs(None) == IMPERIAL_PRESET

    def test_empty_string_falls_back_to_imperial(self) -> None:
        assert parse_default_unit_prefs("") == IMPERIAL_PRESET

    def test_malformed_json_falls_back_to_imperial(self) -> None:
        assert parse_default_unit_prefs("{not json") == IMPERIAL_PRESET

    def test_json_that_is_not_an_object_falls_back(self) -> None:
        assert parse_default_unit_prefs("[1, 2, 3]") == IMPERIAL_PRESET

    def test_missing_field_falls_back_to_imperial(self) -> None:
        """A partial set is not a set. Filling the gaps from the imperial preset
        would hand a metric instance imperial pressure, which is worse than an
        honest fallback."""
        partial = METRIC_PRESET.model_dump()
        del partial["pressure"]
        assert parse_default_unit_prefs(json.dumps(partial)) == IMPERIAL_PRESET

    def test_out_of_vocabulary_value_falls_back_to_imperial(self) -> None:
        bad = METRIC_PRESET.model_dump()
        bad["pressure"] = "atmospheres"
        assert parse_default_unit_prefs(json.dumps(bad)) == IMPERIAL_PRESET

    def test_unknown_extra_key_falls_back_to_imperial(self) -> None:
        """An extra key means the writer and reader disagree about the shape."""
        extra = METRIC_PRESET.model_dump()
        extra["unit_pressure"] = "kpa"
        assert parse_default_unit_prefs(json.dumps(extra)) == IMPERIAL_PRESET

    def test_never_raises_on_any_input(self) -> None:
        for raw in (None, "", "null", "0", '"str"', "{}", "[]", "\x00"):
            assert isinstance(parse_default_unit_prefs(raw), UnitSet)


@pytest.mark.asyncio
class TestLoading:
    async def test_reads_the_settings_row(self, db_session) -> None:
        """Writes and removes its own row: the suite shares one database with no
        per-test rollback."""
        db_session.add(
            Setting(
                key=DEFAULT_UNIT_PREFS_KEY,
                value=json.dumps(METRIC_PRESET.model_dump()),
                category="general",
            )
        )
        await db_session.commit()
        try:
            assert await load_default_unit_prefs(db_session) == METRIC_PRESET
        finally:
            row = await db_session.get(Setting, DEFAULT_UNIT_PREFS_KEY)
            if row is not None:
                await db_session.delete(row)
                await db_session.commit()

    async def test_absent_row_falls_back_to_imperial(self, db_session) -> None:
        row = await db_session.get(Setting, DEFAULT_UNIT_PREFS_KEY)
        if row is not None:
            await db_session.delete(row)
            await db_session.commit()

        assert await load_default_unit_prefs(db_session) == IMPERIAL_PRESET


@pytest.mark.asyncio
class TestPublicExposure:
    async def test_public_settings_includes_default_unit_prefs(self, client, db_session) -> None:
        """Anonymous clients must be able to read it without authenticating; that
        is the entire reason the row exists (D5).

        Seeds its own row: the `client` fixture never runs the ASGI lifespan, so
        `DEFAULT_SETTINGS` (Step 5) never gets applied to the shared test
        database. Only deletes what it added, matching TestLoading above.
        """
        existing = await db_session.get(Setting, DEFAULT_UNIT_PREFS_KEY)
        seeded = existing is None
        if seeded:
            db_session.add(
                Setting(
                    key=DEFAULT_UNIT_PREFS_KEY,
                    value=json.dumps(IMPERIAL_PRESET.model_dump()),
                    category="general",
                )
            )
            await db_session.commit()
        try:
            response = await client.get("/api/settings/public")

            assert response.status_code == 200
            keys = {s["key"] for s in response.json()["settings"]}
            assert "default_unit_prefs" in keys
        finally:
            if seeded:
                row = await db_session.get(Setting, DEFAULT_UNIT_PREFS_KEY)
                if row is not None:
                    await db_session.delete(row)
                    await db_session.commit()

    async def test_public_settings_still_includes_the_retiring_gallon_key(
        self, client, db_session
    ) -> None:
        """imperial_gallon_standard is not retired until a later phase; removing
        it now would break useGallonStandardSync.ts on the spot.

        Seeds its own row for the same reason as above.
        """
        existing = await db_session.get(Setting, "imperial_gallon_standard")
        seeded = existing is None
        if seeded:
            db_session.add(Setting(key="imperial_gallon_standard", value="us", category="general"))
            await db_session.commit()
        try:
            response = await client.get("/api/settings/public")

            keys = {s["key"] for s in response.json()["settings"]}
            assert "imperial_gallon_standard" in keys
        finally:
            if seeded:
                row = await db_session.get(Setting, "imperial_gallon_standard")
                if row is not None:
                    await db_session.delete(row)
                    await db_session.commit()
