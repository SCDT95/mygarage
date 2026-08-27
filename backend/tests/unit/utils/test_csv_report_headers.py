"""The two report CSV header rows, and the guard derived from them.

Issue #152 phase 2b task 5. `routes/reports.py` emits two printable summaries
that are NOT importable, and whose unit-bearing columns now carry v6
vocabulary tokens like every other CSV the app writes.

Why the guard is derived rather than listed
-------------------------------------------
Hand-maintaining the rejected tuples next to a separate emitter is the exact
failure shape task 3 flagged: a future column lands in the emitter, nobody
adds it to the list, and the guard silently stops matching. So
`csv_units.SERVICE_HISTORY_REPORT_HEADERS` / `ALL_RECORDS_REPORT_HEADERS` are
the one source, `reports.py` emits from them, and `REJECTED_HEADER_TUPLES`
expands them over every unit set the app can resolve.

The historical half cannot be derived, because the emitters that wrote it no
longer exist. `test_the_pre_v6_mileage_report_is_still_rejected` and
`test_the_shapes_task_4_pinned_as_importable_are_not_rejected` are what stop
the next reader deleting those literals as redundant, in either direction.

Every expected header row below is a HAND-WRITTEN literal. Deriving the
expectation from `report_header_row` would make the exhaustiveness assertions
tautologies.
"""

from __future__ import annotations

import pytest

from app.constants.units import IMPERIAL_PRESET, METRIC_PRESET, UnitSet
from app.utils.csv_emission import ODOMETER_COLUMN, VOLUME_COLUMN, token_for
from app.utils.csv_units import (
    ALL_RECORDS_REPORT_HEADERS,
    DISTANCE,
    FUEL_VOLUME,
    ODOMETER_DISTANCE,
    QUANTITY_TOKENS,
    REJECTED_HEADER_TUPLES,
    SERVICE_HISTORY_REPORT_HEADERS,
    VOLUME,
    ReportColumn,
    build_csv_unit_context,
    report_header_row,
)

# --- hand-written: every header row either report can emit -----------------

SERVICE_HISTORY_METRIC = (
    "Date",
    "Odometer (km)",
    "Category",
    "Description",
    "Cost",
    "Vendor",
    "Notes",
)
SERVICE_HISTORY_IMPERIAL = (
    "Date",
    "Odometer (mi)",
    "Category",
    "Description",
    "Cost",
    "Vendor",
    "Notes",
)
ALL_RECORDS_METRIC = (
    "Date",
    "Type",
    "Category",
    "Description",
    "Cost",
    "Odometer (km)",
    "Vendor",
    "Volume (L)",
)
ALL_RECORDS_IMPERIAL = (
    "Date",
    "Type",
    "Category",
    "Description",
    "Cost",
    "Odometer (mi)",
    "Vendor",
    "Volume (gal_us)",
)

# The pre-v6 shape. Its `Mileage` column survived the metric migration
# unchanged, so a miles file and a kilometres file are byte-identical.
PRE_V6_SERVICE_HISTORY = (
    "Date",
    "Mileage",
    "Category",
    "Description",
    "Cost",
    "Vendor",
    "Notes",
)

# Shapes `test_import_compatibility_corpus.py` pins as importable. None of
# them may appear in the guard.
V2_PRIMARY_SERVICE_BACKUP = (
    "Date",
    "Category",
    "Description",
    "Mileage",
    "Cost",
    "Vendor",
    "Notes",
)
PRE_V6_SERVICE_HISTORY_EIGHT_COLUMN = (
    "Date",
    "Mileage",
    "Service Type",
    "Description",
    "Cost",
    "Vendor Name",
    "Vendor Phone",
    "Notes",
)
PRE_V6_ALL_RECORDS_V2 = (
    "Date",
    "Type",
    "Category",
    "Description",
    "Cost",
    "Mileage",
    "Vendor",
)
PRE_V6_ALL_RECORDS_V3 = (
    "Date",
    "Type",
    "Category",
    "Description",
    "Cost",
    "Odometer (km)",
    "Vendor",
)

