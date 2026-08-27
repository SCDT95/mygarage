"""Which unit a CSV column's numbers are in, decided from the FILE alone.

Issue #152 phase 2b. CSV schema v6 lets a column name its own unit with a
phase-1 vocabulary token (`Odometer (mi)`, `Volume (gal_uk)`), so a file
written by a user whose distance is miles but whose volume is litres still
says exactly what it holds. This module owns that decision for the CSV
import path.

Never a preference (R1)
-----------------------
Nothing here reads a `User`, a `UnitSet`, a `RenderContext`, or the
`imperial_gallon_standard` `Setting`. The unit comes from the file: a header
token, else the `unit_system` marker, else `units_version`, else a narrow
inference over the column names. Resolving the importing account's
preference instead is exactly the defect recorded in
`import_data._row_gallons_to_liters`: importing an old US-gallon backup on a
UK-configured instance multiplied every volume by 4.54609 instead of
3.78541 and wrote the result into canonical storage permanently.

Resolution order (R4), per column, first hit wins
-------------------------------------------------
1. A v6 header token: `Base (token)` where `Base` is an allowlisted base
   name for the quantity and `token` is in that quantity's vocabulary.
   Tokens are case-significant: `L` is not `l`.
2. A historical header whose NAME states its unit outright
   (`Outside Temp (F)`, `OBC L/100km`), or states it up to the gallon
   flavour (`OBC MPG`), which the marker then settles.
3. The file's `unit_system` marker.
4. The file's `units_version`, then the unversioned column-shape inference.

Steps 3 and 4 are the file context: one immutable verdict derived from a
pre-scan of every row, never re-derived per row (R5).

Why steps 2 and 3 are split the way they are
--------------------------------------------
`Mileage`, `Gallons`, `Reading`, `Price Per Liter`, `Price Per Gallon`,
`Price/Gal` and `Price Per Unit` do NOT state their unit here even where the
name looks like it does. Those columns have been marker-driven since v3, and a file whose header and marker disagree (a hand-written sheet built
from a copied metric header row) has always been read the marker's way.
Changing that silently rewrites what an existing file means, which is the
one thing this phase must not do.

`Outside Temp (C)`, `Outside Temp (F)`, `OBC L/100km`, `OBC MPG` and
`OBC Avg Speed (km/h)` have no such history: the importer dropped them
entirely until this task, so there is no behaviour to preserve and the name
is the better evidence. A hand-written sheet with `Outside Temp (F)` and no
marker would otherwise store 68 F as 68 C.

Grammar is an allowlist, not a suffix parser (R6)
-------------------------------------------------
Real v4/v5 fuel headers already carry parentheses that are not units:
`OBC Trip Duration (s)`, `SOC Start (%)`, `SOC End (%)`, `Battery SOH (%)`.
Parsing whatever sits in parentheses and rejecting the unknown would reject
valid historical files. Only the base names an importer declares are
inspected; every other header passes through untouched.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, NoReturn, get_args

from fastapi import HTTPException

from app.constants.units import (
    ConsumptionUnit,
    DistanceUnit,
    SpeedUnit,
    TemperatureUnit,
    VolumeUnit,
)
from app.utils.unit_adapters import ADAPTERS

DISTANCE = "distance"
VOLUME = "volume"
PRICE_PER_VOLUME = "price_per_volume"
TEMPERATURE = "temperature"
CONSUMPTION = "consumption"
SPEED = "speed"

# R7: a recognised token for the WRONG quantity is an error, not a fallback.
# `Odometer (gal_us)` and `Volume (mi)` are both real `ADAPTERS` keys and
# would apply a dimensionally meaningless factor to a canonical column, so
# global adapter membership is not sufficient validation. Derived from the
# `UnitSet` Literals rather than hand-listed, so a new token cannot drift.
# `price_per_volume` is denominated in a VOLUME, hence the shared vocabulary.
QUANTITY_TOKENS: Mapping[str, frozenset[str]] = {
    DISTANCE: frozenset(get_args(DistanceUnit)),
    VOLUME: frozenset(get_args(VolumeUnit)),
    PRICE_PER_VOLUME: frozenset(get_args(VolumeUnit)),
    TEMPERATURE: frozenset(get_args(TemperatureUnit)),
    CONSUMPTION: frozenset(get_args(ConsumptionUnit)),
    SPEED: frozenset(get_args(SpeedUnit)),
}

# The token a metric-canonical file's values are already in.
_CANONICAL_TOKEN: Mapping[str, str] = {
    DISTANCE: "km",
    VOLUME: "L",
    PRICE_PER_VOLUME: "L",
    TEMPERATURE: "c",
    CONSUMPTION: "l_100km",
    SPEED: "kmh",
}

# The token a legacy-imperial file's values are in, as (US, UK). Only the
# gallon-denominated quantities differ between the two flavours; miles,
# Fahrenheit and mph are the same either way.
_IMPERIAL_TOKEN: Mapping[str, tuple[str, str]] = {
    DISTANCE: ("mi", "mi"),
    VOLUME: ("gal_us", "gal_uk"),
    PRICE_PER_VOLUME: ("gal_us", "gal_uk"),
    TEMPERATURE: ("f", "f"),
    CONSUMPTION: ("mpg_us", "mpg_uk"),
    SPEED: ("mph", "mph"),
}

# R8: exactly these, and nothing else. Until this task anything starting
# `unit_system=imperial` was read as imperial while only the exact string
# `imperial_uk` meant UK, so `imperial_ukk` silently imported UK gallons as
# US ones. A typo must fail loudly, not convert quietly.
MARKER_METRIC = "metric"
MARKER_IMPERIAL = "imperial"
MARKER_IMPERIAL_UK = "imperial_uk"
MARKER_CUSTOM = "custom"
VALID_MARKERS: frozenset[str] = frozenset(
    {MARKER_METRIC, MARKER_IMPERIAL, MARKER_IMPERIAL_UK, MARKER_CUSTOM}
)

# R9. The unversioned service-history REPORT export
# (`reports.download_service_history_csv`) kept the header `Mileage` when its
# values changed from miles to canonical km, so a pre-migration file and a
# post-migration one are byte-indistinguishable. It is rejected by its exact
# ORDERED header tuple and never by column membership: the v2 PRIMARY service
# export carried the same seven columns in a different order, and matching on
# membership would break every v2 backup restore.
REJECTED_HEADER_TUPLES: frozenset[tuple[str, ...]] = frozenset(
    {("Date", "Mileage", "Category", "Description", "Cost", "Vendor", "Notes")}
)
REJECTED_REPORT_DETAIL = (
    "This file is the unversioned service-history report export. Its 'Mileage' "
    "column is miles in older files and kilometres in newer ones, with nothing "
    "in the file to tell them apart, so importing it could silently store the "
    "wrong distance. Re-export the vehicle from Export > Service records "
    "instead, which carries a units marker."
)

# R9. The v2 standalone odometer export used a bare `Reading` column holding
# MILES, with no marker and no version column. Stated here as a definition
# rather than left to inference, because nothing in such a file distinguishes
# it from a hand-written metric sheet.
V2_ODOMETER_READING_HEADER = "Reading"


@dataclass(frozen=True)
class LegacyHeader:
    """A pre-v6 header this importer reads, and what its NAME establishes.

    `declared` names the unit outright. `flavoured` names it up to the gallon
    flavour, as `(us_token, uk_token)`, which the file's marker settles. Both
    `None` means the name establishes nothing and the file context decides.
    """

    header: str
    declared: str | None = None
    flavoured: tuple[str, str] | None = None


@dataclass(frozen=True)
class QuantitySpec:
    """One quantity an importer consumes, and the headers it accepts for it.

    `bases` are the v6 tokenised base names: `Odometer` accepts
    `Odometer (km)` and `Odometer (mi)`. `legacy` are exact historical header
    strings, matched before any token parsing so that `Outside Temp (C)` is
    read as the display label it is rather than rejected as the unrecognised
    token `C` (the vocabulary token for Celsius is lowercase `c`).
    """

    quantity: str
    bases: tuple[str, ...]
    legacy: tuple[LegacyHeader, ...] = ()


@dataclass(frozen=True)
class ColumnBinding:
    """The one column carrying a quantity, and the unit its values are in."""

    header: str
    quantity: str
    token: str


# --- the quantity specs each importer declares ------------------------------

# Service, fuel and DEF all spell distance `Odometer (km)` / `Mileage`.
ODOMETER_DISTANCE = QuantitySpec(DISTANCE, ("Odometer",), (LegacyHeader("Mileage"),))

# The standalone odometer pair spells it `Reading (km)` / `Reading`, and also
# accepts `Mileage` (it has since v3).
READING_DISTANCE = QuantitySpec(
    DISTANCE, ("Reading",), (LegacyHeader("Reading"), LegacyHeader("Mileage"))
)

FUEL_VOLUME = QuantitySpec(VOLUME, ("Volume",), (LegacyHeader("Liters"), LegacyHeader("Gallons")))

# `Price Per Unit (<volume token>)` is the v6 tokenised spelling for both
# fuel and DEF: the base name is already the unit-neutral one DEF has always
# used, and the parenthetical says which volume the price is per. The
# tokenless `Price Per Unit` keeps its historical marker-driven meaning.
FUEL_PRICE = QuantitySpec(
    PRICE_PER_VOLUME,
    ("Price Per Unit",),
    (
        LegacyHeader("Price Per Liter"),
        LegacyHeader("Price Per Gallon"),
        LegacyHeader("Price/Gal"),
    ),
)
DEF_PRICE = QuantitySpec(PRICE_PER_VOLUME, ("Price Per Unit",), (LegacyHeader("Price Per Unit"),))

FUEL_TEMPERATURE = QuantitySpec(
    TEMPERATURE,
    ("Outside Temp",),
    (
        LegacyHeader("Outside Temp (C)", declared="c"),
        LegacyHeader("Outside Temp (F)", declared="f"),
    ),
)

# `OBC L/100km` becomes `OBC MPG` on imperial export: the BASE name changes,
# not just the parenthetical, so this is an alias group and not a name with a
# suffix. `OBC MPG` does not say which gallon its miles-per is measured
# against, so the marker settles that; `OBC L/100km` needs no help.
FUEL_CONSUMPTION = QuantitySpec(
    CONSUMPTION,
    ("OBC Economy",),
    (
        LegacyHeader("OBC L/100km", declared="l_100km"),
        LegacyHeader("OBC MPG", flavoured=("mpg_us", "mpg_uk")),
    ),
)

# `OBC Avg Speed (mph)` needs no legacy entry: `mph` IS the vocabulary token,
# so it parses as a v6 header and means the same thing either way. `km/h` is
# a display label, not a token (the token is `kmh`), so it needs one.
FUEL_SPEED = QuantitySpec(
    SPEED, ("OBC Avg Speed",), (LegacyHeader("OBC Avg Speed (km/h)", declared="kmh"),)
)


def _reject(detail: str) -> NoReturn:
    """Refuse the whole file, naming the cause. Never guess (R8).

    `NoReturn` so a caller's remaining branches read as unreachable to the
    type checker, the same way a bare `raise` would.
    """
    raise HTTPException(status_code=400, detail=detail)


def volume_factor(token: str) -> Decimal:
    """Litres in one `token`, e.g. `3.78541` for `gal_us`.

    Read off the adapter rather than re-declared, so the price denominator
    can never drift from the volume column's own factor. Valid only because
    every volume adapter is proportional (no offset); `_ensure_volume_token`
    holds that line.

    Public because `app.utils.csv_emission` multiplies a canonical per-litre
    price by this on the way out and this module divides by it on the way in.
    Import and export MUST use the same factor, so there is one definition
    and the exporter imports it rather than owning a second copy.
    """
    _ensure_volume_token(token)
    factor = ADAPTERS[token].to_canonical(Decimal("1"))
    if factor is None:  # pragma: no cover - a volume adapter never returns None for 1
        raise ValueError(f"volume adapter {token!r} has no factor")
    return factor


def _ensure_volume_token(token: str) -> None:
    """Guard `volume_factor` against a non-volume token reaching it."""
    if token not in QUANTITY_TOKENS[VOLUME]:
        raise ValueError(f"{token!r} is not a volume token")


class CsvUnitContext:
    """One immutable per-FILE verdict about units, plus the column bindings.

    Built once by :func:`build_csv_unit_context` from a pre-scan of every row
    (R5). `unit_system` and `units_version` are written into every data row by
    `export.generate_csv_stream`, not once per file, so reading only the first
    row would let a later row disagree and be converted under a context it
    does not belong to.
    """

    def __init__(
        self,
        *,
        marker: str,
        version: str,
        legacy_imperial: bool,
        gallon_flavour: str,
        bindings: Mapping[str, ColumnBinding],
    ) -> None:
        self.marker = marker
        self.version = version
        self.legacy_imperial = legacy_imperial
        self.gallon_flavour = gallon_flavour
        self._bindings = dict(bindings)

    def column(self, quantity: str) -> str | None:
        """The header carrying `quantity` in this file, or None if absent."""
        binding = self._bindings.get(quantity)
        return binding.header if binding is not None else None

    def token(self, quantity: str) -> str | None:
        """The vocabulary token `quantity`'s values are in, or None if absent."""
        binding = self._bindings.get(quantity)
        return binding.token if binding is not None else None

    def to_canonical(self, quantity: str, value: Decimal | None) -> Decimal | None:
        """Convert one cell of `quantity` into canonical metric storage.

        Price is denominator-aware: a price per gallon is a price per litre
        DIVIDED by the litres in a gallon, not multiplied by them.
        """
        if value is None:
            return None
        binding = self._bindings.get(quantity)
        if binding is None:
            return value
        if quantity == PRICE_PER_VOLUME:
            return value / volume_factor(binding.token)
        return ADAPTERS[binding.token].to_canonical(value)


