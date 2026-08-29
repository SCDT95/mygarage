/**
 * Composition layer: turn a canonical number into the string a user reads, and
 * into the string a form field holds.
 *
 * The frontend mirror of `backend/app/utils/unit_formatting.py`. It sits on top
 * of the conversion layer (`utils/unitAdapters.ts`) and is the first place the
 * show-both grammar (a primary representation, optionally followed by its
 * counterpart in parentheses) is assembled. The adapters are deliberately
 * primitive so that composition lives here instead of leaking into them.
 *
 * **Everything user-visible here returns a `string`; every number that reaches
 * it has already been converted by the layer below.** `toDisplay` and
 * `toCanonical` are re-exposed per quantity purely as delegation, so a call
 * site holds one object rather than an adapter and a formatter; they contain no
 * arithmetic of their own.
 *
 * `format` short-circuits on null before the counterpart is considered, exactly
 * as the backend does: naively formatting both sides of an absent value would
 * render `"N/A (N/A)"`. The check is the primary adapter's own `toDisplay`, not
 * a string comparison, so a coincidentally N/A-shaped label cannot fool it.
 *
 * ★ `toInputValue` and the two `UnitField` helpers are the ENTRY and STORAGE
 * boundary, and they exist because a display unit that only formats corrupts
 * data. Binding decision D2 requires one unit for entry and display, so once a
 * tread field reads `9/32 in` the input means thirty-seconds too. The trap is
 * the round trip: 7.50 mm shows as 9, and 9 converts back to 7.14375 mm, so a
 * user who opens a form, edits an unrelated field and saves would silently
 * rewrite a value they never touched. `seedUnitField` records the canonical
 * value each field was populated from, and `canonicalFromUnitField` gives that
 * value straight back when the field still reads what it was seeded with. Every
 * form path (add, edit, and any separate reading path) must go through both, or
 * the one that does not becomes the corrupting one.
 *
 * There are no translated strings in this module. Unit labels are symbols, not
 * prose, and `"N/A"` matches what `UnitFormatter` has always rendered; adding
 * `i18next.t()` here would need namespace-qualified keys, since this is not a
 * component and has no `useTranslation`.
 */

import { getActiveLocale } from '@/constants/i18n'
import { UNIT_QUANTITIES, type UnitQuantity, type UnitSet } from '@/types/units'
import { adapterFor, counterpartFor, type UnitAdapter, type UnitToken } from './unitAdapters'

/**
 * What `format` renders when there is no value to render.
 *
 * Exported because a value beside a formatted one has to spell absence the same
 * way: the fuel form's OBC preview renders two quantities through `format` and
 * a trip duration in seconds, which is not a quantity and has no formatter. A
 * literal there would silently disagree the day this constant moves, and the
 * module docstring above deliberately leaves that door open.
 */
export const NOT_AVAILABLE = 'N/A'

/** One quantity's units, resolved for a particular client. */
export interface QuantityFormat {
  /** The resolved token, e.g. `'in32'`. */
  readonly unit: UnitToken
  /** The unit's display label, e.g. `'/32 in'`. */
  readonly label: string
  /** Decimal places this unit is read and entered at. */
  readonly precision: number
  /** The `step` an `<input type="number">` in this unit should carry. */
  readonly step: string
  /** Canonical to this unit. Exact; the conversion layer's answer, unrounded. */
  toDisplay(canonical: number | null | undefined): number | null
  /** This unit to canonical. Exact; the conversion layer's answer, unrounded. */
  toCanonical(typed: number | null | undefined): number | null
  /** Canonical to the ungrouped string an `<input type="number">` accepts. */
  toInputValue(canonical: number | null | undefined): string
  /**
   * Canonical to the grouped number a reader sees, with NO label.
   *
   * `format` is the whole string; this is its numeric half, for a call site
   * that renders the label separately (LiveLink's gauges set the unit in a
   * smaller type size). An absent value is `''` rather than `'N/A'`, matching
   * `toInputValue`: a caller composing its own label supplies its own absent
   * marker, and `'N/A'` beside a unit label would read as a value.
   */
  toDisplayText(canonical: number | null | undefined): string
  /**
   * Canonical to a labelled string in THIS unit only, never the counterpart.
   *
   * ★ It exists because the capability would otherwise have been silently
   * dropped in the migration. The binary `formatDistance(km, system, showBoth)`
   * took the counterpart as an ARGUMENT, and eleven read sites passed `false`
   * to suppress it: chart tooltips, dense table cells, inline spans where a
   * parenthesised second unit is noise rather than information. `format` reads
   * show-both off the resolved set, so moving those sites onto it would start
   * rendering a counterpart nobody asked for AT THAT SITE. Show-both is a
   * preference about a reading, not about every reading.
   */
  formatPrimary(canonical: number | null | undefined): string
  /** Canonical to a labelled string, with the counterpart when show-both is on. */
  format(canonical: number | null | undefined): string
}