# All nine, spelled out. Two distance tokens for the service-history report,
# two distance x three volume for all-records, plus the one historical shape
# nothing can derive.
EVERY_REJECTED_TUPLE = {
    PRE_V6_SERVICE_HISTORY,
    SERVICE_HISTORY_METRIC,
    SERVICE_HISTORY_IMPERIAL,
    ALL_RECORDS_METRIC,
    ALL_RECORDS_IMPERIAL,
    (
        "Date",
        "Type",
        "Category",
        "Description",
        "Cost",
        "Odometer (km)",
        "Vendor",
        "Volume (gal_us)",
    ),
    (
        "Date",
        "Type",
        "Category",
        "Description",
        "Cost",
        "Odometer (km)",
        "Vendor",
        "Volume (gal_uk)",
    ),
    (
        "Date",
        "Type",
        "Category",
        "Description",
        "Cost",
        "Odometer (mi)",
        "Vendor",
        "Volume (L)",
    ),
    (
        "Date",
        "Type",
        "Category",
        "Description",
        "Cost",
        "Odometer (mi)",
        "Vendor",
        "Volume (gal_uk)",
    ),
}


class TestTheEmittedHeaderRows:
    """What each endpoint puts on the wire, under each unit system."""

    def test_service_history_metric(self) -> None:
        assert report_header_row(SERVICE_HISTORY_REPORT_HEADERS, {DISTANCE: "km"}) == list(
            SERVICE_HISTORY_METRIC
        )

    def test_service_history_imperial(self) -> None:
        assert report_header_row(SERVICE_HISTORY_REPORT_HEADERS, {DISTANCE: "mi"}) == list(
            SERVICE_HISTORY_IMPERIAL
        )

    def test_all_records_metric(self) -> None:
        row = report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: "km", VOLUME: "L"})
        assert row == list(ALL_RECORDS_METRIC)

    def test_all_records_imperial(self) -> None:
        row = report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: "mi", VOLUME: "gal_us"})
        assert row == list(ALL_RECORDS_IMPERIAL)

    def test_the_volume_column_is_appended_last(self) -> None:
        """Under metric the seven pre-v6 columns keep their exact positions,
        so a spreadsheet reading columns 0..6 of an all-records export is
        unaffected by v6. Inserting the new column anywhere else breaks that.
        """
        row = report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: "km", VOLUME: "L"})
        assert row[:7] == list(PRE_V6_ALL_RECORDS_V3)
        assert row[7] == "Volume (L)"

    def test_a_missing_quantity_raises_rather_than_falling_back_to_metric(self) -> None:
        """A silently-canonical column inside an imperial file is the defect
        this phase exists to remove, so the absent token is a hard error."""
        with pytest.raises(KeyError):
            report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: "mi"})


class TestTheDerivedGuard:
    """`REJECTED_HEADER_TUPLES`, and what must and must not be in it."""

    def test_the_guard_is_exactly_these_nine_tuples(self) -> None:
        assert set(REJECTED_HEADER_TUPLES) == EVERY_REJECTED_TUPLE

    @pytest.mark.parametrize("distance", sorted(QUANTITY_TOKENS[DISTANCE]))
    @pytest.mark.parametrize("volume", sorted(QUANTITY_TOKENS[VOLUME]))
    def test_every_all_records_row_the_app_can_emit_is_rejected(
        self, distance: str, volume: str
    ) -> None:
        row = report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: distance, VOLUME: volume})
        assert tuple(row) in REJECTED_HEADER_TUPLES

    @pytest.mark.parametrize("distance", sorted(QUANTITY_TOKENS[DISTANCE]))
    def test_every_service_history_row_the_app_can_emit_is_rejected(self, distance: str) -> None:
        row = report_header_row(SERVICE_HISTORY_REPORT_HEADERS, {DISTANCE: distance})
        assert tuple(row) in REJECTED_HEADER_TUPLES

    def test_the_pre_v6_mileage_report_is_still_rejected(self) -> None:
        """Nothing can derive this tuple: the emitter that wrote it is gone.
        Deleting the literal as redundant un-rejects every v2.21-era report.
        """
        assert PRE_V6_SERVICE_HISTORY in REJECTED_HEADER_TUPLES

    def test_the_pre_v6_report_keeps_its_own_ambiguity_message(self) -> None:
        detail = REJECTED_HEADER_TUPLES[PRE_V6_SERVICE_HISTORY]
        assert "unversioned service-history report" in detail
        assert "Mileage" in detail

    def test_each_v6_report_is_refused_by_name(self) -> None:
        """The message must name the file the user actually picked, not the
        pre-v6 ambiguity, which no longer applies to a tokened header."""
        assert "service-history report export" in REJECTED_HEADER_TUPLES[SERVICE_HISTORY_METRIC]
        assert "all-records report export" in REJECTED_HEADER_TUPLES[ALL_RECORDS_METRIC]

    @pytest.mark.parametrize(
        "headers",
        [
            V2_PRIMARY_SERVICE_BACKUP,
            PRE_V6_SERVICE_HISTORY_EIGHT_COLUMN,
            PRE_V6_ALL_RECORDS_V2,
            PRE_V6_ALL_RECORDS_V3,
        ],
    )
    def test_the_shapes_task_4_pinned_as_importable_are_not_rejected(
        self, headers: tuple[str, ...]
    ) -> None:
        """`test_import_compatibility_corpus.py` asserts each of these imports
        to a specific canonical value. Widening the guard to cover a report by
        column MEMBERSHIP, or adding an unambiguous historical report shape,
        breaks those and every backup restore behind them.
        """
        assert headers not in REJECTED_HEADER_TUPLES


