"""Integration tests for service-visit total integration with parts/supplies (Task 9).

Task 9 wires ``ServiceVisit.calculated_total_cost`` to include supply-usage cost
snapshots and makes every read of that property async-safe (deep eager-load +
``_recompute_visit_total``). It does NOT yet persist ``supplies_used`` from the
create/update payload — that is Task 10. These tests cover:

(a) a no-supplies visit still returns ``parts_supplies_cost == 0`` and empty
    ``supply_usages`` on every line item (proves the property/response wiring
    is a no-op when there's nothing to add — the existing suite stays green).
(b) manually inserting a ``SupplyUsage`` (with a ``cost_snapshot``) against a
    visit's line item, then reading the visit back via the API, proves the
    deep eager-load chain avoids ``MissingGreenlet`` and that
    ``calculated_total_cost`` correctly folds in the supply cost.
"""

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supply import Supply, SupplyUsage
from app.models.vendor import Vendor

pytestmark = [pytest.mark.integration, pytest.mark.asyncio, pytest.mark.supplies]


async def test_visit_with_no_supplies_has_zero_parts_cost(
    client: AsyncClient, auth_headers, test_vehicle
):
    """A visit with no supply usages returns parts_supplies_cost == 0 and every
    line item's supply_usages == [] — the existing total-cost math is unaffected."""
    vin = test_vehicle["vin"]

    r = await client.post(
        f"/api/vehicles/{vin}/service-visits",
        json={
            "date": "2026-02-01",
            "service_category": "Maintenance",
            "tax_amount": "10.00",
            "line_items": [
                {"description": "Tire Rotation", "cost": "50.00"},
                {"description": "Multi-point Inspection", "cost": "0"},
            ],
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    body = r.json()

    assert float(body["parts_supplies_cost"]) == 0.0
    assert float(body["subtotal"]) == 50.0
    assert float(body["calculated_total_cost"]) == 60.0  # subtotal + tax, no supplies
    assert body["line_items"]
    for li in body["line_items"]:
        assert li["supply_usages"] == []

    # GET reads back the same shape (exercises get_service_visit's eager chain)
    gr = await client.get(f"/api/vehicles/{vin}/service-visits/{body['id']}", headers=auth_headers)
    assert gr.status_code == 200
    get_body = gr.json()
    assert float(get_body["parts_supplies_cost"]) == 0.0
    assert float(get_body["calculated_total_cost"]) == 60.0

    # LIST also carries the field without crashing (exercises the deep chain there too)
    lr = await client.get(f"/api/vehicles/{vin}/service-visits", headers=auth_headers)
    assert lr.status_code == 200
    listed = next(v for v in lr.json()["visits"] if v["id"] == body["id"])
    assert float(listed["parts_supplies_cost"]) == 0.0


async def test_get_visit_reads_manually_inserted_supply_usage_async_safely(
    client: AsyncClient, auth_headers, test_vehicle, db_session: AsyncSession
):
    """After inserting a SupplyUsage directly against a line item (bypassing the
    not-yet-built Task 10 persistence path), get_service_visit must read
    calculated_total_cost without MissingGreenlet, and the total must equal
    subtotal + fees + that usage's cost_snapshot."""
    vin = test_vehicle["vin"]

    r = await client.post(
        f"/api/vehicles/{vin}/service-visits",
        json={
            "date": "2026-02-01",
            "service_category": "Maintenance",
            "tax_amount": "5.00",
            "misc_fees": "2.50",
            "line_items": [{"description": "DIY Oil Change", "cost": "0"}],
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    visit_body = r.json()
    visit_id = visit_body["id"]
    line_item_id = visit_body["line_items"][0]["id"]

    # Manually insert a Supply + SupplyUsage — same db_session the client uses.
    supply = Supply(name="Oil", unit_type="volume")
    db_session.add(supply)
    await db_session.flush()

    usage = SupplyUsage(
        supply_id=supply.id,
        quantity=Decimal("5"),
        unit_cost_snapshot=Decimal("8.00"),
        cost_snapshot=Decimal("40.00"),
        service_line_item_id=line_item_id,
    )
    db_session.add(usage)
    await db_session.commit()

    # Reading the visit back must not raise MissingGreenlet (deep eager-load chain).
    gr = await client.get(f"/api/vehicles/{vin}/service-visits/{visit_id}", headers=auth_headers)
    assert gr.status_code == 200
    body = gr.json()

    assert float(body["parts_supplies_cost"]) == 40.0
    expected_total = (
        float(body["subtotal"]) + float(body["tax_amount"]) + float(body["misc_fees"]) + 40.0
    )
    assert float(body["calculated_total_cost"]) == expected_total

    li = body["line_items"][0]
    assert len(li["supply_usages"]) == 1
    assert float(li["supply_usages"][0]["cost_snapshot"]) == 40.0
    assert li["supply_usages"][0]["supply_name"] == "Oil"


async def test_update_visit_with_vendor_and_supply_usage_response_stays_intact(
    client: AsyncClient, auth_headers, test_vehicle, db_session: AsyncSession
):
    """update_service_visit returns the mutated `visit` object directly (no
    extra re-fetch) — it relies on the vendor + supply_usages relationships
    still being populated from the earlier get_service_visit call in the same
    request, since the mid-function recompute reload only re-loads
    line_items -> supply_usages (not vendor / usage.supply). This pins that
    a PUT on a visit that has BOTH a vendor and an existing supply usage
    still returns a complete response — vendor name and supply_name present,
    no MissingGreenlet — after that update."""
    vin = test_vehicle["vin"]

    vendor = Vendor(name="QuickLube Test Shop")
    db_session.add(vendor)
    await db_session.flush()

    r = await client.post(
        f"/api/vehicles/{vin}/service-visits",
        json={
            "date": "2026-02-01",
            "service_category": "Maintenance",
            "vendor_id": vendor.id,
            "line_items": [{"description": "DIY Oil Change", "cost": "0"}],
        },
        headers=auth_headers,
    )
    assert r.status_code == 201
    visit_body = r.json()
    visit_id = visit_body["id"]
    line_item_id = visit_body["line_items"][0]["id"]

    supply = Supply(name="Oil", unit_type="volume")
    db_session.add(supply)
    await db_session.flush()

    usage = SupplyUsage(
        supply_id=supply.id,
        quantity=Decimal("5"),
        unit_cost_snapshot=Decimal("8.00"),
        cost_snapshot=Decimal("40.00"),
        service_line_item_id=line_item_id,
    )
    db_session.add(usage)
    await db_session.commit()

    # PUT a no-op notes update — exercises update_service_visit's mutation
    # path (recompute + `return visit`) without touching the supply usage.
    ur = await client.put(
        f"/api/vehicles/{vin}/service-visits/{visit_id}",
        json={"notes": "reviewed"},
        headers=auth_headers,
    )
    assert ur.status_code == 200
    body = ur.json()

    assert body["vendor"] is not None
    assert body["vendor"]["name"] == "QuickLube Test Shop"
    assert float(body["parts_supplies_cost"]) == 40.0
    li = body["line_items"][0]
    assert len(li["supply_usages"]) == 1
    assert li["supply_usages"][0]["supply_name"] == "Oil"
