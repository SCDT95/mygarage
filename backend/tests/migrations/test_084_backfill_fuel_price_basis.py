"""Tests for migration 084 — backfill fuel_records.price_basis (#128).

Parameterized over SQLite *and* PostgreSQL via the ``engine_for_migration``
fixture (PG runs skip when ``TEST_DATABASE_URL`` is unset).
"""

import importlib.util
from pathlib import Path

from sqlalchemy import text

import app.migrations as _m


def _load(name):
    path = Path(_m.__file__).parent / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_table(engine):
    """Minimal post-053 fuel_records: the columns the CASE reads."""
    is_pg = engine.dialect.name == "postgresql"
    pk = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"
    with engine.begin() as conn:
        conn.execute(
            text(f"""
            CREATE TABLE fuel_records (
                id {pk},
                vin VARCHAR(17) NOT NULL,
                liters NUMERIC(9,3),
                propane_liters NUMERIC(9,3),
                kwh NUMERIC(8,3),
                price_per_unit NUMERIC(6,3),
                price_basis VARCHAR(12)
            )
            """)
        )


def _rows(engine):
    with engine.begin() as conn:
        return {
            r[0]: r[1]
            for r in conn.execute(text("SELECT id, price_basis FROM fuel_records ORDER BY id"))
        }


def test_084_backfills_only_priced_rows_without_a_basis(engine_for_migration):
    _dialect, engine, _url = engine_for_migration
    _make_table(engine)
    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO fuel_records
                (vin, liters, propane_liters, kwh, price_per_unit, price_basis)
            VALUES
                -- 1: the reporter's row — imported, priced, no basis.
                ('V00000000000000001', 37.854, NULL, NULL, 0.660, NULL),
                -- 2: electric, priced, no basis -> per_kwh, not per_volume.
                ('V00000000000000002', NULL, NULL, 50.0, 0.180, NULL),
                -- 3: already has a basis -> must not be rewritten.
                ('V00000000000000003', 40.0, NULL, NULL, 1.500, 'per_tank'),
                -- 4: no price -> nothing to name a denominator for.
                ('V00000000000000004', 40.0, NULL, NULL, NULL, NULL),
                -- 5: propane by volume.
                ('V00000000000000005', NULL, 17.0, NULL, 0.900, NULL)
            """)
        )

    _load("084_backfill_fuel_price_basis").upgrade(engine)

    assert _rows(engine) == {
        1: "per_volume",
        2: "per_kwh",
        3: "per_tank",  # untouched — an existing value is a user's choice
        4: None,  # untouched — no price, no denominator
        5: "per_volume",
    }


def test_084_is_idempotent(engine_for_migration):
    """Re-running must be a no-op: the WHERE clause stops matching."""
    _dialect, engine, _url = engine_for_migration
    _make_table(engine)
    with engine.begin() as conn:
        conn.execute(
            text("""
            INSERT INTO fuel_records (vin, liters, price_per_unit, price_basis)
            VALUES ('V00000000000000001', 37.854, 0.660, NULL)
            """)
        )

    mod = _load("084_backfill_fuel_price_basis")
    mod.upgrade(engine)
    first = _rows(engine)
    mod.upgrade(engine)

    assert _rows(engine) == first == {1: "per_volume"}


def test_084_skips_cleanly_when_the_table_is_absent(engine_for_migration):
    """The runner log-and-continues on non-FATAL failure, so this must not
    raise on a database that has no fuel_records at all."""
    _dialect, engine, _url = engine_for_migration
    _load("084_backfill_fuel_price_basis").upgrade(engine)
