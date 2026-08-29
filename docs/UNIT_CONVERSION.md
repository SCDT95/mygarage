# Unit Conversion System

> **STALE, and stale at the premise. Do not copy code from this document.**
>
> It describes a two-system model in which "All data is stored in Imperial
> units". Storage has been metric-canonical since `6f04e53`, and units are
> resolved PER QUANTITY rather than per system, so a reader can hold litres and
> miles at once. Several APIs named below no longer exist:
> `UnitFormatter.formatDistance`, `UnitFormatter.getDistanceUnit`,
> `UnitConverter.kmToMiles` and `UnitConverter.milesToKm` were deleted once
> their last call site moved onto the resolved token, along with
> `formatVolumePerDistance` and `getVolumePerDistanceLabel`, which moved to
> `frontend/src/utils/unitFormat.ts`.
>
> The live contract is `frontend/src/utils/unitAdapters.ts` (conversion),
> `frontend/src/utils/unitFormat.ts` (composition) and `useUnitFormat()` in a
> component. This banner is here because deleting an API without saying so
> leaves a document people copy from; rewriting the document is its own task.

MyGarage includes a comprehensive unit conversion system that allows users to view and enter data in either Imperial (US) or Metric units based on their preference.

## Overview

The unit conversion system supports per-user preferences, allowing different users to work with their preferred unit system. Values are converted on-the-fly for display and input. (This paragraph used to add "All data is stored in Imperial units (the canonical format)". That has been false since `6f04e53`: storage is metric-canonical. The sentence was deleted rather than the paragraph, because a contributor greps for "canonical" and lands here, not on the banner at the top.)

### Supported Units

| Measurement Type | Imperial | Metric |
|-----------------|----------|--------|
| **Distance** | Miles (mi) | Kilometers (km) |
| **Volume** | Gallons (gal) | Liters (L) |
| **Fuel Economy** | Miles per Gallon (MPG) | Liters per 100km (L/100km) |
| **Temperature** | Fahrenheit (°F) | Celsius (°C) |
| **Pressure** | PSI | Bar / kPa |
| **Weight** | Pounds (lb) | Kilograms (kg) |
| **Dimensions** | Inches (in) | Centimeters (cm) |
| **Torque** | Foot-pounds (ft-lb) | Newton-meters (Nm) |

## User Interface

### Settings Location

Navigate to **Settings → Preferences → Unit System** to configure your unit preferences.

**Available Options:**
- **Unit System**: Choose between `Imperial` or `Metric`
- **Show Both Units**: Toggle to display both unit systems simultaneously
  - Example: `25 MPG (9.4 L/100km)` or `100 km (62 mi)`

### Where Units Are Applied

Unit conversion is automatically applied across the entire application:

#### Forms (Input)
- **Fuel Record Form**: Volume (gallons/liters), Odometer reading (miles/km)
- **Odometer Record Form**: Mileage (miles/km)
- **Service Record Form**: Mileage (miles/km), Service reminder mileage (miles/km)
- **Reminder Form**: Due mileage field (miles/km)

#### Display Components
- **Dashboard**: Vehicle odometer readings, average fuel economy
- **Fuel Record List**: Volume, mileage, fuel economy
- **Odometer Record List**: All mileage values
- **Service Record List**: Service mileage values
- **Analytics Page**: All charts, statistics, and tables
  - Fuel Economy Analysis (charts and trends)
  - Summary statistics
  - Period comparisons
  - Service predictions

#### Charts & Visualizations
- **Fuel Economy Trend Chart**: Y-axis automatically shows MPG or L/100km
- **Analytics Tables**: All columns with distance, volume, or fuel economy
- **Tooltips**: Hover values display in user's preferred units

## Technical Implementation

### Architecture Pattern: Canonical Storage

MyGarage uses a **canonical storage pattern** where:
1. All data is stored in **SI metric units** in the database (km, L, kg, kPa, °C,
   Nm, mm). It was Imperial when this document was written; `6f04e53` inverted
   it, and the two flow diagrams below were corrected with this list.
2. Conversion happens at the **API boundary** (frontend ↔ backend)
3. Users see and enter data in their **preferred units**, resolved per quantity
   rather than per system, so one reader can hold litres and miles at once.

**Benefits:**
- No data migration required when changing preferences
- Single source of truth prevents rounding errors
- Historical data remains consistent
- Easy to add new unit systems in the future

### Data Flow

#### Input Flow (User → Database)
```
User enters: 100 mi
↓
Frontend converts: mi → km (160.934 km)
↓
API receives: 160.934 km
↓
Database stores: 160.934 (canonical metric)
```

#### Output Flow (Database → User)
```
Database returns: 160.934 (canonical metric)
↓
API sends: 160.934 km
↓
Frontend converts: km → mi (100 mi)
↓
User sees: 100 mi
```

### Conversion Utilities

#### UnitConverter Class
Located in `frontend/src/utils/units.ts`

Provides static methods for bidirectional conversion.

