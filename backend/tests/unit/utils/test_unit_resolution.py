"""Unit resolution: preset base, override precedence, and new-user seeding.

D3: unit_preference is the BASE; any non-null override column beats it,
regardless of preset. `custom` is a UI affordance meaning "show me the ten
selects", not a distinct resolution mode.
"""

from __future__ import annotations

import inspect as inspect_module

import pytest

from app.constants.units import (
    IMPERIAL_PRESET,
    METRIC_PRESET,
    UNIT_FIELD_NAMES,
    UnitSet,
    field_to_column,
)
from app.models.user import User
from app.utils.unit_resolution import (
    base_preset_for,
    initial_unit_columns,
    resolve_units,
)


def _user(**kwargs) -> User:
    """An unsaved User carrying only the fields resolution reads."""
    return User(username="u", email="u@example.test", **kwargs)


def _uk_imperial_set() -> UnitSet:
    """The set migration 093 writes on a UK instance.

    Built through model_validate so a typo in this fixture fails here rather
    than silently asserting the wrong thing.
    """
    return UnitSet.model_validate(
        IMPERIAL_PRESET.model_dump()
        | {"volume": "gal_uk", "consumption": "mpg_uk", "secondary_gallon": "uk"}
    )


class TestBasePreset:
    def test_metric_preference_uses_the_metric_preset(self) -> None:
        assert base_preset_for("metric") == METRIC_PRESET

    def test_imperial_preference_uses_the_imperial_preset(self) -> None:
        assert base_preset_for("imperial") == IMPERIAL_PRESET

    def test_custom_falls_back_to_imperial_when_nothing_is_materialised(self) -> None:
        """custom is expected to arrive fully materialised, so the base is only
        reached defensively. Imperial keeps that case identical to today's
        default rather than silently flipping a user to metric."""
        assert base_preset_for("custom") == IMPERIAL_PRESET

    def test_unknown_and_null_preferences_fall_back_to_imperial(self) -> None:
        for value in (None, "", "klingon"):
            assert base_preset_for(value) == IMPERIAL_PRESET


class TestResolution:
    def test_no_overrides_resolves_to_the_preset(self) -> None:
        assert resolve_units(_user(unit_preference="metric")) == METRIC_PRESET
        assert resolve_units(_user(unit_preference="imperial")) == IMPERIAL_PRESET

    def test_a_single_override_beats_the_preset(self) -> None:
        """The reported bug (#152) in one assertion: a metric user who wants PSI."""
        user = _user(unit_preference="metric", unit_pressure="psi")

        resolved = resolve_units(user)

        assert resolved.pressure == "psi"
        assert resolved.distance == "km"  # everything else stays on the preset

    def test_overrides_win_under_every_preset_including_imperial(self) -> None:
        """D3 explicitly rejects the v1 draft where overrides applied only under
        `custom`, which made the UK backfill a no-op against its own preset."""
        user = _user(unit_preference="imperial", unit_distance="km")

        assert resolve_units(user).distance == "km"

    def test_a_fully_materialised_custom_user_resolves_to_its_columns(self) -> None:
        columns = {field_to_column(f): v for f, v in METRIC_PRESET.model_dump().items()}
        user = _user(unit_preference="custom", **columns)

        assert resolve_units(user) == METRIC_PRESET

    def test_every_field_is_independently_overridable(self) -> None:
        """A field the resolver forgot to copy would silently keep its preset
        value. Exercise all ten differing fields, not a representative sample."""
        differing = [
            field
            for field in UNIT_FIELD_NAMES
            if getattr(IMPERIAL_PRESET, field) != getattr(METRIC_PRESET, field)
        ]
        # Without this the loop could silently iterate zero times and pass.
        assert len(differing) == 10, differing

        for field in differing:
            want = getattr(METRIC_PRESET, field)
            user = _user(unit_preference="imperial", **{field_to_column(field): want})

            assert getattr(resolve_units(user), field) == want, field

    def test_secondary_gallon_is_overridable_even_though_presets_agree(self) -> None:
        """D4b: this is the field the UK migration moves for metric users, and
        both presets say 'us', so the loop above cannot cover it."""
        user = _user(unit_preference="metric", secondary_gallon="uk")

        assert resolve_units(user).secondary_gallon == "uk"

    def test_an_out_of_vocabulary_override_is_ignored(self) -> None:
        """The columns have no DB CHECK. A hand-edited value must not produce an
        invalid UnitSet that every downstream formatter then has to defend against."""
        user = _user(unit_preference="metric", unit_pressure="atmospheres")

        assert resolve_units(user).pressure == "kpa"