def _normalised_markers(rows: Sequence[Mapping[str, Any]]) -> str:
    """The file's single `unit_system`, rejecting rows that disagree (R5)."""
    seen = {(row.get("unit_system") or "").strip().lower() for row in rows}
    seen.discard("")
    if len(seen) > 1:
        _reject(
            "CSV rows disagree about unit_system: "
            f"{', '.join(sorted(repr(value) for value in seen))}. "
            "One file must be in one unit system."
        )
    marker = next(iter(seen), "")
    if marker and marker not in VALID_MARKERS:
        _reject(
            f"Unrecognised unit_system marker {marker!r}. Expected one of: "
            f"{', '.join(sorted(VALID_MARKERS))}."
        )
    return marker


def _single_version(rows: Sequence[Mapping[str, Any]]) -> str:
    """The file's single `units_version`, rejecting rows that disagree (R5)."""
    seen = {(row.get("units_version") or "").strip() for row in rows}
    seen.discard("")
    if len(seen) > 1:
        _reject(
            "CSV rows disagree about units_version: "
            f"{', '.join(sorted(repr(value) for value in seen))}. "
            "One file must be one schema version."
        )
    return next(iter(seen), "")


def _split_token(header: str, bases: tuple[str, ...]) -> tuple[str, str] | None:
    """`("Odometer", "mi")` for `"Odometer (mi)"`, else None.

    Case-preserving throughout: the token is never lowercased, because `L`
    (litres) and `l` are different vocabulary entries.
    """
    if not header.endswith(")"):
        return None
    open_paren = header.rfind(" (")
    if open_paren <= 0:
        return None
    base = header[:open_paren]
    if base not in bases:
        return None
    return base, header[open_paren + 2 : -1]


