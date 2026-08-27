import { UnitConverter } from './units'
import type { UnitSystem } from './units'
import type { UnitSet } from '@/types/units'

/**
 * Significant digits every canonical value carries onto the wire.
 *
 * Matches `utils/unitAdapters.ts`: `number` is IEEE 754, so `6 / 4.54609`
 * evaluates to a value whose tail is noise, and posting it stores a number one
 * ulp away from the conversion's own answer.
 */
const CANONICAL_SIGNIFICANT_DIGITS = 12

/**
 * Decimal places a canonical LITRE value is rounded to before it is posted.
 *
 * ★ The wire-precision rule this task settled, applied here: a canonical write
 * is rounded ONLY where the API contract declares a precision, and then to
 * exactly the precision it declares. `liters` and `propane_liters` carry
 * `decimal_places=3` in `app/schemas/fuel.py` and `app/schemas/def_record.py`,
 * and pydantic REJECTS a fourth with a 422 rather than rounding it — so this
 * rounding is the contract's, not one the client invented. Everything else
 * this file writes (`price_per_unit`) declares no precision and is therefore
 * posted exactly, the same way `odometer_km`, `tread_depth_mm` and
 * `pressure_kpa` have been since the adapter landed.
 *
 * The old 2-decimal rounding was the client's own, tighter than the contract,
 * and it lost a digit of a gallon entry on every save.
 */
const LITERS_WIRE_DECIMALS = 3

/**
 * Decimal places a price is READ and ENTERED at.
 *
 * A display decision, not a storage one: it is what the price field has always
 * shown, and it is the fixed point that makes reopening a record and saving it
 * untouched a no-op.
 */
const PRICE_DISPLAY_DECIMALS = 3

/**
 * Normalise a converted value for the wire.
 *
 * @param value The raw arithmetic result.
 * @returns The value at 12 significant digits.
 */
function toWirePrecision(value: number): number {
  return Number(value.toPrecision(CANONICAL_SIGNIFICANT_DIGITS))
}

/**
 * Read a numeric value out of a form field, tolerating everything one can hold.
 *
 * A field registered with `registerDecimal` holds a number, `undefined`, or
 * the `INVALID_NUMBER` sentinel for text that does not parse. That sentinel
 * is a Symbol, and Symbols throw on every implicit coercion: both
 * `parseFloat(sym)` and `isNaN(sym)` raise a TypeError. So the obvious
 * `typeof v === 'number' ? v : parseFloat(v)` blows up the moment someone
 * types "abc" into a field that feeds a calculation. Returns undefined for
 * anything that is not a usable number, which callers read as "no value yet".
 */
export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

/**
 * Convert a user-entered numeric value into its canonical metric form
 * suitable for submitting to the API. Returns the raw number for metric
 * users (no float drift), and converts once for imperial users.
 *
 * Use on form-submit ONLY. Display-time conversion uses UnitFormatter.
 */
export function toCanonicalKm(value: number | null | undefined, system: UnitSystem): number | null {
  if (value == null || isNaN(value)) return null
  return system === 'metric' ? value : (UnitConverter.milesToKm(value) ?? value)
}

/**
 * Convert an entered volume into canonical litres for the API.
 *
 * ★ Takes the client's resolved `UnitSet`, not a binary `UnitSystem`, and that
 * is the fix rather than a tidy-up. The binary helpers consulted
 * `UnitConverter`'s mutable gallon factor, which `useGallonStandardSync` drives
 * from the INSTANCE setting; a user resolving `gal_uk` on a US-default instance
 * therefore stored 10 gal as 37.85 L. It must move with `priceToCanonical` in
 * the same submit, or one payload carries two gallons (defect L1).
 *
 * Use on form-submit ONLY. Display-time conversion uses
 * `UnitConverter.litersToVolumeUnit`.
 *
 * @param value The value the user entered, in `units.volume`.
 * @param units The client's resolved unit set.
 * @returns Canonical litres at the API's declared precision, or null.
 */
