# Units

A map of where units live in MyGarage, with pointers to the code that owns each
decision. It is deliberately short: an earlier version of this file ran to 434
lines and described a different application (Imperial storage, a `mileage`
column, a backend with no conversion logic), and a public repo whose docs
disagree with its code costs a contributor more than one with no docs at all.
**When this file and the code disagree, the code is right. Say so in a PR.**

## Storage is metric-canonical

Every unit-bearing column holds an SI value. Nothing in the database is
Imperial, and there is no per-user storage format.

| Quantity | Stored as | A real column |
|---|---|---|
| Distance | kilometres | `fuel_records.odometer_km` `Numeric(10,2)` |
| Speed | km/h | `fuel_records.obc_avg_speed_kmh` `Numeric(5,1)` |
| Volume | litres | `fuel_records.liters` `Numeric(9,3)` |
| Consumption | L/100km | `fuel_records.obc_l_per_100km` `Numeric(5,2)` |
| Mass | kilograms | `fuel_records.tank_size_kg` `Numeric(6,2)` |
| Pressure | kPa | `tires.pressure_kpa` `Numeric(7,2)` |
| Temperature | °C | `fuel_records.outside_temp_c` `Numeric(4,1)` |
| Length | metres | `vehicles.length_m` `Numeric(5,2)` |
| Tread | millimetres | `tires.tread_depth_mm` `Numeric(5,2)` |
| Torque | Nm | none yet: a display preference with nothing stored |

The column NAME carries the unit, which is the point: a column called
`odometer_km` cannot quietly come to mean miles. Engine hours
(`fuel_records.engine_hours`) are dimensionless and have no adapter.

Torque is the exception and worth knowing about before you go looking: the
`UnitSet` carries a torque preference and `UNIT_ADAPTERS` carries `nm` and
`lbft`, but no column stores a torque today. The preference is real and the
storage is not yet.

Migration `053_metric_canonical_units.py` performed the inversion in place and
is `FATAL = True`. There is no rollback path.

## Units are resolved per QUANTITY, not per system

A user does not have "a unit system". They have eleven stored choices, which
resolve into a `UnitSet`: ten quantities plus `secondary_gallon`, the flavour a
gallon takes when the primary unit does not state one.

- Vocabulary and presets: `backend/app/constants/units.py`
- Resolution (preset plus per-column overrides): `backend/app/utils/unit_resolution.py`
- Stored on `users`: `unit_preference`, `show_both_units`, and eleven nullable
  override columns (`unit_distance`, `unit_volume`, ..., `secondary_gallon`).
  NULL means "no override", never "derive from the preset".
- Instance-wide default for clients with no account: the `default_unit_prefs`
  setting, parsed by `backend/app/utils/default_unit_prefs.py`.

So litres with miles is a real, supported account, and **any code that collapses
the set into one binary `imperial | metric` answer is a defect**. The frontend's
`useUnitPreference().system` still exposes such a collapse, derived from VOLUME;
it is being removed, and the remaining call sites are the work list printed by
`bun run validate:units -- --report`.

## Conversion happens at the boundary, on BOTH sides

Both halves of the app convert, and they mirror each other module for module.

| Layer | Backend | Frontend |
|---|---|---|
| Conversion (numbers only) | `app/utils/unit_adapters.py` | `src/utils/unitAdapters.ts` |
| Show-both pairing | `app/utils/unit_counterparts.py` | (same file) |
| Composition (strings) | `app/utils/unit_formatting.py` | `src/utils/unitFormat.ts` |
| Derived rates | `app/utils/unit_derived.py` | (in `unitFormat.ts`) |
| Per-render context | `app/utils/render_context.py` | `useUnitFormat()` |

The conversion layer returns numbers and never a string; the composition layer
returns strings and never does arithmetic. Keeping them apart is what lets a
chart, a form field, a CSV column and a PDF share one conversion.

The backend converts for everything it renders itself: PDF reports
(`app/utils/pdf_*.py`), notifications
(`app/services/notifications/dispatcher.py`), scheduled jobs
(`app/tasks/scheduled.py`) and the report CSVs. Whose units it uses depends on
who asked: a request-driven render takes the caller's, a scheduled job takes the
vehicle owner's. `render_context.py` owns that choice.

