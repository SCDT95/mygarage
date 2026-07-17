"""Integration tests for the global supplies catalog router (`/api/supplies`).

Catalog CRUD only (Task 6). Purchase/adjustment/receipt routes (Tasks 7/8)
don't exist yet — those tests belong in later tasks and will grow this file.
"""

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supply import SupplyPurchase

pytestmark = [pytest.mark.integration, pytest.mark.asyncio, pytest.mark.supplies]


async def test_create_and_list_supply(client: AsyncClient, auth_headers):
    """A freshly created supply appears in the list with a zero balance."""
    r = await client.post(
        "/api/supplies",
        json={"name": "Mobil 1 5W-30", "unit_type": "volume"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    body = r.json()
    sid = body["id"]
    assert body["name"] == "Mobil 1 5W-30"
    assert body["unit_type"] == "volume"
    assert body["is_active"] is True
    assert float(body["on_hand"]) == 0.0
    assert body["is_negative"] is False

    lr = await client.get("/api/supplies", headers=auth_headers)
    assert lr.status_code == 200
    lbody = lr.json()
    item = next(s for s in lbody["supplies"] if s["id"] == sid)
    assert float(item["on_hand"]) == 0.0
    assert item["is_negative"] is False
    assert item["avg_unit_cost"] is None


async def test_list_requires_auth(client: AsyncClient):
    assert (await client.get("/api/supplies")).status_code == 401


async def test_get_supply(client: AsyncClient, auth_headers):
    sid = (
        await client.post(
            "/api/supplies",
            json={"name": "Air Filter", "unit_type": "count"},
            headers=auth_headers,
        )
    ).json()["id"]

    gr = await client.get(f"/api/supplies/{sid}", headers=auth_headers)
    assert gr.status_code == 200
    body = gr.json()
    assert body["id"] == sid
    assert body["name"] == "Air Filter"
    assert body["unit_type"] == "count"


async def test_get_supply_not_found(client: AsyncClient, auth_headers):
    assert (await client.get("/api/supplies/999999", headers=auth_headers)).status_code == 404


async def test_update_supply(client: AsyncClient, auth_headers):
    sid = (
        await client.post(
            "/api/supplies",
            json={"name": "Old Name", "unit_type": "count"},
            headers=auth_headers,
        )
    ).json()["id"]

    pr = await client.patch(
        f"/api/supplies/{sid}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert pr.status_code == 200
    body = pr.json()
    assert body["name"] == "New Name"
    # unit_type unaffected — immutable, not part of SupplyUpdate
    assert body["unit_type"] == "count"


async def test_delete_hard_deletes_supply_without_history(client: AsyncClient, auth_headers):
    """A supply with no purchase/usage history is hard-deleted, not archived."""
    sid = (
        await client.post(
            "/api/supplies",
            json={"name": "Unused Widget", "unit_type": "count"},
            headers=auth_headers,
        )
    ).json()["id"]

    dr = await client.delete(f"/api/supplies/{sid}", headers=auth_headers)
    assert dr.status_code == 204

    gr = await client.get(f"/api/supplies/{sid}", headers=auth_headers)
    assert gr.status_code == 404


async def test_delete_archives_supply_with_history(
    client: AsyncClient, auth_headers, db_session: AsyncSession
):
    """A supply with ledger history is soft-archived: excluded from the default
    list, still visible with ?include_archived=true, and is_active=False."""
    sid = (
        await client.post(
            "/api/supplies", json={"name": "Filter", "unit_type": "count"}, headers=auth_headers
        )
    ).json()["id"]

    # Seed history directly (Task 7's purchase route doesn't exist yet).
    purchase = SupplyPurchase(supply_id=sid, date=date(2026, 1, 1), quantity=Decimal("3"))
    db_session.add(purchase)
    await db_session.flush()

    dr = await client.delete(f"/api/supplies/{sid}", headers=auth_headers)
    assert dr.status_code == 204

    default = (await client.get("/api/supplies", headers=auth_headers)).json()
    assert all(s["id"] != sid for s in default["supplies"])

    archived = (
        await client.get("/api/supplies?include_archived=true", headers=auth_headers)
    ).json()
    match = next(s for s in archived["supplies"] if s["id"] == sid)
    assert match["is_active"] is False
