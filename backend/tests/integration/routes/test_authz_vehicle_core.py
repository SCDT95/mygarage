"""Negative-authz tests for Phase 1 of the v2.28.0 hardening.

Covers the fix-first set: vehicle delete = OWNER-only (D-3), transfer-history
and spot-rental-billing IDORs (Group C), and LiveLink infra = ADMIN-only
(Group D infra). The matrix fixtures live in ``conftest.py``.
"""

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.spot_rental import SpotRental
from app.models.user import User
from app.models.vehicle import Vehicle

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


# --- Vehicle delete = OWNER-only (D-3) ---------------------------------------


class TestVehicleDeleteOwnerOnly:
    async def test_read_share_cannot_delete(
        self, client: AsyncClient, owned_vehicle: Vehicle, reader_headers
    ):
        resp = await client.delete(f"/api/vehicles/{owned_vehicle.vin}", headers=reader_headers)
        assert resp.status_code == 403

    async def test_write_share_cannot_delete(
        self, client: AsyncClient, owned_vehicle: Vehicle, writer_headers
    ):
        # The crux of D-3: a write-share must NOT be able to delete the vehicle.
        resp = await client.delete(f"/api/vehicles/{owned_vehicle.vin}", headers=writer_headers)
        assert resp.status_code == 403

    async def test_unrelated_cannot_delete(
        self, client: AsyncClient, owned_vehicle: Vehicle, unrelated_headers
    ):
        resp = await client.delete(f"/api/vehicles/{owned_vehicle.vin}", headers=unrelated_headers)
        assert resp.status_code == 403

    async def test_owner_can_delete(
        self, client: AsyncClient, owned_vehicle: Vehicle, owner_headers
    ):
        resp = await client.delete(f"/api/vehicles/{owned_vehicle.vin}", headers=owner_headers)
        assert resp.status_code == 204

    async def test_admin_can_delete(
        self, client: AsyncClient, owned_vehicle: Vehicle, admin_user_headers
    ):
        resp = await client.delete(f"/api/vehicles/{owned_vehicle.vin}", headers=admin_user_headers)
        assert resp.status_code == 204


# --- Transfer-history IDOR (Group C) -----------------------------------------


class TestTransferHistoryIDOR:
    def _url(self, vin: str) -> str:
        return f"/api/family/vehicles/{vin}/transfer-history"

    async def test_unrelated_forbidden(
        self, client: AsyncClient, owned_vehicle: Vehicle, unrelated_headers
    ):
        resp = await client.get(self._url(owned_vehicle.vin), headers=unrelated_headers)
        assert resp.status_code in (403, 404)

    async def test_owner_allowed(self, client: AsyncClient, owned_vehicle: Vehicle, owner_headers):
        resp = await client.get(self._url(owned_vehicle.vin), headers=owner_headers)
        assert resp.status_code == 200

    async def test_read_share_allowed(
        self, client: AsyncClient, owned_vehicle: Vehicle, reader_headers
    ):
        # Read access is sufficient to view history.
        resp = await client.get(self._url(owned_vehicle.vin), headers=reader_headers)
        assert resp.status_code == 200


# --- Spot-rental billing IDOR + write-share (Group C) ------------------------


@pytest_asyncio.fixture
async def spot_rental(db_session: AsyncSession, owned_vehicle: Vehicle) -> SpotRental:
    rental = SpotRental(
        vin=owned_vehicle.vin,
        location_name="Test RV Park",
        check_in_date=date.today() - timedelta(days=30),
        check_out_date=None,
    )
    db_session.add(rental)
    await db_session.commit()
    await db_session.refresh(rental)
    return rental


def _billing_payload() -> dict:
    return {
        "billing_date": date.today().isoformat(),
        "monthly_rate": "500.00",
        "total": "550.00",
    }


class TestSpotRentalBillingAuthz:
    def _base(self, vin: str, rental_id: int) -> str:
        return f"/api/vehicles/{vin}/spot-rentals/{rental_id}/billings"

    async def test_unrelated_cannot_list(
        self, client: AsyncClient, spot_rental: SpotRental, unrelated_headers
    ):
        resp = await client.get(
            self._base(spot_rental.vin, spot_rental.id), headers=unrelated_headers
        )
        assert resp.status_code in (403, 404)

    async def test_reader_can_list(
        self, client: AsyncClient, spot_rental: SpotRental, reader_headers
    ):
        resp = await client.get(self._base(spot_rental.vin, spot_rental.id), headers=reader_headers)
        assert resp.status_code == 200

    async def test_reader_cannot_create(
        self, client: AsyncClient, spot_rental: SpotRental, reader_headers
    ):
        resp = await client.post(
            self._base(spot_rental.vin, spot_rental.id),
            json=_billing_payload(),
            headers=reader_headers,
        )
        assert resp.status_code == 403

    async def test_writer_can_create(
        self, client: AsyncClient, spot_rental: SpotRental, writer_headers
    ):
        resp = await client.post(
            self._base(spot_rental.vin, spot_rental.id),
            json=_billing_payload(),
            headers=writer_headers,
        )
        assert resp.status_code == 201

    async def test_reader_cannot_delete(
        self, client: AsyncClient, spot_rental: SpotRental, writer_headers, reader_headers
    ):
        # Create as writer, then verify reader cannot delete.
        created = await client.post(
            self._base(spot_rental.vin, spot_rental.id),
            json=_billing_payload(),
            headers=writer_headers,
        )
        billing_id = created.json()["id"]
        resp = await client.delete(
            f"{self._base(spot_rental.vin, spot_rental.id)}/{billing_id}",
            headers=reader_headers,
        )
        assert resp.status_code == 403


# --- LiveLink infra = ADMIN-only (Group D infra) -----------------------------


class TestLiveLinkInfraAdminOnly:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("get", "/api/livelink/settings"),
            ("post", "/api/livelink/token"),
            ("get", "/api/livelink/devices"),
            ("get", "/api/livelink/parameters"),
            ("get", "/api/livelink/mqtt/settings"),
            ("get", "/api/livelink/mqtt/status"),
            ("get", "/api/livelink/firmware/latest"),
        ],
    )
    async def test_non_admin_forbidden(
        self, client: AsyncClient, owner_headers, method: str, path: str
    ):
        resp = await client.request(method, path, headers=owner_headers)
        assert resp.status_code == 403

    async def test_admin_allowed_settings(
        self, client: AsyncClient, admin_user_headers, owner_user: User
    ):
        resp = await client.get("/api/livelink/settings", headers=admin_user_headers)
        assert resp.status_code == 200