def _candidate_binding(header: str, spec: QuantitySpec, marker: str) -> ColumnBinding | None:
    """Bind `header` to `spec`'s quantity, or None if it is not one of its columns.

    Legacy exact matches are tried first: `Outside Temp (C)` carries a display
    label, not the lowercase `c` vocabulary token, and must not be rejected as
    an unrecognised token.
    """
    for entry in spec.legacy:
        if entry.header != header:
            continue
        if entry.declared is not None:
            return ColumnBinding(header, spec.quantity, entry.declared)
        if entry.flavoured is not None:
            us_token, uk_token = entry.flavoured
            return ColumnBinding(
                header,
                spec.quantity,
                uk_token if marker == MARKER_IMPERIAL_UK else us_token,
            )
        # The name establishes nothing; the file context decides later.
        return ColumnBinding(header, spec.quantity, "")

    split = _split_token(header, spec.bases)
    if split is None:
        return None
    _, token = split
    allowed = QUANTITY_TOKENS[spec.quantity]
    if token not in allowed:
        if token in ADAPTERS:
            _reject(
                f"CSV column {header!r} declares unit {token!r}, which is not a "
                f"{spec.quantity} unit. Expected one of: {', '.join(sorted(allowed))}."
            )
        _reject(
            f"CSV column {header!r} declares an unrecognised unit {token!r}. "
            f"Expected one of: {', '.join(sorted(allowed))}."
        )
    return ColumnBinding(header, spec.quantity, token)


