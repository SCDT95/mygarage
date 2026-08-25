"""Vocabulary, preset, and column-name integrity for the custom unit system.

These are ties, not round-trips: each test fails if two things that must agree
stop agreeing. See the spec's Testing section.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.constants.units import (
    IMPERIAL_PRESET,
    METRIC_PRESET,
    UNIT_COLUMN_NAMES,
    UNIT_FIELD_NAMES,
    UnitSet,
    column_to_field,
    field_to_column,
)


class TestUnitSetShape:
    """UnitSet is the single definition of what a unit set contains."""

    def test_unit_set_has_exactly_eleven_fields(self) -> None:
        assert len(UnitSet.model_fields) == 11

    def test_field_names_tuple_matches_model_exactly(self) -> None:
        """UNIT_FIELD_NAMES is a hand-written tuple; this is the tie that stops
        it drifting from UnitSet when a twelfth quantity is added."""
        assert UNIT_FIELD_NAMES == tuple(UnitSet.model_fields)

    def test_every_field_is_required(self) -> None:
        """A default would let a partially-specified set masquerade as complete."""
        optional = [n for n, f in UnitSet.model_fields.items() if not f.is_required()]
        assert optional == []


class TestPresets:
    """The two preset rows, enumerated verbatim from the spec's Phase 1 table."""

    def test_metric_preset_values(self) -> None:
        assert METRIC_PRESET.model_dump() == {
            "distance": "km",
            "speed": "kmh",
            "length": "m",
            "volume": "L",
            "consumption": "l_100km",
            "pressure": "kpa",
            "temperature": "c",
            "mass": "kg",
            "torque": "nm",
            "tread": "mm",
            "secondary_gallon": "us",
        }

    def test_imperial_preset_values(self) -> None:
        assert IMPERIAL_PRESET.model_dump() == {
            "distance": "mi",
            "speed": "mph",
            "length": "ft",
            "volume": "gal_us",
            "consumption": "mpg_us",
            "pressure": "psi",
            "temperature": "f",
            "mass": "lb",
            "torque": "lbft",
            "tread": "in32",
            "secondary_gallon": "us",
        }

    def test_presets_differ_in_every_field_except_secondary_gallon(self) -> None:
        """D4b: secondary_gallon is the one field the presets agree on, which is
        why the UK migration and default_unit_prefs can move it independently."""
        metric = METRIC_PRESET.model_dump()
        imperial = IMPERIAL_PRESET.model_dump()
        agreeing = [k for k in metric if metric[k] == imperial[k]]
        assert agreeing == ["secondary_gallon"]

    def test_presets_are_frozen_instances(self) -> None:
        """A mutable module-level preset is process-global state, which is the
        exact defect phase 0 spent fifteen commits removing."""
        with pytest.raises(ValidationError):
            METRIC_PRESET.distance = "mi"  # type: ignore[misc]


class TestColumnNameMapping:
    """users columns carry a unit_ prefix; UnitSet fields do not."""

    def test_column_names_match_field_names_one_to_one(self) -> None:
        assert len(UNIT_COLUMN_NAMES) == len(UNIT_FIELD_NAMES)
        assert tuple(field_to_column(f) for f in UNIT_FIELD_NAMES) == UNIT_COLUMN_NAMES

    def test_secondary_gallon_column_is_unprefixed(self) -> None:
        """The spec names this column secondary_gallon, not unit_secondary_gallon."""
        assert field_to_column("secondary_gallon") == "secondary_gallon"
        assert "secondary_gallon" in UNIT_COLUMN_NAMES
        assert "unit_secondary_gallon" not in UNIT_COLUMN_NAMES

    def test_round_trip(self) -> None:
        for field in UNIT_FIELD_NAMES:
            assert column_to_field(field_to_column(field)) == field

    def test_every_column_fits_varchar_12(self) -> None:
        """PostgreSQL enforces VARCHAR length; SQLite does not, so an over-long
        vocabulary value only fails in CI. Guard it here instead."""
        from typing import get_args

        for field_name, field in UnitSet.model_fields.items():
            values = get_args(field.annotation)
            assert values, f"{field_name} is not a Literal; the width check sees nothing"
            for value in values:
                assert len(value) <= 12, f"{field_name}={value!r} exceeds VARCHAR(12)"

    def test_unit_set_rejects_unknown_keys(self) -> None:
        """A stored set carrying an extra key means writer and reader disagree
        about the shape. Silently ignoring it surfaces later as a wrong number."""
        with pytest.raises(ValidationError):
            UnitSet.model_validate(METRIC_PRESET.model_dump() | {"unit_pressure": "kpa"})
