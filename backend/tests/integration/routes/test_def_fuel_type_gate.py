"""Integration tests for the fuel-type gate on DEF record create/update.

Task 5 of the fuel-type hardening plan wires `ensure_def_capable`
(`app/utils/def_sync.py`, added in Task 4) into `create_def_record` /
`update_def_record` only. List, get, analytics, and delete stay
ungated on purpose (Jamey's decision, see task-5-brief.md): legacy
non-diesel DEF data must remain readable, and delete must remain
possible so junk data can be cleaned up.

Tasks 6-8 extend this file with further fuel-type-hardening gate cases.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.def_record import DEFRecord
from app.models.vehicle import Vehicle

GATE_DETAIL = "DEF tracking applies only to diesel vehicles"


def _unique_vin() -> str:
    """17-char VIN, unique per call."""
    return ("GATE" + uuid.uuid4().hex)[:17].upper()


async def _make_vehicle(
    db_session: AsyncSession,
    user_id: int,
    *,
    fuel_type: str | None = None,
    fuel_type_secondary: str | None = None,
) -> Vehicle:
    vehicle = Vehicle(
        vin=_unique_vin(),
        user_id=user_id,
        nickname="Gate Test Vehicle",
        vehicle_type="Car",
        year=2020,
        make="Test",
        model="Model",
        fuel_type=fuel_type,
        fuel_type_secondary=fuel_type_secondary,
    )
    db_session.add(vehicle)
    await db_session.commit()
    await db_session.refresh(vehicle)
    return vehicle


async def _seed_def_record(db_session: AsyncSession, vin: str) -> DEFRecord:
    """Insert a DEF record directly via the DB, bypassing the (now-gated) API."""
    record = DEFRecord(
        vin=vin,
        date=date(2024, 1, 1),
        liters=Decimal("9.464"),
        fill_level=Decimal("0.50"),
    )
    db_session.add(record)
    await db_session.commit()
    await db_session.refresh(record)
    return record


@pytest_asyncio.fixture
async def gasoline_vehicle(db_session: AsyncSession, test_user: dict[str, object]) -> Vehicle:
    return await _make_vehicle(db_session, test_user["id"], fuel_type="gasoline")


@pytest.mark.integration
@pytest.mark.def_records
@pytest.mark.asyncio
class TestDEFFuelTypeGate:
    """Gate DEF record create/update to diesel-capable vehicles only."""

    async def test_create_def_record_on_gasoline_vehicle_rejected(
        self, client: AsyncClient, auth_headers, gasoline_vehicle: Vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{gasoline_vehicle.vin}/def",
            json={"vin": gasoline_vehicle.vin, "date": "2024-01-15", "liters": 9.464},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert response.json()["detail"] == GATE_DETAIL

    async def test_update_def_record_on_gasoline_vehicle_rejected(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        gasoline_vehicle: Vehicle,
    ):
        # Seed via DB directly since the API now refuses create on this vehicle.
        record = await _seed_def_record(db_session, gasoline_vehicle.vin)

        response = await client.put(
            f"/api/vehicles/{gasoline_vehicle.vin}/def/{record.id}",
            json={"cost": 25.00},
            headers=auth_headers,
        )

        assert response.status_code == 400
        assert response.json()["detail"] == GATE_DETAIL

    async def test_list_def_records_on_gasoline_vehicle_stays_ungated(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        gasoline_vehicle: Vehicle,
    ):
        await _seed_def_record(db_session, gasoline_vehicle.vin)

        response = await client.get(
            f"/api/vehicles/{gasoline_vehicle.vin}/def",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["total"] == 1

    async def test_analytics_on_gasoline_vehicle_stays_ungated(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        gasoline_vehicle: Vehicle,
    ):
        await _seed_def_record(db_session, gasoline_vehicle.vin)

        response = await client.get(
            f"/api/vehicles/{gasoline_vehicle.vin}/def/analytics",
            headers=auth_headers,
        )

        assert response.status_code == 200

    async def test_delete_def_record_on_gasoline_vehicle_stays_ungated(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        gasoline_vehicle: Vehicle,
    ):
        record = await _seed_def_record(db_session, gasoline_vehicle.vin)

        response = await client.delete(
            f"/api/vehicles/{gasoline_vehicle.vin}/def/{record.id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

    async def test_create_def_record_on_diesel_vehicle_allowed(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        test_user: dict[str, object],
    ):
        vehicle = await _make_vehicle(db_session, test_user["id"], fuel_type="diesel")

        response = await client.post(
            f"/api/vehicles/{vehicle.vin}/def",
            json={"vin": vehicle.vin, "date": "2024-01-15", "liters": 9.464},
            headers=auth_headers,
        )

        assert response.status_code == 201

    async def test_create_def_record_on_gasoline_primary_diesel_secondary_allowed(
        self,
        client: AsyncClient,
        auth_headers,
        db_session: AsyncSession,
        test_user: dict[str, object],
    ):
        vehicle = await _make_vehicle(
            db_session,
            test_user["id"],
            fuel_type="gasoline",
            fuel_type_secondary="diesel",
        )

        response = await client.post(
            f"/api/vehicles/{vehicle.vin}/def",
            json={"vin": vehicle.vin, "date": "2024-01-15", "liters": 9.464},
            headers=auth_headers,
        )

        assert response.status_code == 201