def _is_legacy_imperial(marker: str, version: str, bound: Mapping[str, ColumnBinding]) -> bool:
    """Whether a context-driven column's values are imperial (R4 steps 3 and 4).

    Reproduces the pre-v6 rule, lifted from per-row to per-file:

    | input                                    | reading          |
    |------------------------------------------|------------------|
    | marker `imperial` / `imperial_uk`        | legacy imperial  |
    | marker `metric` / `custom`               | metric canonical |
    | `units_version` parses to < 3            | legacy imperial  |
    | `units_version` parses to >= 3           | metric canonical |
    | `units_version` present but unparseable  | legacy imperial  |
    | unversioned bare `Reading`               | legacy imperial  |
    | unversioned `Mileage` or `Gallons` alone | legacy imperial  |
    | anything else                            | metric canonical |

    A BLANK `units_version` counts as absent, not unparseable. A FUTURE
    version reads as metric canonical and is not an error: a newer file's
    unit-bearing columns carry tokens, which never reach this function.
    """
    if marker in (MARKER_IMPERIAL, MARKER_IMPERIAL_UK):
        return True
    if marker in (MARKER_METRIC, MARKER_CUSTOM):
        return False

    if version:
        try:
            # v3 introduced metric-canonical values, so v3 and later are metric.
            return int(version) < 3
        except ValueError:
            # Unparseable: read conservatively rather than trust a value we
            # do not understand.
            return True

    # R9's definition, stated rather than inferred: the v2 standalone odometer
    # export was a bare `Reading` column of miles with no marker and no version.
    distance = bound.get(DISTANCE)
    if distance is not None and distance.header == V2_ODOMETER_READING_HEADER:
        return True

    # Column shape: the imperial names present without their metric siblings.
    headers = {binding.header for binding in bound.values()}
    has_imperial = bool(headers & {"Mileage", "Gallons"})
    has_metric = bool(headers & {"Odometer (km)", "Liters"})
    return has_imperial and not has_metric


