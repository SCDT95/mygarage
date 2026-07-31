"""Pydantic response models for /api/widget/* endpoints.

The API returns the full field set; the homepage `customapi` widget picks
which 4 to display via its own `mappings:` block. Field names stay flat and
snake_case so they map directly to homepage's `field:` references.
"""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class WidgetSummary(BaseModel):
    """Garage-wide aggregates scoped to the key owner's vehicles."""

    total_vehicles: int
    active_vehicles: int
    archived_vehicles: int
    total_overdue_maintenance: int
    total_upcoming_maintenance: int
    total_service_records: int
    total_fuel_records: int
    total_documents: int
    total_notes: int
    total_photos: int


class WidgetVehicleRef(BaseModel):
    """Minimal VIN + label pair used by the discovery list."""

    vin: str
    label: str


class WidgetVehicleList(BaseModel):
    vehicles: list[WidgetVehicleRef]


class WidgetVehicle(BaseModel):
    """Per-vehicle rollup. Four of these fields render as a homepage tile."""

    label: str
    year: int | None = None
    make: str | None = None
    model: str | None = None

    odometer: int | None = None
    odometer_date: date | None = None

    recent_mpg: float | None = None
    average_mpg: float | None = None

    upcoming_maintenance: int
    overdue_maintenance: int

    service_records: int
    fuel_records: int
    last_service_date: date | None = None
    last_fuel_date: date | None = None

    documents: int
    notes: int
    photos: int


class WidgetVehicleV2(BaseModel):
    """Per-vehicle rollup exposing BOTH unit systems (v2).

    Metric is the canonical/native representation; the imperial fields are
    boundary conversions included so a single endpoint serves users on either
    system. Every field of the v1 ``WidgetVehicle`` is preserved verbatim
    (``odometer`` in miles, ``recent_mpg``/``average_mpg``) so v2 is a strict
    superset and the legacy imperial endpoint can be retired losslessly. The
    homepage customapi widget picks which 4 fields to display.

    Engine-hours fields (Task 8): ``latest_hours``/``average_l_per_hr``/
    ``average_cost_per_hr`` are hours-only additions — v1 never gains these,
    since it is frozen. Hours are dimensionless (no imperial/metric split),
    so unlike the distance fields above there is no second unit-system
    variant to add; ``Decimal`` end to end, matching
    ``schemas/dashboard.py``'s ``VehicleStatistics``. Null for a
    pure-distance vehicle (no ``hours_records`` rows).
    """

    label: str
    year: int | None = None
    make: str | None = None
    model: str | None = None

    odometer: int | None = None  # miles — preserves the v1 key (strict superset)
    odometer_km: int | None = None  # metric
    odometer_date: date | None = None

    recent_l_per_100km: float | None = None
    average_l_per_100km: float | None = None
    recent_km_per_l: float | None = None
    average_km_per_l: float | None = None
    recent_mpg: float | None = None
    average_mpg: float | None = None

    latest_hours: Decimal | None = None
    average_l_per_hr: Decimal | None = None
    average_cost_per_hr: Decimal | None = None

    upcoming_maintenance: int
    overdue_maintenance: int

    service_records: int
    fuel_records: int
    last_service_date: date | None = None
    last_fuel_date: date | None = None

    documents: int
    notes: int
    photos: int
