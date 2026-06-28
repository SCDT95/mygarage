"""Integration tests for /api/v2/widget/* endpoints.

Covers the metric+imperial vehicle rollup, the 404-not-403 out-of-scope
contract, and the auth requirement. Business-logic correctness for the
aggregates lives in tests/unit/services/test_widget_aggregation.py.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select

from app.models.fuel import FuelRecord
from app.models.odometer import OdometerRecord
from app.models.settings import Setting
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.widget_api_key import WidgetApiKey
from app.services.widget_auth import display_prefix, generate_widget_key, hash_widget_key

TEST_PASSWORD_HASH = (
    "$argon2id$v=19$m=102400,t=2,p=8$NNbLa8SMLODWY2Es68EvLw"
    "$hiGLA+DtO213EMAMi8D8gXvvyjP8EVMFIHWp7SlUVnI"
)


def _unique_vin() -> str:
    return ("WV2" + uuid.uuid4().hex)[:17].upper()


@pytest_asyncio.fixture
async def set_auth_mode(db_session):
    """Set the auth_mode setting; reset to 'local' afterwards."""

    async def _apply(mode: str | None) -> None:
        existing = (
            await db_session.execute(select(Setting).where(Setting.key == "auth_mode"))
        ).scalar_one_or_none()
        if existing is None:
            if mode is not None:
                db_session.add(Setting(key="auth_mode", value=mode))
        elif mode is None:
            await db_session.delete(existing)
        else:
            existing.value = mode
        await db_session.commit()

    yield _apply
    await _apply("local")


@pytest_asyncio.fixture
async def widget_owner(db_session) -> User:
    """Key-owning user, unique per-run."""
    u = User(
        username=f"widget_v2_owner_{uuid.uuid4().hex[:8]}",
        email=f"widget_v2_owner_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=TEST_PASSWORD_HASH,
        is_active=True,
        is_admin=False,
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


async def _make_vehicle(db_session, user: User, **overrides) -> Vehicle:
    v = Vehicle(
        vin=overrides.get("vin", _unique_vin()),
        nickname=overrides.get("nickname", "Test"),
        vehicle_type=overrides.get("vehicle_type", "Car"),
        user_id=user.id,
        year=overrides.get("year", 2022),
        make=overrides.get("make", "Honda"),
        model=overrides.get("model", "Civic"),
        archived_at=overrides.get("archived_at"),
    )
    db_session.add(v)
    await db_session.commit()
    await db_session.refresh(v)
    return v


async def _make_key(
    db_session,
    user: User,
    *,
    scope: str = "all_vehicles",
    allowed_vins: list[str] | None = None,
) -> str:
    plaintext = generate_widget_key()
    db_session.add(
        WidgetApiKey(
            user_id=user.id,
            name="test",
            key_hash=hash_widget_key(plaintext),
            key_prefix=display_prefix(plaintext),
            scope=scope,
            allowed_vins=allowed_vins,
        )
    )
    await db_session.commit()
    return plaintext


async def _seed_two_full_tanks(db_session, vin: str) -> None:
    """Two consecutive full tanks -> one calculable consumption pair (metric)."""
    for d, km in ((date(2026, 1, 1), Decimal("16000")), (date(2026, 1, 15), Decimal("16500"))):
        db_session.add(
            FuelRecord(
                vin=vin,
                date=d,
                odometer_km=km,
                liters=Decimal("38.0"),
                price_per_unit=Decimal("1.50"),
                cost=Decimal("57.00"),
                is_full_tank=True,
            )
        )
    await db_session.commit()


async def _seed_odometer(db_session, vin: str) -> None:
    """Odometer is read from OdometerRecord, not fuel rows (R1-F1)."""
    db_session.add(OdometerRecord(vin=vin, odometer_km=Decimal("16500"), date=date(2026, 1, 15)))
    await db_session.commit()


@pytest.mark.integration
@pytest.mark.asyncio
class TestWidgetV2Vehicle:
    async def test_vehicle_v2_returns_both_unit_systems(
        self, client: AsyncClient, db_session, widget_owner, set_auth_mode
    ):
        await set_auth_mode("local")
        v = await _make_vehicle(db_session, widget_owner)
        await _seed_two_full_tanks(db_session, v.vin)
        await _seed_odometer(db_session, v.vin)
        plaintext = await _make_key(db_session, widget_owner)

        resp = await client.get(f"/api/v2/widget/vehicle/{v.vin}", headers={"X-API-Key": plaintext})
        assert resp.status_code == 200
        d = resp.json()
        for field in (
            "odometer",
            "odometer_km",
            "recent_l_per_100km",
            "recent_km_per_l",
            "recent_mpg",
        ):
            assert field in d
        assert d["odometer"] is not None and d["odometer_km"] is not None
        assert d["recent_km_per_l"] == round(100 / d["recent_l_per_100km"], 2)

    async def test_out_of_scope_vin_returns_404_not_403(
        self, client: AsyncClient, db_session, widget_owner, set_auth_mode
    ):
        await set_auth_mode("local")
        mine = await _make_vehicle(db_session, widget_owner)
        theirs = await _make_vehicle(db_session, widget_owner)
        plaintext = await _make_key(
            db_session, widget_owner, scope="selected_vins", allowed_vins=[mine.vin]
        )
        resp = await client.get(
            f"/api/v2/widget/vehicle/{theirs.vin}", headers={"X-API-Key": plaintext}
        )
        assert resp.status_code == 404

    async def test_missing_key_returns_401(self, client: AsyncClient, set_auth_mode):
        await set_auth_mode("local")
        resp = await client.get("/api/v2/widget/summary")
        assert resp.status_code == 401