def build_csv_unit_context(
    fieldnames: Sequence[str] | None,
    rows: Sequence[Mapping[str, Any]],
    specs: Sequence[QuantitySpec],
) -> CsvUnitContext:
    """Derive one immutable unit context for a whole uploaded CSV.

    Runs before any ORM write. Raises `HTTPException(400)` naming the cause
    for every rejection rule in R8: an unrecognised header token, a
    recognised token for the wrong quantity, an unrecognised marker, marker
    `custom` with a tokenless unit column, two candidate columns for one
    quantity, a duplicated unit column, rows that disagree about
    `unit_system` or `units_version`, and the irreducibly ambiguous
    unversioned service-history report.
    """
    headers = list(fieldnames or [])
    if tuple(headers) in REJECTED_HEADER_TUPLES:
        _reject(REJECTED_REPORT_DETAIL)

    marker = _normalised_markers(rows)
    version = _single_version(rows)

    bound: dict[str, ColumnBinding] = {}
    for spec in specs:
        matches: list[ColumnBinding] = []
        for header in headers:
            binding = _candidate_binding(header, spec, marker)
            if binding is not None:
                matches.append(binding)
        if not matches:
            continue
        distinct = sorted({binding.header for binding in matches})
        if len(distinct) > 1:
            _reject(
                f"CSV has more than one {spec.quantity} column: "
                f"{', '.join(repr(name) for name in distinct)}. "
                "Keep exactly one and re-import."
            )
        if len(matches) > 1:
            _reject(
                f"CSV has a duplicate {distinct[0]!r} column. Remove the duplicate and re-import."
            )
        bound[spec.quantity] = matches[0]

    if marker == MARKER_CUSTOM:
        for binding in bound.values():
            if not binding.token:
                _reject(
                    f"unit_system 'custom' says the units are in the headers, but "
                    f"column {binding.header!r} carries no unit token."
                )

    legacy_imperial = _is_legacy_imperial(marker, version, bound)
    gallon_flavour = "uk" if marker == MARKER_IMPERIAL_UK else "us"

    resolved: dict[str, ColumnBinding] = {}
    for quantity, binding in bound.items():
        if binding.token:
            resolved[quantity] = binding
            continue
        if legacy_imperial:
            us_token, uk_token = _IMPERIAL_TOKEN[quantity]
            token = uk_token if gallon_flavour == "uk" else us_token
        else:
            token = _CANONICAL_TOKEN[quantity]
        resolved[quantity] = ColumnBinding(binding.header, quantity, token)

    return CsvUnitContext(
        marker=marker,
        version=version,
        legacy_imperial=legacy_imperial,
        gallon_flavour=gallon_flavour,
        bindings=resolved,
    )