class TestPurity:
    def test_resolve_units_is_not_a_coroutine(self) -> None:
        """A Pydantic computed field cannot await. If resolution ever needs the
        database, the computed field on UserResponse has to go with it."""
        assert not inspect_module.iscoroutinefunction(resolve_units)

    def test_resolve_units_takes_only_the_user(self) -> None:
        params = list(inspect_module.signature(resolve_units).parameters)
        assert params == ["user"]


class TestNewUserSeeding:
    def test_a_default_matching_a_preset_stores_the_preset_with_null_overrides(
        self,
    ) -> None:
        """Ordinary instances stay on clean presets rather than making every
        account a custom one (spec Phase 1)."""
        columns = initial_unit_columns(IMPERIAL_PRESET)

        assert columns["unit_preference"] == "imperial"
        assert all(columns[field_to_column(f)] is None for f in UNIT_FIELD_NAMES)

    def test_a_metric_default_stores_the_metric_preset(self) -> None:
        columns = initial_unit_columns(METRIC_PRESET)

        assert columns["unit_preference"] == "metric"
        assert all(columns[field_to_column(f)] is None for f in UNIT_FIELD_NAMES)

    def test_a_non_preset_default_materialises_all_eleven_as_custom(self) -> None:
        """A UK instance's default matches neither preset, so a new account must
        carry every field explicitly or it silently gets US gallons: the same
        class of bug this whole change exists to fix."""
        uk = _uk_imperial_set()

        columns = initial_unit_columns(uk)

        assert columns["unit_preference"] == "custom"
        assert columns["unit_volume"] == "gal_uk"
        assert columns["unit_consumption"] == "mpg_uk"
        assert columns["secondary_gallon"] == "uk"
        assert all(columns[field_to_column(f)] is not None for f in UNIT_FIELD_NAMES)

    @pytest.mark.parametrize("preset", [IMPERIAL_PRESET, METRIC_PRESET])
    def test_seeding_round_trips_through_resolution(self, preset: UnitSet) -> None:
        """Whatever seeding writes must resolve back to the default it came from."""
        columns = initial_unit_columns(preset)

        assert resolve_units(_user(**columns)) == preset

    def test_non_preset_seeding_round_trips_through_resolution(self) -> None:
        uk = _uk_imperial_set()

        assert resolve_units(_user(**initial_unit_columns(uk))) == uk


class TestEveryCreationPathSeeds:
    """A creation path that builds a User without the seeding helper silently
    gives new accounts US gallons on a UK instance."""

    def test_all_known_user_construction_sites_use_the_helper(self) -> None:
        import ast
        from pathlib import Path

        backend = Path(__file__).parent.parent.parent.parent
        sources = [
            backend / "app" / "routes" / "auth.py",
            backend / "app" / "services" / "oidc" / "users.py",
        ]

        offenders: list[str] = []
        for path in sources:
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
                    continue
                if node.func.id != "User":
                    continue
                starred = {
                    kw.value.id
                    for kw in node.keywords
                    if kw.arg is None and isinstance(kw.value, ast.Name)
                }
                if "unit_kwargs" not in starred:
                    offenders.append(f"{path.name}:{node.lineno}")

        assert offenders == [], (
            f"User(...) built without **unit_kwargs at {offenders}. "
            "Call new_user_unit_kwargs(db) and splat it in."
        )

    def test_the_guard_sees_the_call_sites_it_claims_to_check(self) -> None:
        """A path typo would make the guard above scan nothing and pass. Assert
        it actually found User(...) constructions."""
        import ast
        from pathlib import Path

        backend = Path(__file__).parent.parent.parent.parent
        found = 0
        for name in (
            backend / "app" / "routes" / "auth.py",
            backend / "app" / "services" / "oidc" / "users.py",
        ):
            assert name.exists(), name
            tree = ast.parse(name.read_text(encoding="utf-8"))
            found += sum(
                1
                for node in ast.walk(tree)
                if isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "User"
            )
        assert found == 3, f"expected 3 User(...) construction sites, found {found}"
