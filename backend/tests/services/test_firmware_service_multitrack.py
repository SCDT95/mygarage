"""Tests for multi-track firmware fetch, cache, and per-device comparison."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.livelink_device import LiveLinkDevice
from app.services.firmware_service import FirmwareService

RELEASES = [
    {
        "tag_name": "v4.21",
        "name": "WiCAN-OBD v4.21",
        "prerelease": False,
        "draft": False,
        "html_url": "u/4.21",
        "body": "obd",
    },
    {
        "tag_name": "v4.50p",
        "name": "WiCAN-PRO v4.50",
        "prerelease": False,
        "draft": False,
        "html_url": "u/4.50p",
        "body": "pro",
    },
    {
        "tag_name": "v4.49p_beta-06",
        "name": "WiCAN-PRO v4.49 Beta-06",
        "prerelease": True,
        "draft": False,
        "html_url": "u/4.49b6",
        "body": "beta",
    },
    {
        "tag_name": "v4.48p",
        "name": "WiCAN-PRO v4.48",
        "prerelease": False,
        "draft": False,
        "html_url": "u/4.48p",
        "body": "pro old",
    },
]


class _FakeResp:
    def __init__(self, data):
        self._data = data
        self.headers = {}  # no Link header → single page

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


async def _make_device(
    session: AsyncSession, device_id: str, hw: str | None, fw: str
) -> LiveLinkDevice:
    """Insert a minimal LiveLinkDevice row for firmware tests."""
    device = LiveLinkDevice(
        device_id=device_id,
        hw_version=hw,
        fw_version=fw,
        vin=None,
    )
    session.add(device)
    await session.commit()
    await session.refresh(device)
    return device


@pytest.mark.asyncio
async def test_check_refreshes_both_tracks(db_session, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return _FakeResp(RELEASES)

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)
    svc = FirmwareService(db_session)

    result = await svc.check_firmware_updates()

    assert result["tracks"]["obd"]["latest_version"] == "4.21"
    assert result["tracks"]["pro"]["latest_version"] == "4.50"  # beta excluded
    pro = await svc.get_cached_firmware_info("pro")
    obd = await svc.get_cached_firmware_info("obd")
    assert pro["latest_version"] == "4.50"
    assert obd["latest_version"] == "4.21"


@pytest.mark.asyncio
async def test_device_compared_against_its_track(db_session, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return _FakeResp(RELEASES)

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)
    svc = FirmwareService(db_session)
    await svc.check_firmware_updates()

    # PRO device on 4.48 → update to 4.50 available (NOT compared to OBD 4.21).
    await _make_device(db_session, "pro1", hw="WiCAN-OBD-PRO", fw="4.48")
    pro_status = await svc.check_device_firmware("pro1")
    assert pro_status["firmware_track"] == "pro"
    assert pro_status["latest_version"] == "4.50"
    assert pro_status["update_available"] is True

    # OBD device on 4.21 → up to date; never told to install PRO 4.50.
    await _make_device(db_session, "obd1", hw="WiCAN-OBD", fw="4.21")
    obd_status = await svc.check_device_firmware("obd1")
    assert obd_status["firmware_track"] == "obd"
    assert obd_status["latest_version"] == "4.21"
    assert obd_status["update_available"] is False


@pytest.mark.asyncio
async def test_unknown_hardware_surfaces_no_update(db_session, monkeypatch):
    async def fake_get(self, url, **kwargs):
        return _FakeResp(RELEASES)

    monkeypatch.setattr("httpx.AsyncClient.get", fake_get)
    svc = FirmwareService(db_session)
    await svc.check_firmware_updates()

    await _make_device(db_session, "x1", hw=None, fw="1.0")
    status = await svc.check_device_firmware("x1")
    assert status["firmware_track"] is None
    assert status["update_available"] is None