> **This listing is stale beyond the two lines phase 3b task 2 corrected.** Six
> of the names below have never existed under these spellings (`mpgToLPer100Km`,
> `lPer100KmToMpg`, `psiToKpa`, `kpaToPsi`, `ftLbsToNm`, `nmToFtLbs`; the real
> ones are `mpgToL100km`, `l100kmToMpg`, `psiToKPa`, `kPaToPsi`, `lbftToNm`,
> `nmToLbft`), and nine of the methods listed have no caller left anywhere in the
> frontend. The temperature pair was removed here because it went from misleading
> to FALSE when task 2 deleted it; the rest predates that change and a full
> rewrite of this document is deferred. Read `frontend/src/utils/units.ts`.

```typescript
// Distance conversions: NONE. `milesToKm` and `kmToMiles` were deleted by
// plan 3b task 6 once their last call site moved onto the resolved
// `units.distance` adapter. Convert distance through `UNIT_ADAPTERS`.

// Volume conversions
UnitConverter.gallonsToLiters(gallons: number): number
UnitConverter.litersToGallons(liters: number): number

// Fuel economy conversions
UnitConverter.mpgToLPer100Km(mpg: number): number
UnitConverter.lPer100KmToMpg(lPer100Km: number): number

// Pressure conversions
UnitConverter.psiToBar(psi: number): number
UnitConverter.barToPsi(bar: number): number
UnitConverter.psiToKpa(psi: number): number
UnitConverter.kpaToPsi(kpa: number): number

// Weight conversions
UnitConverter.lbsToKg(lbs: number): number
UnitConverter.kgToLbs(kg: number): number

// Torque conversions
UnitConverter.ftLbsToNm(ftLbs: number): number
UnitConverter.nmToFtLbs(nm: number): number
```

#### UnitFormatter Class
Located in `frontend/src/utils/units.ts`

Provides display formatting with unit labels:

```typescript
// Format distance with unit label: GONE. `formatDistance` was deleted by
// plan 3b task 6. Use `useUnitFormat().distance.format(km)`, or
// `.formatPrimary(km)` where the counterpart would be noise.

// Format volume with unit label
UnitFormatter.formatVolume(gallons: number, system: 'imperial' | 'metric', showBoth: boolean): string
// Returns: "15 gal" or "56.8 L" or "15 gal (56.8 L)"

// Format fuel economy with unit label
UnitFormatter.formatFuelEconomy(mpg: number, system: 'imperial' | 'metric', showBoth: boolean): string
// Returns: "25 MPG" or "9.4 L/100km" or "25 MPG (9.4 L/100km)"

// Get unit labels only
// `getDistanceUnit` was deleted by plan 3b task 6; the label is
// `useUnitFormat().distance.label`.
UnitFormatter.getVolumeUnit(units: UnitSet): string    // "gal" or "L"
UnitFormatter.getFuelEconomyUnit(system: 'imperial' | 'metric'): string  // "MPG" or "L/100km"
```

### React Hook: useUnitPreference

Located in `frontend/src/hooks/useUnitPreference.ts`

Provides access to user's unit preferences:

```typescript
const { system, showBoth } = useUnitPreference()

// system: 'imperial' | 'metric'
// showBoth: boolean
```

Uses React Context to share preferences across the application.

### Fuel Economy Conversion Formula

Fuel economy uses a special conversion formula since the metrics are inverted:

```
MPG ↔ L/100km conversion factor: 235.214

L/100km = 235.214 / MPG
MPG = 235.214 / L/100km
```

**Examples:**
- 25 MPG = 9.41 L/100km
- 10 L/100km = 23.52 MPG

## Form Implementation Pattern

### Input Forms and Display Components

★ **Two worked examples used to sit here and they are deleted, not moved.** They
taught the shape this phase exists to remove: a `system === 'metric'` branch
around `UnitConverter.milesToKm` / `kmToMiles` on submit, a
`UnitFormatter.getDistanceUnit(system)` label, and a
`UnitFormatter.formatDistance(record.mileage, system, showBoth)` read. All four
of those functions were deleted by plan 3b task 6, so the examples could not be
copied even if they were right, and `system` is collapsed from the user's VOLUME
choice, so they were wrong for anyone holding litres and miles at once.

The live pattern, in one line each:

```typescript
const u = useUnitFormat()

// display, honouring the reader's show-both preference
<p>{u.distance.format(record.odometer_km)}</p>
// display, where a parenthesised counterpart would be noise
<p>{u.distance.formatPrimary(record.odometer_km)}</p>
// a label
<Field label={t('common:mileage')} unit={u.distance.label}>
// entry and storage, origin-preserving so an untouched save does not reconvert
const origin = seedUnitField(record.odometer_km, u.distance)
const canonical = canonicalFromUnitField(typed, origin, u.distance)
```

`seedUnitField` and `canonicalFromUnitField` are in
`frontend/src/utils/unitFormat.ts`. Read a migrated form
(`OdometerRecordForm.tsx`, `ReminderForm.tsx`) rather than this document.

### Chart Components

Charts need dynamic axis labels and tooltip formatting:

