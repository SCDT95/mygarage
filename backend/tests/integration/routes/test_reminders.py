"""
Integration tests for vehicle reminder routes — hours-based reminders
(Phase 5 of the hours-usage-model feature).

Adds `due_hours` threading through create/update/response and the new
`'hours'` reminder type, plus the redefined `'smart'` type (date + exactly
one of {due_mileage_km, due_hours}). The critical assertion is backward
compatibility: an existing-style smart reminder (due_date + due_mileage_km,
due_hours null) must still create/update/persist exactly as before.
"""

from datetime import date, timedelta

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
class TestReminderRoutesBackwardCompat:
    """Existing date/mileage/both/smart reminder shapes are unaffected."""

    async def test_create_date_reminder_unaffected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Registration renewal",
                "reminder_type": "date",
                "due_date": (date.today() + timedelta(days=30)).isoformat(),
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "date"
        assert data["due_hours"] is None

    async def test_create_mileage_reminder_unaffected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Tire rotation",
                "reminder_type": "mileage",
                "due_mileage_km": 60000,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "mileage"
        assert float(data["due_mileage_km"]) == 60000
        assert data["due_hours"] is None

    async def test_create_both_reminder_unaffected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Annual service",
                "reminder_type": "both",
                "due_date": (date.today() + timedelta(days=365)).isoformat(),
                "due_mileage_km": 70000,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "both"
        assert data["due_hours"] is None

    async def test_create_smart_date_and_mileage_only_unaffected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        """CRITICAL backward-compat case at the HTTP boundary: today's
        existing smart-reminder shape (date + mileage, no hours) must still
        create successfully under the redefined 'smart' validation."""
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Oil change",
                "reminder_type": "smart",
                "due_date": (date.today() + timedelta(days=365)).isoformat(),
                "due_mileage_km": 65000,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "smart"
        assert float(data["due_mileage_km"]) == 65000
        assert data["due_hours"] is None

    async def test_update_smart_date_and_mileage_only_unaffected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        create_resp = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Oil change",
                "reminder_type": "smart",
                "due_date": (date.today() + timedelta(days=365)).isoformat(),
                "due_mileage_km": 65000,
            },
            headers=auth_headers,
        )
        reminder_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/vehicles/{test_vehicle['vin']}/reminders/{reminder_id}",
            json={"due_mileage_km": 68000},
            headers=auth_headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert float(data["due_mileage_km"]) == 68000
        assert data["due_hours"] is None


@pytest.mark.integration
@pytest.mark.asyncio
class TestReminderRoutesHours:
    """New 'hours' type + smart+hours, threaded through create/update/response."""

    async def test_create_hours_reminder(self, client: AsyncClient, auth_headers, test_vehicle):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Hydraulic fluid change",
                "reminder_type": "hours",
                "due_hours": 500.0,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "hours"
        assert float(data["due_hours"]) == 500.0
        assert data["due_mileage_km"] is None

    async def test_create_hours_reminder_missing_due_hours_rejected(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={"title": "Hydraulic fluid change", "reminder_type": "hours"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_update_hours_reminder_persists(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        create_resp = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Hydraulic fluid change",
                "reminder_type": "hours",
                "due_hours": 500.0,
            },
            headers=auth_headers,
        )
        reminder_id = create_resp.json()["id"]

        update_resp = await client.put(
            f"/api/vehicles/{test_vehicle['vin']}/reminders/{reminder_id}",
            json={"due_hours": 550.0},
            headers=auth_headers,
        )
        assert update_resp.status_code == 200
        data = update_resp.json()
        assert float(data["due_hours"]) == 550.0

    async def test_create_smart_date_and_hours_only(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Engine service",
                "reminder_type": "smart",
                "due_date": (date.today() + timedelta(days=180)).isoformat(),
                "due_hours": 750.0,
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["reminder_type"] == "smart"
        assert float(data["due_hours"]) == 750.0
        assert data["due_mileage_km"] is None

    async def test_create_smart_rejects_date_plus_both_metrics(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Engine service",
                "reminder_type": "smart",
                "due_date": (date.today() + timedelta(days=180)).isoformat(),
                "due_mileage_km": 65000,
                "due_hours": 750.0,
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_create_smart_rejects_date_plus_neither_metric(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        response = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Engine service",
                "reminder_type": "smart",
                "due_date": (date.today() + timedelta(days=180)).isoformat(),
            },
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_list_reminders_includes_due_hours_field(
        self, client: AsyncClient, auth_headers, test_vehicle
    ):
        await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/reminders",
            json={
                "title": "Hydraulic fluid change",
                "reminder_type": "hours",
                "due_hours": 500.0,
            },
            headers=auth_headers,
        )

        response = await client.get(
            f"/api/vehicles/{test_vehicle['vin']}/reminders?status=all",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert any(r["reminder_type"] == "hours" for r in data)