/** Every quantity, resolved for a particular client. */
export type UnitFormat = Readonly<Record<UnitQuantity, QuantityFormat>>

/**
 * A unit-bearing form field's canonical origin.
 *
 * `display` is the string `seedUnitField` produced, kept so that "the user did
 * not touch this" is a comparison rather than a guess. Re-typing the same
 * displayed value counts as untouched, which is correct: the displayed quantity
 * did not change, so neither should the stored one.
 */
export interface UnitFieldOrigin {
  /** The canonical value the field was populated from, if any. */
  canonical: number | null
  /** The string that canonical value produced, in the client's unit. */
  display: string
}

/**
 * Render a number at a fixed precision, grouped for the active locale.
 *
 * Exported because a value OUTSIDE the unit system still has to be rendered the
 * same way: LiveLink's RPM, voltage and percentage gauges carry a precision but
 * no adapter, and formatting them locally is how `telemetryUnits.ts` grew a
 * second implementation of this function.
 *
 * @param value The already-converted display value.
 * @param precision Decimal places.
 * @returns The grouped string, e.g. `'1,000'`.
 */
export function formatAtPrecision(value: number, precision: number): string {
  return new Intl.NumberFormat(getActiveLocale(), {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value)
}

/**
 * Render one adapter's view of a canonical value, label included.
 *
 * The separating space is suppressed for a label that starts with `/`, so tread
 * reads `'9/32 in'` rather than `'9 /32 in'`.
 *
 * @param adapter The adapter to render through.
 * @param canonical The canonical value.
 * @returns The labelled string, or `'N/A'` when there is nothing to render.
 */
function render(adapter: UnitAdapter, canonical: number | null | undefined): string {
  const display = adapter.toDisplay(canonical)
  if (display === null) return NOT_AVAILABLE
  const number = formatAtPrecision(display, adapter.precision)
  return adapter.label.startsWith('/') ? `${number}${adapter.label}` : `${number} ${adapter.label}`
}

/**
 * Build one quantity's formatter.
 *
 * @param units The client's resolved unit set.
 * @param quantity Which quantity to build.
 * @param showBoth Whether to append the counterpart representation.
 * @returns The quantity's formatter.
 */
function quantityFormat(units: UnitSet, quantity: UnitQuantity, showBoth: boolean): QuantityFormat {
  const adapter = adapterFor(units, quantity)
  const counterpart = counterpartFor(units, quantity)
  return {
    unit: adapter.unit,
    label: adapter.label,
    precision: adapter.precision,
    // 0 -> '1', 1 -> '0.1', 2 -> '0.01'. `toFixed` is for readability, not for
    // safety: no adapter in the table has a precision above 2, and `10 ** -1`
    // and `10 ** -2` both stringify exactly, so this line has no reachable case
    // where the two spellings differ. Replacing it with `String(...)` survives
    // mutation for that reason, which is a fact about the vocabulary rather
    // than a hole in the tests.
    step: adapter.precision === 0 ? '1' : (10 ** -adapter.precision).toFixed(adapter.precision),
    toDisplay: (canonical) => adapter.toDisplay(canonical),
    toCanonical: (typed) => adapter.toCanonical(typed),
    toInputValue(canonical) {
      const display = adapter.toDisplay(canonical)
      return display === null ? '' : display.toFixed(adapter.precision)
    },
    toDisplayText(canonical) {
      const display = adapter.toDisplay(canonical)
      return display === null ? '' : formatAtPrecision(display, adapter.precision)
    },
    formatPrimary(canonical) {
      return render(adapter, canonical)
    },
    format(canonical) {
      // Null short-circuits BEFORE the counterpart, or an absent value renders
      // as "N/A (N/A)".
      if (adapter.toDisplay(canonical) === null) return NOT_AVAILABLE
      const primary = render(adapter, canonical)
      if (!showBoth || counterpart === null) return primary
      return `${primary} (${render(counterpart, canonical)})`
    },
  }
}

/**
 * Build the formatters for a resolved unit set.
 *
 * The non-hook entry point: anything outside a component (an export, a chart
 * transform, a test) resolves its own set and calls this. `useUnitFormat()`
 * wraps it for components.
 *
 * @param units The client's resolved unit set.
 * @param showBoth Whether to append each counterpart representation.
 * @returns One formatter per quantity.
 */
export function makeUnitFormat(units: UnitSet, showBoth = false): UnitFormat {
  const out = {} as Record<UnitQuantity, QuantityFormat>
  for (const quantity of UNIT_QUANTITIES) {
    out[quantity] = quantityFormat(units, quantity, showBoth)
  }
  return out
}

/**
 * Every quantity's unit label for a resolved set, as one comma-separated list.
 *
 * ★ WHY THIS EXISTS, and it is a correctness fix rather than a convenience.
 * The settings screen used to choose between two fixed sentences, "Using
 * imperial units: gallons, miles, MPG, °F, PSI, lbs, lb-ft" and "Using metric
 * units: liters, kilometers, L/100km, °C, bar, kg, Nm", on the collapsed binary
 * system. That system is derived from VOLUME (spec D8), so a
 * `{volume:'L', distance:'mi', pressure:'psi'}` account was shown the metric
 * sentence and TOLD IT USES KILOMETRES AND BAR. It uses miles and PSI. Plan 3b
 * ruling R1: that is not explanatory copy needing an exemption, it is the app
 * stating something false about the reader's own settings, so the sentence is
 * composed from the resolved set instead of selected from two.
 *
 * ★ The labels come from `UNIT_ADAPTERS` through `adapterFor`, which is the same
 * table every rendered quantity in the app reads its label from. A second table
 * of prose unit names ("gallons", "kilometers") would be a fourth parallel unit
 * vocabulary of exactly the kind this workstream has been unpicking, and it
 * could drift from what the screens actually render. It also means the list
 * needs no translation: these are symbols, not prose, and the surrounding
 * sentence is the translated part.
 *
 * ★ It walks `UNIT_QUANTITIES` rather than a hand-picked list. The sentence it
 * replaced named seven of the ten quantities, and a list maintained by hand is
 * a floor: speed, length and tread were simply missing, so a user with imperial
 * tread and metric everything else read a description that could not mention
 * it. `UNIT_QUANTITIES` carries a compile-time completeness proof, so a
 * quantity added later appears here without anybody remembering to add it.
 *
 * @param units The client's resolved unit set.
 * @returns The ten labels, in `UNIT_QUANTITIES` order, e.g.
 *   `'mi, mph, ft, gal, MPG, PSI, °F, lb, lb-ft, /32 in'`.
 */
export function resolvedUnitSummary(units: UnitSet): string {
  return UNIT_QUANTITIES.map((quantity) => adapterFor(units, quantity).label).join(', ')
}

/**
 * Populate a unit-bearing form field, remembering where its value came from.
 *
 * @param canonical The stored canonical value, or null for an empty field.
 * @param quantity The formatter for the field's quantity.
 * @returns The field's display string and its canonical origin.
 */
export function seedUnitField(
  canonical: number | null | undefined,
  quantity: QuantityFormat
): UnitFieldOrigin {
  return { canonical: canonical ?? null, display: quantity.toInputValue(canonical) }
}

/**
 * Read a unit-bearing form field back into canonical storage.
 *
 * An untouched field returns the canonical value it was seeded from, NOT a
 * re-conversion of its display string: converting `7.50 mm` to `9/32 in` and
 * back yields `7.14375 mm`, so re-converting would corrupt a field the user
 * never edited. See the module docstring.
 *
 * ★ "Untouched" is a question about the QUANTITY, not about the characters,
 * and that distinction is a data defect rather than a nicety. `seedUnitField`
 * writes `toFixed(precision)`, so 9.07 kg seeds a pound field as `'20.00'`; a
 * `<select>` option value and a react-hook-form NUMBER field both round-trip
 * through `Number`, so the only string either can offer back is `'20'`. On
 * characters alone that reads as an edit and reconverts, storing 9.07184 kg in
 * a record the user only opened. Phase 3a task 3c met this on the fuel
 * odometer and sidestepped it by pinning `mi` and `km` to zero decimals, where
 * the two spellings coincide; mass carries two, so the sidestep does not reach
 * it. Comparing numerically covers both and needs no per-unit precision to
 * hold.
 *
 * The empty-origin guard is load bearing: `Number('')` is 0, so without it a
 * field that started empty would read a typed `0` as unchanged and store null.
 *
 * @param typed What the input currently holds.
 * @param origin What `seedUnitField` recorded for this field.
 * @param quantity The formatter for the field's quantity.
 * @returns The canonical value to store, or null when the field is empty or
 *   holds something that is not a number.
 */
export function canonicalFromUnitField(
  typed: string,
  origin: UnitFieldOrigin,
  quantity: QuantityFormat
): number | null {
  if (typed === origin.display) return origin.canonical
  if (typed.trim() === '') return null
  if (origin.display !== '' && Number(typed) === Number(origin.display)) return origin.canonical
  return quantity.toCanonical(Number(typed))
}