export function toCanonicalLiters(value: number | null | undefined, units: UnitSet): number | null {
  if (value == null || isNaN(value)) return null
  const liters = value * UnitConverter.LITERS_PER_VOLUME_UNIT[units.volume]
  return parseFloat(toWirePrecision(liters).toFixed(LITERS_WIRE_DECIMALS))
}

export function toCanonicalKg(value: number | null | undefined, system: UnitSystem): number | null {
  if (value == null || isNaN(value)) return null
  return system === 'metric' ? value : (UnitConverter.lbsToKg(value) ?? value)
}

export function toCanonicalMeters(value: number | null | undefined, system: UnitSystem): number | null {
  if (value == null || isNaN(value)) return null
  return system === 'metric' ? value : (UnitConverter.feetToMeters(value) ?? value)
}

export type PriceBasis = 'per_volume' | 'per_weight' | 'per_kwh' | 'per_tank'

/**
 * How many canonical units one of the client's typed units contains, for the
 * denominator a price basis names.
 *
 * ★ This replaces a hardcoded `LITERS_PER_GALLON = 3.78541` that sat under a
 * comment claiming the factors were "mirrored from UnitConverter". They were,
 * once; `units.ts` made its gallon dynamic when the UK standard shipped in
 * v3.1.0 and this copy did not follow, so a UK user's price was 20.1 percent
 * high and the read-back used the same wrong factor, which is why nothing on
 * screen disagreed. Reading the denominator from the client's own resolved set
 * fixes both the stale constant and the instance-versus-user question at once.
 *
 * A basis with no unit in its denominator (`per_kwh`, `per_tank`, an unknown
 * string) returns null, and the caller passes the value through untouched.
 *
 * @param units The client's resolved unit set.
 * @param basis The record's price basis.
 * @returns Canonical units per typed unit, or null when nothing converts.
 */
function canonicalPerTypedUnit(
  units: UnitSet,
  basis: PriceBasis | string | null | undefined,
): number | null {
  if (basis === 'per_volume') return UnitConverter.LITERS_PER_VOLUME_UNIT[units.volume]
  if (basis === 'per_weight') return UnitConverter.KG_PER_MASS_UNIT[units.mass]
  return null
}

/**
 * Convert a canonical SI price (per liter / per kg) into the user's display
 * unit, as the client's resolved set names it. per_kwh and per_tank are
 * universal and pass through unchanged.
 *
 * @param value The stored canonical price, as a number or an API string.
 * @param units The client's resolved unit set.
 * @param basis The record's price basis.
 * @returns The price per displayed unit, or null when there is no value.
 */
export function priceToDisplay(
  value: number | string | null | undefined,
  units: UnitSet,
  basis: PriceBasis | string | null | undefined,
): number | null {
  if (value == null) return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return null
  const factor = canonicalPerTypedUnit(units, basis)
  // A factor of 1 means the client's unit IS the canonical one, so there is
  // nothing to convert and nothing to re-round: rounding a stored litre price
  // here would rewrite it on a save the user never made an edit in.
  if (factor === null || factor === 1) return num
  return parseFloat((num * factor).toFixed(PRICE_DISPLAY_DECIMALS))
}

/**
 * Convert a user-entered display-unit price back into canonical SI ($/L,
 * $/kg). Inverse of priceToDisplay.
 *
 * Posted exactly, at the wire's 12 significant digits: `price_per_unit`
 * declares no `decimal_places` in the API schema, so a client-side round would
 * be a second, invented authority on storage precision. See
 * `LITERS_WIRE_DECIMALS` for the rule.
 *
 * @param value The price the user entered, per displayed unit.
 * @param units The client's resolved unit set.
 * @param basis The record's price basis.
 * @returns The canonical price, or null when there is no value.
 */
export function priceToCanonical(
  value: number | null | undefined,
  units: UnitSet,
  basis: PriceBasis | string | null | undefined,
): number | null {
  if (value == null || isNaN(value)) return null
  const factor = canonicalPerTypedUnit(units, basis)
  if (factor === null || factor === 1) return value
  return toWirePrecision(value / factor)
}
