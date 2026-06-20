from app.services.firmware_service import FirmwareService


def test_classify_release_track_pro_and_obd():
    assert FirmwareService.classify_release_track("v4.50p") == "pro"
    assert FirmwareService.classify_release_track("v4.49p_beta-06") == "pro"
    assert FirmwareService.classify_release_track("v4.21") == "obd"
    assert FirmwareService.classify_release_track("v4.20_beta-01") == "obd"


def test_classify_release_track_title_fallback():
    # Non-numeric/odd tag falls back to the release title.
    assert FirmwareService.classify_release_track("nightly", "WiCAN-PRO build") == "pro"
    assert FirmwareService.classify_release_track("nightly", "WiCAN-OBD build") == "obd"


def test_device_firmware_track():
    assert FirmwareService.device_firmware_track("WiCAN-OBD-PRO") == "pro"
    assert FirmwareService.device_firmware_track("WiCAN-OBD") == "obd"
    assert FirmwareService.device_firmware_track("WiCAN-USB") == "obd"
    assert FirmwareService.device_firmware_track(None) is None
    assert FirmwareService.device_firmware_track("") is None


def test_classify_release_track_hyphen_beta_is_pro():
    # meatpi tag-convention drift: a PRO beta with a HYPHEN separator
    # (v4.22p-beta) must still classify as pro via the 'p', not fall through
    # to obd the way the old underscore-only split did.
    assert FirmwareService.classify_release_track("v4.22p-beta") == "pro"
    assert FirmwareService.classify_release_track("v4.47p-beta-09") == "pro"


def test_is_prerelease_detects_beta_tag_without_github_flag():
    # meatpi sometimes ships a beta WITHOUT setting the prerelease flag;
    # the tag text must still mark it as a prerelease.
    assert FirmwareService._is_prerelease(
        {"tag_name": "v4.22p-beta", "prerelease": False, "draft": False}
    )
    assert not FirmwareService._is_prerelease(
        {"tag_name": "v4.21", "prerelease": False, "draft": False}
    )
