"""Unit tests for the telemetry param-class inference catalog.

`infer_param_class()` is a conservative, ordered, substring/prefix catalog
over the canonical (UPPERCASE) param key. It must emit only classes the
validator understands (see `TelemetryValidator.PARAM_CLASS_RANGES`), and
must return `None` (never a wrong class) when no pattern matches — a class
of None simply leaves the param unvalidated, same as today.

The fixture table below is the FULL authoritative list of all 37 distinct
live production param keys observed 2026-07-02 (see
`.superpowers/sdd/task-10-brief.md`), plus synthetic None-traps and
ambiguity traps named in the brief.
"""

import pytest

from app.services.telemetry_validator import PARAM_CLASS_RANGES
from app.utils.autopid_normalizer import _PARAM_CLASS_PATTERNS, infer_param_class

# fmt: off
FIXTURE_TABLE: list[tuple[str, str | None]] = [
    # --- 37 authoritative live production param keys ---
    ("0C-ENGINERPM", "frequency"),
    ("0D-VEHICLESPEED", "speed"),
    ("05-ENGINECOOLANTTEMP", "temperature"),
    ("04-CALCENGINELOAD", "percentage"),
    ("2F-FUELTANKLEVEL", "percentage"),
    ("0F-INTAKEAIRTEMPERATURE", "temperature"),
    ("11-THROTTLEPOSITION", "percentage"),
    ("1F-TIMESINCEENGSTART", None),
    ("21-DISTANCEMILON", "distance"),
    ("42-CONTROLMODULEVOLT", "voltage"),
    ("46-AMBIENTAIRTEMP", "temperature"),
    ("0B-INTAKEMANIABSPRESS", "pressure"),
    ("31-DISTANCESINCECODECLEAR", "distance"),
    ("33-ABSBAROPRES", "pressure"),
    ("5A-RELACCELPEDALPOS", "percentage"),
    ("BATTERY_VOLTAGE", "voltage"),
    ("ODOMETER", "distance"),
    ("5D-FUELINJECTIONTIMING", None),
    ("70-BOOSTPRESCNTRL", "pressure"),
    ("73-EXHAUSTPRESSURE", "pressure"),
    ("74-TURBOCHARGERRPM", "frequency"),
    ("75-TURBOCHARGERTEMPERATURE", "temperature"),
    ("77-CHARGEAIRCOOLERTEMPERATURE", "temperature"),
    # EGT abbreviation carries no catalog token — intentional gap.
    ("78-EGT_BANK1", None),
    ("6B-EXHAUSTGASTEMP", "temperature"),
    ("7A-DPF_DIFFERENTIALPRESSURE", "pressure"),
    ("83-NOXSENSOR", None),
    ("85-NOXREAGENTSYSTEM", None),
    ("88-SCR_INDUCESYSTEM", None),
    ("9B-DIESELEXHAUSTFLUIDSENSORDATA", None),
    ("9D-ENGINEFUELRATE", None),
    ("A5-COMDIESELEXHAUSTFLUIDDOSING", None),
    ("A6-ODOMETER", "distance"),
    ("7F-ENGINERUNTIME", None),
    ("8B-DIESELAFTERTREATMENT", None),
    ("10-MAFAIRFLOWRATE", None),
    ("51-FUELTYPE", None),
    # --- synthetic None-traps: WiCAN frame metadata, not telemetry ---
    ("DIAGNOSTIC_TROUBLE_CODES", None),
    ("TS", None),
    ("TIMESTAMP", None),
]
# fmt: on


@pytest.mark.parametrize(("param_key", "expected_class"), FIXTURE_TABLE)
def test_infer_param_class_fixture_table(param_key: str, expected_class: str | None) -> None:
    """Every live production key + None-trap must resolve to its documented class."""
    assert infer_param_class(param_key) == expected_class


def test_catalog_only_emits_validator_understood_classes() -> None:
    """Every class in the catalog must be a key TelemetryValidator.PARAM_CLASS_RANGES understands.

    Guards against the catalog and the validator's class vocabulary drifting
    apart silently — an unrecognized class is treated as "no class" by the
    validator (all validation skipped), which would be a quiet regression.
    """
    catalog_classes = {param_class for _token, param_class in _PARAM_CLASS_PATTERNS}
    assert catalog_classes <= set(PARAM_CLASS_RANGES)


class TestMixedCaseInput:
    """Input casing must not change the inferred class (canonicalized internally)."""

    def test_lowercase_prefix_mixed_case_key(self) -> None:
        """A mixed-case key normalizes identically to its canonical form."""
        assert infer_param_class("2f-FuelTankLevel") == "percentage"

    def test_fully_lowercase_key(self) -> None:
        """A fully lowercase key still resolves correctly."""
        assert infer_param_class("0c-enginerpm") == "frequency"


class TestAmbiguityTraps:
    """Collision-prone substrings named explicitly in the task brief."""

    def test_exhaust_pressure_not_temperature(self) -> None:
        """EXHAUSTPRESSURE must hit pressure, never temperature."""
        assert infer_param_class("73-EXHAUSTPRESSURE") == "pressure"

    def test_turbocharger_temperature_not_frequency(self) -> None:
        """TURBOCHARGERTEMPERATURE must hit temperature, never frequency (RPM)."""
        assert infer_param_class("75-TURBOCHARGERTEMPERATURE") == "temperature"

    def test_turbocharger_rpm_not_temperature(self) -> None:
        """TURBOCHARGERRPM must hit frequency, never temperature."""
        assert infer_param_class("74-TURBOCHARGERRPM") == "frequency"

    def test_fuel_type_is_categorical_not_percentage(self) -> None:
        """FUELTYPE is categorical data, not a fuel-level percentage."""
        assert infer_param_class("51-FUELTYPE") is None

    def test_diesel_exhaust_fluid_sensor_blob_is_none(self) -> None:
        """Composite DEF sensor blob has no single validator class."""
        assert infer_param_class("9B-DIESELEXHAUSTFLUIDSENSORDATA") is None

    def test_nox_reagent_system_is_none(self) -> None:
        """NOx reagent system status is not a numeric telemetry class."""
        assert infer_param_class("85-NOXREAGENTSYSTEM") is None

    def test_scr_induce_system_is_none(self) -> None:
        """SCR induce system status is not a numeric telemetry class."""
        assert infer_param_class("88-SCR_INDUCESYSTEM") is None

    def test_timestamp_is_none_not_temperature(self) -> None:
        """TIMESTAMP must not false-positive on the TEMP token."""
        assert infer_param_class("TIMESTAMP") is None

    def test_ts_is_none(self) -> None:
        """TS (rolling ms counter) is frame metadata, no telemetry class."""
        assert infer_param_class("TS") is None