class TestTheReportColumnsAreTheExportColumns:
    """One base name per quantity across every CSV the app emits (T5-R5)."""

    def test_the_report_odometer_base_matches_the_export_odometer_base(self) -> None:
        assert ReportColumn(ODOMETER_DISTANCE).base == ODOMETER_COLUMN.base

    def test_the_report_volume_base_matches_the_export_volume_base(self) -> None:
        assert ReportColumn(FUEL_VOLUME).base == VOLUME_COLUMN.base

    def test_the_emitter_can_emit_exactly_the_tokens_the_guard_expands_over(self) -> None:
        """The guard cross-multiplies `QUANTITY_TOKENS`; the emitter's cells
        come from `EmittedColumn.decimals`. A token in one and not the other
        is either an emittable row the guard misses or a guard row nothing can
        emit.
        """
        assert set(ODOMETER_COLUMN.decimals) == QUANTITY_TOKENS[DISTANCE]
        assert set(VOLUME_COLUMN.decimals) == QUANTITY_TOKENS[VOLUME]

    @pytest.mark.parametrize("units", [METRIC_PRESET, IMPERIAL_PRESET])
    def test_a_resolved_unit_set_spells_a_row_the_guard_holds(self, units: UnitSet) -> None:
        """The path `reports.py` actually walks: resolve a unit set, read the
        token off the shared column, spell the header. The result must be a
        row the guard already knows about.
        """
        tokens = {
            DISTANCE: token_for(ODOMETER_COLUMN, units),
            VOLUME: token_for(VOLUME_COLUMN, units),
        }
        assert tuple(report_header_row(ALL_RECORDS_REPORT_HEADERS, tokens)) in (
            REJECTED_HEADER_TUPLES
        )


class TestTheTokenSurvivesTheRoundTrip:
    """A report header is spelled with the same grammar the importer parses.

    The guard means these headers are never actually read from a report file,
    but the spelling is shared with the backup exports through
    `csv_units.spell_header`. If `spell_header` drifted from `_split_token`,
    every tokened header in the app would stop parsing, and this is the
    cheapest place that shows up.
    """

    @pytest.mark.parametrize("token", sorted(QUANTITY_TOKENS[DISTANCE]))
    def test_the_report_odometer_header_parses_back_to_its_token(self, token: str) -> None:
        header = f"Odometer ({token})"
        assert report_header_row(SERVICE_HISTORY_REPORT_HEADERS, {DISTANCE: token})[1] == header
        context = build_csv_unit_context(
            ["Date", header],
            [{"Date": "2026-08-26", "unit_system": "custom", "units_version": "6"}],
            (ODOMETER_DISTANCE,),
        )
        assert context.token(DISTANCE) == token

    @pytest.mark.parametrize("token", sorted(QUANTITY_TOKENS[VOLUME]))
    def test_the_report_volume_header_parses_back_to_its_token(self, token: str) -> None:
        header = f"Volume ({token})"
        row = report_header_row(ALL_RECORDS_REPORT_HEADERS, {DISTANCE: "km", VOLUME: token})
        assert row[7] == header
        context = build_csv_unit_context(
            ["Date", header],
            [{"Date": "2026-08-26", "unit_system": "custom", "units_version": "6"}],
            (FUEL_VOLUME,),
        )
        assert context.token(VOLUME) == token