```typescript
import { useUnitPreference } from '../hooks/useUnitPreference'
import { UnitFormatter } from '../utils/units'

function MyChart({ data }) {
  const { system, showBoth } = useUnitPreference()

  return (
    <LineChart data={data}>
      <YAxis
        label={{
          value: UnitFormatter.getFuelEconomyUnit(system),
          angle: -90,
          position: 'insideLeft'
        }}
      />
      <Tooltip
        content={({ payload }) => (
          <div>
            {UnitFormatter.formatFuelEconomy(payload[0].value, system, showBoth)}
          </div>
        )}
      />
    </LineChart>
  )
}
```

## Backend API

The backend API **always expects and returns Imperial units**. No conversion logic exists on the backend.

### Request Example
```json
POST /api/fuel-records
{
  "vin": "1HGCM82633A123456",
  "date": "2025-12-11",
  "mileage": 62137,        // Always in miles
  "gallons": 12.5,         // Always in gallons
  "price_per_gallon": 3.45
}
```

### Response Example
```json
GET /api/fuel-records/123
{
  "id": 123,
  "vin": "1HGCM82633A123456",
  "date": "2025-12-11",
  "mileage": 62137,        // Always in miles
  "gallons": 12.5,         // Always in gallons
  "mpg": 28.5,             // Always MPG (when calculated)
  "price_per_gallon": 3.45
}
```

The frontend is responsible for converting to/from the user's preferred units.

## Database Schema

All numeric columns store Imperial units:

```sql
-- fuel_records table
CREATE TABLE fuel_records (
    id INTEGER PRIMARY KEY,
    vin TEXT NOT NULL,
    date DATE NOT NULL,
    mileage INTEGER NOT NULL,      -- Stored in miles
    gallons REAL NOT NULL,          -- Stored in gallons
    price_per_gallon REAL,
    -- ...
);

-- odometer_records table
CREATE TABLE odometer_records (
    id INTEGER PRIMARY KEY,
    vin TEXT NOT NULL,
    date DATE NOT NULL,
    mileage INTEGER NOT NULL,      -- Stored in miles
    -- ...
);
```

## User Preferences Storage

Unit preferences are stored per-user in the `user_settings` table:

```sql
CREATE TABLE user_settings (
    user_id TEXT PRIMARY KEY,
    unit_system TEXT DEFAULT 'imperial',  -- 'imperial' or 'metric'
    show_both_units BOOLEAN DEFAULT 0,
    -- ...
);
```

Preferences are loaded on app initialization and stored in React Context.

## Testing Recommendations

When testing unit conversion:

1. **Create records in Imperial mode**
   - Add a fuel record: 100 miles, 5 gallons = 20 MPG

2. **Switch to Metric mode**
   - Verify display shows: 161 km, 18.9 L, 11.8 L/100km

3. **Edit the record in Metric mode**
   - Change to 200 km
   - Save and verify it saved as ~124 miles

4. **Test "Show Both Units" toggle**
   - Enable and verify display shows: "200 km (124 mi)"

5. **Test charts and analytics**
   - Verify Y-axis labels change
   - Verify tooltip values convert properly
   - Check table headers show correct units

## Known Limitations

- **Existing API clients**: If you have custom scripts calling the MyGarage API, they must continue to use Imperial units
- **Database queries**: Direct database queries will return Imperial units
- **Import/Export**: CSV exports currently use Imperial units (may add unit selection in future)

## Future Enhancements

Potential improvements for future versions:

- [x] Support for additional unit systems (e.g., UK Imperial with different gallons)
- [ ] Per-record unit display for mixed garages (US and EU vehicles)
- [ ] Unit preference for CSV exports
- [ ] API parameter to request specific unit system in response
- [ ] Bulk data migration tool (if user wants to store in metric)

### UK Imperial gallons

Settings → System Configuration → Imperial gallon standard (when unit system is Imperial):

- **US gallon** (default): 3.78541 L — US MPG factor 235.214
- **UK gallon**: 4.54609 L — UK MPG factor 282.481

Storage remains SI metric; only display and form conversion use the selected gallon.

## Troubleshooting

### Issue: Values look wrong after switching units

**Solution**: Clear browser cache and reload. The unit preference is cached in localStorage.

### Issue: Form won't accept my metric value

**Solution**: Ensure your browser locale uses decimal point (.) not comma (,). Example: `100.5` not `100,5`

### Issue: Chart shows Imperial even though I selected Metric

**Solution**: The chart component may need a page refresh to pick up the new context value. Try hard refresh (Ctrl+Shift+R).

### Issue: "Show Both Units" not working

**Solution**: This feature requires both toggles to be enabled:
1. Unit System must be set (Imperial or Metric)
2. "Show Both Units" toggle must be ON

## Contributing

To add support for a new unit type:

1. Add conversion methods to `UnitConverter` class
2. Add formatting method to `UnitFormatter` class
3. Add the unit type to the settings form
4. Update relevant form components to use the new converter
5. Update display components to use the new formatter
6. Add tests for the conversion formulas
7. Update this documentation

See `frontend/src/utils/units.ts` for implementation examples.
