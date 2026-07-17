"""Tests for TelemetryService.store_torque_telemetry: idempotent, non-committing write path."""

import itertools
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.livelink_parameter import LiveLinkParameter
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_telemetry import VehicleTelemetry, VehicleTelemetryLatest
from app.services.telemetry_service import TelemetryService

# Module-level counter for unique identifiers across all tests in this file.
_SEQ = itertools.count()

FIXED_TS = datetime(2026, 7, 17, 12, 0, 0)  # naive UTC


async def _make_vehicle(db_session: AsyncSession) -> tuple[str, str]:
    """Create a minimal user + vehicle, return (vin, device_id)."""
    n = next(_SEQ)
    user = User(
        username=f"torque_tel_user_{n}",
        email=f"torque_tel_{n}@example.com",
        hashed_password="x",
        is_active=True,
        is_admin=False,
    )
    db_session.add(user)
    await db_session.flush()

    vin = f"TORQTELTEST{n:06d}"  # 17 chars
    vehicle = Vehicle(
        vin=vin,
        user_id=user.id,
        nickname=f"Torque Tel Car {n}",
        vehicle_type="Car",
    )
    db_session.add(vehicle)
    await db_session.flush()

    device_id = f"tq_tel_{n:06d}"
    return vin, device_id


@pytest.mark.asyncio
async def test_first_write_inserts_two_rows_and_returns_two(db_session: AsyncSession):
    """First write of 2 params at one timestamp inserts 2 rows, returns 2."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    count = await service.store_torque_telemetry(
        vin, device_id, FIXED_TS, {"SPEED": 60.0, "ENGINE_RPM": 1800.0}
    )
    await db_session.commit()

    assert count == 2

    result = await db_session.execute(
        select(VehicleTelemetry).where(VehicleTelemetry.device_id == device_id)
    )
    rows = result.scalars().all()
    assert {r.param_key for r in rows} == {"SPEED", "ENGINE_RPM"}
    assert {r.value for r in rows} == {60.0, 1800.0}


@pytest.mark.asyncio
async def test_rewriting_identical_row_returns_zero_no_duplicate(db_session: AsyncSession):
    """Re-writing the identical (device_id, param_key, timestamp) dedups to 0."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    first = await service.store_torque_telemetry(vin, device_id, FIXED_TS, {"SPEED": 60.0})
    await db_session.commit()
    assert first == 1

    second = await service.store_torque_telemetry(vin, device_id, FIXED_TS, {"SPEED": 60.0})
    await db_session.commit()
    assert second == 0

    result = await db_session.execute(
        select(VehicleTelemetry).where(
            VehicleTelemetry.device_id == device_id,
            VehicleTelemetry.param_key == "SPEED",
        )
    )
    assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_unknown_param_key_auto_registers(db_session: AsyncSession):
    """An unrecognized param key auto-registers a LiveLinkParameter row."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    await service.store_torque_telemetry(vin, device_id, FIXED_TS, {"K1A": 12.3})
    await db_session.commit()

    result = await db_session.execute(
        select(LiveLinkParameter).where(LiveLinkParameter.param_key == "K1A")
    )
    assert result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_vehicle_telemetry_latest_holds_latest_value(db_session: AsyncSession):
    """vehicle_telemetry_latest reflects the newest value per param after the write."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    await service.store_torque_telemetry(vin, device_id, FIXED_TS, {"SPEED": 60.0})
    await db_session.commit()

    later_ts = FIXED_TS.replace(minute=1)
    await service.store_torque_telemetry(vin, device_id, later_ts, {"SPEED": 65.0})
    await db_session.commit()

    result = await db_session.execute(
        select(VehicleTelemetryLatest).where(
            VehicleTelemetryLatest.vin == vin,
            VehicleTelemetryLatest.param_key == "SPEED",
        )
    )
    latest = result.scalar_one()
    assert latest.value == 65.0
    assert latest.timestamp == later_ts


@pytest.mark.asyncio
async def test_does_not_commit_caller_owns_transaction(db_session: AsyncSession):
    """The method leaves the commit to the caller: a rollback discards the rows."""
    vin, device_id = await _make_vehicle(db_session)
    await db_session.commit()  # commit the vehicle/user fixture rows first

    service = TelemetryService(db_session)
    count = await service.store_torque_telemetry(vin, device_id, FIXED_TS, {"SPEED": 60.0})
    assert count == 1

    await db_session.rollback()

    result = await db_session.execute(
        select(VehicleTelemetry).where(VehicleTelemetry.device_id == device_id)
    )
    assert result.scalars().all() == []


@pytest.mark.asyncio
async def test_empty_values_returns_zero(db_session: AsyncSession):
    """Empty values dict is a no-op that returns 0."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    count = await service.store_torque_telemetry(vin, device_id, FIXED_TS, {})

    assert count == 0


@pytest.mark.asyncio
async def test_tz_aware_timestamp_normalized_to_naive(db_session: AsyncSession):
    """A tz-aware timestamp is stripped to naive UTC before storage."""
    vin, device_id = await _make_vehicle(db_session)
    service = TelemetryService(db_session)

    aware_ts = FIXED_TS.replace(tzinfo=UTC)
    count = await service.store_torque_telemetry(vin, device_id, aware_ts, {"SPEED": 60.0})
    await db_session.commit()

    assert count == 1
    result = await db_session.execute(
        select(VehicleTelemetry).where(VehicleTelemetry.device_id == device_id)
    )
    row = result.scalar_one()
    assert row.timestamp == FIXED_TS
    assert row.timestamp.tzinfo is None
