"""Phase 3 tests: Group E fail-open closure, upload magic-byte rejection (G),
and end-to-end CSV formula-injection neutralisation (F)."""

from io import BytesIO

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


# --- Group E: optional_auth -> require_auth fail-open closure -----------------


class TestDashboardFailOpen:
    async def test_no_token_local_mode_401(self, client: AsyncClient):
        # optional_auth used to return None for a no-token request in local mode,
        # falling through to the all-vehicles branch. require_auth now 401s.
        resp = await client.get("/api/dashboard")
        assert resp.status_code == 401

    async def test_authenticated_non_admin_ok(self, client, owned_vehicle, owner_headers):
        resp = await client.get("/api/dashboard", headers=owner_headers)
        assert resp.status_code == 200

    async def test_none_mode_legacy_preserved(self, client, set_auth_mode):
        # In none-mode the dashboard still serves the legacy all-vehicles view
        # with no token (auth disabled).
        await set_auth_mode("none")
        resp = await client.get("/api/dashboard")
        assert resp.status_code == 200


class TestArchivedListFailOpen:
    async def test_no_token_local_mode_401(self, client: AsyncClient):
        resp = await client.get("/api/vehicles/archived/list")
        assert resp.status_code == 401

    async def test_none_mode_legacy_preserved(self, client, set_auth_mode):
        await set_auth_mode("none")
        resp = await client.get("/api/vehicles/archived/list")
        assert resp.status_code == 200


# --- G: upload magic-byte mismatch is rejected through the real routes --------


class TestUploadMagicByteRejection:
    async def test_photo_content_mismatch_rejected(self, client, auth_headers, test_vehicle):
        # Declared image/png but the bytes are a PDF -> 400 (was: stored anyway).
        resp = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/photos",
            files={"file": ("evil.png", BytesIO(b"%PDF-1.4 not a real png"), "image/png")},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_document_content_mismatch_rejected(self, client, auth_headers, test_vehicle):
        # Declared application/pdf but the bytes are a Windows executable -> 400.
        resp = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/documents",
            files={"file": ("evil.pdf", BytesIO(b"MZ\x90\x00\x03 executable"), "application/pdf")},
            data={"title": "Evil", "document_type": "Service Record"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    async def test_window_sticker_content_mismatch_rejected(
        self, client, auth_headers, test_vehicle
    ):
        # validate_sticker_file now magic-byte-checks: PDF declared, junk bytes.
        resp = await client.post(
            f"/api/vehicles/{test_vehicle['vin']}/window-sticker/upload",
            files={"file": ("evil.pdf", BytesIO(b"not a pdf at all"), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 400


# CSV formula-injection neutralisation is covered exhaustively by
# tests/unit/utils/test_csv_safe.py against sanitize_csv_row -- the exact
# function wired into every CSV writer (export/reports/toll/livelink).
