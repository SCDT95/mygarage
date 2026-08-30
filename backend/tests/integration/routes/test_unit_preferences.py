"""The dedicated unit mutation (spec D9b).

`PUT /auth/me` cannot express "clear this column": `routes/auth.py` guards every
field with `if ... is not None`, so an explicit null is indistinguishable from
an omitted field. These tests pin the semantics that guard replaces.
"""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.units import (
    IMPERIAL_PRESET,
    METRIC_PRESET,
    UNIT_COLUMN_NAMES,
    field_to_column,
)
from app.models.user import User

UK_CUSTOM = {
    "distance": "mi",
    "speed": "mph",
    "length": "ft",
    "volume": "gal_uk",
    "consumption": "mpg_uk",
    "pressure": "psi",
    "temperature": "f",
    "mass": "lb",
    "torque": "lbft",
    "tread": "in32",
    "secondary_gallon": "uk",
}


@pytest_asyncio.fixture(autouse=True)
async def restore_unit_state(
    db_session: AsyncSession, test_user: dict[str, object]
) -> AsyncGenerator[None]:
    """Put the shared test user's unit state back after every test in this file.

    The suite shares one database and has no per-test rollback, and `test_user`
    resets only `accent_color` and `theme`. Every test here writes the eleven
    override columns, `unit_preference` and (in one case) `show_both_units`, so
    without this fixture a UK-custom row leaks into every later test file.

    The column list is derived from `UNIT_COLUMN_NAMES` rather than
    hand-written, so a twelfth quantity is restored without touching this file.
    """
    tracked = ("unit_preference", "show_both_units", *UNIT_COLUMN_NAMES)

    async def _load() -> User:
        return (
            await db_session.execute(select(User).where(User.id == test_user["id"]))
        ).scalar_one()

    user = await _load()
    snapshot = {column: getattr(user, column) for column in tracked}

    try:
        yield
    finally:
        user = await _load()
        for column, value in snapshot.items():
            setattr(user, column, value)
        await db_session.commit()


@pytest.mark.integration
@pytest.mark.auth
@pytest.mark.asyncio
class TestUnitPreferenceMutation:
    """The `PUT /auth/me/units` route: presets clear, custom materialises."""

    async def test_choosing_a_preset_clears_a_materialised_override_set(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """A UK-custom account that picks Imperial renders the imperial preset.

        This is the release-blocking defect: today the button writes
        `unit_preference` and leaves eleven override columns masking it, so the
        response comes back still saying `gal_uk`.

        The setup write is asserted, not merely issued. Against an
        implementation that never materialises anything, an unchecked setup
        leaves eleven NULL columns and the preset then resolves correctly for
        the wrong reason, so the test passes without ever clearing an override.
        """
        setup = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "custom", "units": UK_CUSTOM},
            headers=auth_headers,
        )
        assert setup.status_code == 200
        assert setup.json()["resolved_units"] == UK_CUSTOM

        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "imperial"},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["resolved_units"] == IMPERIAL_PRESET.model_dump()

    async def test_choosing_custom_materialises_every_column(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """Custom writes all eleven, so no column is left resolving from the base."""
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "custom", "units": UK_CUSTOM},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["resolved_units"] == UK_CUSTOM

    async def test_custom_without_a_unit_set_is_rejected(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """D3 forbids a partial custom: it would leave the base masking columns."""
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "custom"},
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_a_preset_carrying_a_unit_set_is_rejected(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """Silently discarding the set would make the request's intent unknowable."""
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "metric", "units": UK_CUSTOM},
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_an_out_of_vocabulary_unit_is_rejected(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """The columns carry no database CHECK, so the schema is the only gate."""
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "custom", "units": UK_CUSTOM | {"pressure": "atm"}},
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_an_unknown_top_level_field_is_rejected(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """`extra="forbid"` is the only thing between a typo and a silent no-op.

        Without this case, deleting `model_config` from `UnitPreferenceUpdate`
        leaves every other test in this file green: none of them sends an
        unknown key. A guard no test can kill is a guard that will be removed
        by someone tidying up, and the failure mode is silent, a request that
        returns 200 having ignored the half the client cared about.
        """
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "metric", "unit_prefrence": "imperial"},
            headers=auth_headers,
        )

        assert response.status_code == 422

    async def test_show_both_units_rides_the_same_write(
        self, client: AsyncClient, auth_headers: dict[str, str]
    ) -> None:
        """R2: one gesture reveals `secondary_gallon` and sets the flag that reveals it."""
        response = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "metric", "show_both_units": True},
            headers=auth_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert body["show_both_units"] is True
        assert body["resolved_units"] == METRIC_PRESET.model_dump()

    async def test_the_route_clears_every_column_the_model_declares(
        self,
        client: AsyncClient,
        auth_headers: dict[str, str],
        db_session: AsyncSession,
        test_user: dict[str, object],
    ) -> None:
        """A twelfth quantity must not silently escape the write or the clear.

        Derived from `UNIT_COLUMN_NAMES` rather than a hand-written list of eleven,
        so adding a quantity to `UnitSet` extends these assertions automatically.

        Both directions are asserted on purpose. A shared test user starts with
        eleven NULL columns, so the clear-side assertion alone is satisfied by
        the initial state and stays green against no route at all. The
        materialise-side assertion below is the one that is false at t=0.
        """

        async def columns() -> dict[str, object]:
            user = (
                await db_session.execute(select(User).where(User.id == test_user["id"]))
            ).scalar_one()
            return {column: getattr(user, column) for column in UNIT_COLUMN_NAMES}

        materialise = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "custom", "units": UK_CUSTOM},
            headers=auth_headers,
        )
        assert materialise.status_code == 200
        assert await columns() == {
            field_to_column(field): value for field, value in UK_CUSTOM.items()
        }

        clear = await client.put(
            "/api/auth/me/units",
            json={"unit_preference": "metric"},
            headers=auth_headers,
        )
        assert clear.status_code == 200
        assert await columns() == dict.fromkeys(UNIT_COLUMN_NAMES, None)
