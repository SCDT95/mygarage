import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.livelink_device import LiveLinkDevice
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_telemetry import VehicleTelemetry
from app.services.telemetry_service import TelemetryService


@pytest_asyncio.fixture
async def make_vehicle_and_device(db_session: AsyncSession):
    """Async factory: creates a minimal user, vehicle, and device.

    Returns an async callable: (db_session) -> (vin, device_id).
    Columns are limited to those that exist on the models right now
    (Task 2 adds device_address / sd_backfill_enabled / device_status).
    """

    async def _factory(session: AsyncSession) -> tuple[str, str]:
        # User
        user = User(
            username="canon_test_user",
            email="canon_test@example.com",
            hashed_password="x",
            is_active=True,
            is_admin=False,
        )
        session.add(user)
        await session.flush()

        # Vehicle
        vin = "CANONTEST0000001"
        vehicle = Vehicle(
            vin=vin,
            user_id=user.id,
            nickname="Canon Test Car",
            vehicle_type="Car",
        )
        session.add(vehicle)
        await session.flush()

        # Device
        device_id = "aabbccddeeff01"
        device = LiveLinkDevice(
            device_id=device_id,
            vin=vin,
            enabled=True,
        )
        session.add(device)
        await session.flush()

        return vin, device_id

    return _factory


@pytest.mark.asyncio
async def test_store_telemetry_canonicalizes_keys(db_session, make_vehicle_and_device):
    vin, device_id = await make_vehicle_and_device(db_session)
    svc = TelemetryService(db_session)
    # Mixed-case (HTTPS-style) and an already-uppercase (MQTT-style) key for the
    # same PID must both land on the same uppercase param_key.
    await svc.store_telemetry(vin, device_id, {"0C-EngineRPM": 1000}, {}, None)
    await svc.store_telemetry(vin, device_id, {"0C-ENGINERPM": 1001}, {}, None)

    # Query param_keys stored for this device directly (no production helper needed)
    result = await db_session.execute(
        select(VehicleTelemetry.param_key).where(VehicleTelemetry.device_id == device_id).distinct()
    )
    rows = {row[0] for row in result.fetchall()}

    assert "0C-ENGINERPM" in rows
    assert "0C-EngineRPM" not in rows
