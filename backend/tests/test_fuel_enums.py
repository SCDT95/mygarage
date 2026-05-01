"""Unit tests for fuel-tracking enums + NHTSA fuel-string normalization.

Covers:
- Direct enum value pass-through
- Common alias normalization (gas/petrol/octane grades, EV, PHEV, ...)
- NHTSA capitalized strings ("Gasoline", "Diesel", ...)
- Combined NHTSA strings ("Gasoline, Hybrid Electric", "Gasoline, E85 (Flex Fuel)")
- Unrecognized inputs return None (caller decides on 'other' fallback)
"""

import pytest

from app.constants.fuel import (
    FUEL_TYPE_VALUES,
    PAYMENT_METHOD_VALUES,
    TRIP_TYPE_VALUES,
    FuelTypeEnum,
    PaymentMethod,
    TripType,
    normalize_fuel_type,
    split_combined_fuel_type,
)


class TestEnumVocabularies:
    def test_payment_method_canonical_values(self):
        assert PaymentMethod.CASH.value == "cash"
        assert PaymentMethod.CREDIT.value == "credit"
        assert PaymentMethod.FLEET_CARD.value == "fleet_card"
        assert "cash" in PAYMENT_METHOD_VALUES
        assert "credit" in PAYMENT_METHOD_VALUES

    def test_trip_type_canonical_values(self):
        assert TripType.PRIVATE.value == "private"
        assert TripType.BUSINESS.value == "business"
        assert TripType.COMMUTE.value == "commute"
        assert "private" in TRIP_TYPE_VALUES

    def test_fuel_type_enum_complete(self):
        # Defensive: if a new enum value is added without backfill mapping,
        # existing migrations would happily skip it (since it's now valid)
        # but the test surface should still enumerate it.
        expected = {
            "gasoline",
            "diesel",
            "electric",
            "hybrid",
            "plugin_hybrid",
            "e85",
            "propane_lpg",
            "cng",
            "hydrogen",
            "other",
        }
        assert set(FUEL_TYPE_VALUES) == expected
        for value in expected:
            assert FuelTypeEnum(value).value == value


class TestNormalizeFuelType:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            # Direct enum values pass through
            ("gasoline", FuelTypeEnum.GASOLINE),
            ("diesel", FuelTypeEnum.DIESEL),
            ("electric", FuelTypeEnum.ELECTRIC),
            ("plugin_hybrid", FuelTypeEnum.PLUGIN_HYBRID),
            # Case-insensitive
            ("Gasoline", FuelTypeEnum.GASOLINE),
            ("DIESEL", FuelTypeEnum.DIESEL),
            ("Electric", FuelTypeEnum.ELECTRIC),
            # Common aliases
            ("gas", FuelTypeEnum.GASOLINE),
            ("petrol", FuelTypeEnum.GASOLINE),
            ("Premium", FuelTypeEnum.GASOLINE),
            ("Regular", FuelTypeEnum.GASOLINE),
            ("87", FuelTypeEnum.GASOLINE),
            ("91", FuelTypeEnum.GASOLINE),
            ("EV", FuelTypeEnum.ELECTRIC),
            ("phev", FuelTypeEnum.PLUGIN_HYBRID),
            ("Plug-In Hybrid", FuelTypeEnum.PLUGIN_HYBRID),
            ("Flex Fuel", FuelTypeEnum.E85),
            ("LPG", FuelTypeEnum.PROPANE_LPG),
            ("Propane", FuelTypeEnum.PROPANE_LPG),
            ("Compressed Natural Gas (CNG)", FuelTypeEnum.CNG),
            ("Fuel Cell", FuelTypeEnum.HYDROGEN),
            ("Biodiesel", FuelTypeEnum.DIESEL),
        ],
    )
    def test_recognizes(self, raw: str, expected: FuelTypeEnum):
        assert normalize_fuel_type(raw) is expected

    @pytest.mark.parametrize(
        "raw",
        [
            None,
            "",
            "   ",
            "Quantum Fluctuator",
            "Plutonium",
            "??",
        ],
    )
    def test_unrecognized_returns_none(self, raw):
        assert normalize_fuel_type(raw) is None


class TestSplitCombinedFuelType:
    @pytest.mark.parametrize(
        "raw,primary,secondary",
        [
            (
                "Gasoline, Hybrid Electric",
                FuelTypeEnum.HYBRID,
                FuelTypeEnum.ELECTRIC,
            ),
            (
                "Plug-In Hybrid",
                FuelTypeEnum.PLUGIN_HYBRID,
                FuelTypeEnum.ELECTRIC,
            ),
            ("PHEV", FuelTypeEnum.PLUGIN_HYBRID, FuelTypeEnum.ELECTRIC),
            (
                "Gasoline, E85 (Flex Fuel)",
                FuelTypeEnum.GASOLINE,
                FuelTypeEnum.E85,
            ),
        ],
    )
    def test_decodes_combined(self, raw, primary, secondary):
        p, s = split_combined_fuel_type(raw)
        assert p is primary
        assert s is secondary

    @pytest.mark.parametrize(
        "raw",
        [None, "", "Gasoline", "Diesel", "Electric", "garbage"],
    )
    def test_non_combined_returns_none_pair(self, raw):
        p, s = split_combined_fuel_type(raw)
        assert p is None
        assert s is None