CSV import and export are their own contract: a v6 header names its own unit
with a vocabulary token (`Odometer (mi)`, `Volume (gal_uk)`), so a file is
readable without knowing who wrote it. See `app/utils/csv_units.py`.

## Reading a value in a component

```tsx
const u = useUnitFormat()

<p>{u.distance.format(record.odometer_km)}</p>        // honours show-both
<p>{u.distance.formatPrimary(record.odometer_km)}</p> // one unit, never a counterpart
<Field label={t('common:mileage')} unit={u.distance.label}>
```

`format` appends the counterpart when the reader has show-both on;
`formatPrimary` never does. Show-both is a preference about a reading, not about
every reading, so a chart tooltip or a dense table cell picks `formatPrimary`.

A derived quantity composes two units and is a module function rather than a
member of `u`, because a suffix has to be applied to each representation
independently (`"3.20 L/hr (0.85 gal/hr)"`, never `"3.20 L (0.85 gal)/hr"`):

```ts
formatFuelRate(units, record.l_per_hr, showBoth)   // volume per engine hour
formatVolumePerDistance(units, litersPer1000Km)    // DEF and propane rates
```

## Entering and storing a value

Display and entry use the SAME unit, so a form must not re-convert a field the
user never touched. Round-tripping 7.50 mm through a `/32 in` field yields
7.14375 mm, which silently rewrites a value the user only looked at.

```ts
const origin = seedUnitField(record.odometer_km, u.distance)   // populate
const canonical = canonicalFromUnitField(typed, origin, u.distance)  // read back
```

`canonicalFromUnitField` returns the ORIGINAL canonical value when the field
still reads what it was seeded with, compared numerically rather than as
characters. Every path into a form (add, edit, a receipt draft, a suggestion)
has to go through both, or the one that does not becomes the corrupting one.
Both are in `frontend/src/utils/unitFormat.ts`.

## The gate

`frontend/scripts/validate-units.ts` fails a build that ADDS a unit-system
branch. It reports three kinds, each with its own remedy in the failure
message, and it is a baseline gate: known findings are recorded in
`units.baseline.json` and the baseline may only shrink. Never run `--update` to
silence a new finding.

```
bun run validate:units              # the gate
bun run validate:units -- --report  # the remaining work list, by file
bun run validate:units -- --derived # the API surface it derives
```

A finding it cannot see mechanically is recorded in
`frontend/scripts/units.manifest.json`, a reviewed per-file snapshot with its
own checker.

## Gallon flavour

US and UK gallons differ by 20%, so `gal` alone is not a unit. The account's own
`secondary_gallon` decides which one a litre-primary reader is paired with (D4b);
`gal_us` and `gal_uk` state their own flavour and win outright.

A legacy instance-wide `imperial_gallon_standard` setting still exists. It is
read only when the `default_unit_prefs` row is created or recreated at boot
(`default_unit_prefs_for_instance`), so changing it afterwards does not
retroactively move anything, and it is on its way out. Do not reach for it in
new code; resolve the account's `secondary_gallon`.

| Flavour | Litres | MPG factor |
|---|---|---|
| US | 3.78541 | 235.214 |
| UK | 4.54609 | 282.481 |

## Adding a unit

1. Add the token to the quantity's `Literal` in `app/constants/units.py` and to
   the generated frontend types (`bun run generate:api`).
2. Add its adapter to `ADAPTERS` in `app/utils/unit_adapters.py` and to
   `UNIT_ADAPTERS` in `src/utils/unitAdapters.ts`, with the same label and
   precision. Nothing asserts those two tables against each other across the
   language boundary, so this step is a manual mirror; each side's own tests
   pin its half.
3. Give it a counterpart in both `unit_counterparts` modules, or decide it has
   none.
4. Add a migration if a stored `default_unit_prefs` row changes shape.

A new QUANTITY is more work: `UNIT_QUANTITIES` in `src/types/units.ts` carries a
compile-time completeness proof, so the type errors will find the call sites for
you.
