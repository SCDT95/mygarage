/**
 * The composition layer, mirroring `backend/app/utils/unit_formatting.py`.
 *
 * Everything asserted here is a STRING. The numbers it is built from are pinned
 * one layer down in `unitAdapters.test.ts`; the expectations below are still
 * hand-written from the factor and the input rather than read off a run.
 *
 * The active Intl locale is `en-US` in tests (`constants/i18n.ts` seeds it and
 * nothing changes it here), so grouped output uses a comma.
 */
import { describe, it, expect } from 'vitest'
import {
  canonicalFromUnitField,
  formatAtPrecision,
  makeUnitFormat,
  resolvedUnitSummary,
  seedUnitField,
  type UnitFieldOrigin,
} from '../unitFormat'
import { UNIT_QUANTITIES, presetUnitsFor, type UnitSet } from '@/types/units'

const IMPERIAL = presetUnitsFor('imperial', 'us')
const METRIC = presetUnitsFor('metric', 'us')

describe('makeUnitFormat', () => {
  it('answers for every quantity and nothing else', () => {
    const u = makeUnitFormat(IMPERIAL)
    expect(Object.keys(u).sort()).toStrictEqual([...UNIT_QUANTITIES].sort())
  })

  it('exposes the resolved token, label and precision per quantity', () => {
    const u = makeUnitFormat(IMPERIAL)
    expect(u.tread.unit).toBe('in32')
    expect(u.tread.label).toBe('/32 in')
    expect(u.tread.precision).toBe(0)
    expect(u.pressure.label).toBe('PSI')
    expect(makeUnitFormat(METRIC).pressure.label).toBe('kPa')
  })

  it('delegates conversion to the adapter without re-implementing it', () => {
    const u = makeUnitFormat(IMPERIAL)
    // 9/32 in x 0.79375 = 7.14375 mm
    expect(u.tread.toCanonical(9)).toBe(7.14375)
    // 7.5 mm / 0.79375 = 9.448818897637795..., to 12 significant digits
    expect(u.tread.toDisplay(7.5)).toBe(9.44881889764)
  })
})

describe('format', () => {
  it('renders the primary alone when show-both is off', () => {
    const u = makeUnitFormat(IMPERIAL)
    // 7.5 mm is 9.4488... thirty-seconds, and in32 renders at 0 decimals.
    expect(u.tread.format(7.5)).toBe('9/32 in')
    // 240 kPa / 6.89476 = 34.809043..., at 1 decimal.
    expect(u.pressure.format(240)).toBe('34.8 PSI')
  })

  it('suppresses the separating space only for a label that starts with a slash', () => {
    expect(makeUnitFormat(IMPERIAL).tread.format(7.5)).toBe('9/32 in')
    expect(makeUnitFormat(METRIC).tread.format(7.5)).toBe('7.50 mm')
  })

  it('groups thousands in the active locale', () => {
    // 1,609.34 km / 1.60934 = 1000 mi
    expect(makeUnitFormat(IMPERIAL).distance.format(1609.34)).toBe('1,000 mi')
  })

  it('appends the counterpart in parentheses when show-both is on', () => {
    const u = makeUnitFormat(IMPERIAL, true)
    expect(u.tread.format(7.5)).toBe('9/32 in (7.50 mm)')
    // psi counterparts to kpa, never to bar.
    expect(u.pressure.format(240)).toBe('34.8 PSI (240 kPa)')
  })

  it("takes a litre primary's counterpart gallon from secondary_gallon", () => {
    expect(makeUnitFormat(presetUnitsFor('metric', 'us'), true).volume.format(10)).toBe(
      '10.00 L (2.64 gal)'
    )
    // 10 L / 4.54609 = 2.1997... UK gallons
    expect(makeUnitFormat(presetUnitsFor('metric', 'uk'), true).volume.format(10)).toBe(
      '10.00 L (2.20 gal)'
    )
  })

  it('returns N/A for an absent value, with no counterpart', () => {
    const u = makeUnitFormat(IMPERIAL, true)
    expect(u.tread.format(null)).toBe('N/A')
    expect(u.tread.format(undefined)).toBe('N/A')
  })

  it('short-circuits before the counterpart when the primary is undefined', () => {
    // A reciprocal adapter's zero has no display value. Formatting both sides
    // independently would render "N/A (N/A)".
    const u = makeUnitFormat(IMPERIAL, true)
    expect(u.consumption.format(0)).toBe('N/A')
  })
})

describe('formatPrimary', () => {
  it('renders the primary alone even when show-both is ON', () => {
    // ★ WHY THIS EXISTS. The binary `formatDistance(km, system, showBoth)` took
    // the counterpart as an ARGUMENT, so eleven read sites passed `false` to
    // suppress it: chart tooltips, dense table cells and inline spans where a
    // parenthesised second unit is noise. `format` reads show-both off the
    // resolved set instead, so migrating those sites onto it would start
    // rendering a counterpart nobody asked for at that site. This is the
    // capability that would otherwise have been silently dropped.
    const both = makeUnitFormat(IMPERIAL, true)
    // 1,609.34 km / 1.60934 = 1000 mi, counterpart km at 0 decimals.
    expect(both.distance.format(1609.34)).toBe('1,000 mi (1,609 km)')
    expect(both.distance.formatPrimary(1609.34)).toBe('1,000 mi')
  })

  it('is the same string as format when show-both is off', () => {
    const single = makeUnitFormat(IMPERIAL)
    for (const quantity of UNIT_QUANTITIES) {
      expect(single[quantity].formatPrimary(240)).toBe(single[quantity].format(240))
    }
  })

  it('keeps the slash-label spacing rule and the absent marker', () => {
    const both = makeUnitFormat(IMPERIAL, true)
    expect(both.tread.formatPrimary(7.5)).toBe('9/32 in')
    expect(both.distance.formatPrimary(null)).toBe('N/A')
    expect(both.consumption.formatPrimary(0)).toBe('N/A')
  })
})

describe('step', () => {
  it('follows the unit precision rather than a fixed 0.1', () => {
    // The tread inputs carried step="0.1" while in32 is a whole-number unit,
    // so the spinner offered tenths of a thirty-second of an inch.
    expect(makeUnitFormat(IMPERIAL).tread.step).toBe('1')
    expect(makeUnitFormat(METRIC).tread.step).toBe('0.01')
    expect(makeUnitFormat(IMPERIAL).pressure.step).toBe('0.1')
    expect(makeUnitFormat(METRIC).pressure.step).toBe('1')
  })
})

describe('toDisplayText', () => {
  it('renders the converted number grouped, at the unit precision, with no label', () => {
    // The label is composed by the caller. LiveLink renders the number and the
    // unit in different type sizes, and used to reimplement both halves.
    expect(makeUnitFormat(IMPERIAL).distance.toDisplayText(1609.34)).toBe('1,000')
    expect(makeUnitFormat(IMPERIAL).pressure.toDisplayText(240)).toBe('34.8')
    expect(makeUnitFormat(METRIC).pressure.toDisplayText(240)).toBe('240')
  })

  it('renders an absent value as the empty string, matching toInputValue', () => {
    expect(makeUnitFormat(IMPERIAL).distance.toDisplayText(null)).toBe('')
    expect(makeUnitFormat(IMPERIAL).consumption.toDisplayText(0)).toBe('')
  })
})

describe('formatAtPrecision', () => {
  it('groups and fixes the decimals in the active locale', () => {
    expect(formatAtPrecision(3200, 0)).toBe('3,200')
    expect(formatAtPrecision(12.6, 2)).toBe('12.60')
    expect(formatAtPrecision(1000.4, 0)).toBe('1,000')
  })
})

describe('toInputValue', () => {
  it('renders at the unit precision, ungrouped, for a number input', () => {
    // A grouped "1,000" is not a valid <input type="number"> value.
    expect(makeUnitFormat(IMPERIAL).distance.toInputValue(1609.34)).toBe('1000')
    expect(makeUnitFormat(IMPERIAL).tread.toInputValue(7.5)).toBe('9')
    expect(makeUnitFormat(METRIC).tread.toInputValue(7.5)).toBe('7.50')
    expect(makeUnitFormat(IMPERIAL).pressure.toInputValue(240)).toBe('34.8')
  })

  it('renders an absent value as the empty string, not "null"', () => {
    expect(makeUnitFormat(IMPERIAL).tread.toInputValue(null)).toBe('')
    expect(makeUnitFormat(IMPERIAL).tread.toInputValue(undefined)).toBe('')
  })

  it('renders a reciprocal zero as empty rather than Infinity', () => {
    expect(makeUnitFormat(IMPERIAL).consumption.toInputValue(0)).toBe('')
  })
})

describe('resolvedUnitSummary', () => {
  it('lists the imperial preset, one label per quantity in declaration order', () => {
    expect(resolvedUnitSummary(IMPERIAL)).toBe('mi, mph, ft, gal, MPG, PSI, °F, lb, lb-ft, /32 in')
  })

  it('lists the metric preset, whose pressure is kPa and never bar', () => {
    // The fixed string this replaced said "bar", which no preset has ever
    // resolved to: `presetUnitsFor('metric', ...)` names `kpa`.
    expect(resolvedUnitSummary(METRIC)).toBe('km, km/h, m, L, L/100km, kPa, °C, kg, Nm, mm')
  })

  it('follows each quantity of a mixed set rather than collapsing from volume', () => {
    // R1's example: litres, MILES and PSI. The settings screen used to collapse
    // this to `metric` and tell the user they use kilometres and bar.
    const mixed: UnitSet = { ...METRIC, distance: 'mi', pressure: 'psi' }
    expect(resolvedUnitSummary(mixed)).toBe('mi, km/h, m, L, L/100km, PSI, °C, kg, Nm, mm')
  })

  it('follows a set that collapses to imperial but is metric in three quantities', () => {
    const mixed: UnitSet = { ...IMPERIAL, temperature: 'c', torque: 'nm', tread: 'mm' }
    expect(resolvedUnitSummary(mixed)).toBe('mi, mph, ft, gal, MPG, PSI, °C, lb, Nm, mm')
  })

  it('reads the consumption token rather than deriving it from volume', () => {
    // `km_l` is the one consumption token no preset uses, so a summary that
    // derived consumption from `units.volume` would say L/100km here.
    const mixed: UnitSet = { ...METRIC, consumption: 'km_l' }
    expect(resolvedUnitSummary(mixed)).toBe('km, km/h, m, L, km/L, kPa, °C, kg, Nm, mm')
  })
})

describe('seedUnitField', () => {
  it('remembers the canonical value alongside the string it produced', () => {
    const u = makeUnitFormat(IMPERIAL)
    expect(seedUnitField(7.5, u.tread)).toStrictEqual({ canonical: 7.5, display: '9' })
  })

  it('seeds an absent value as an empty field with no canonical origin', () => {
    const u = makeUnitFormat(IMPERIAL)
    expect(seedUnitField(null, u.tread)).toStrictEqual({ canonical: null, display: '' })
  })
})

describe('canonicalFromUnitField', () => {
  const u = makeUnitFormat(IMPERIAL)
  const seeded: UnitFieldOrigin = { canonical: 7.5, display: '9' }

  it('returns the ORIGINAL canonical value when the field was not edited', () => {
    // ★ The whole point. 7.5 mm displays as 9/32 in, and 9/32 in converts back
    // to 7.14375 mm, so a form that re-converted an untouched field would
    // rewrite a stored value the user never touched.
    expect(canonicalFromUnitField('9', seeded, u.tread)).toBe(7.5)
  })

  it('converts the typed value once the field differs from what it was seeded with', () => {
    // 10/32 in x 0.79375 = 7.9375 mm
    expect(canonicalFromUnitField('10', seeded, u.tread)).toBe(7.9375)
  })

  it('reads a cleared field as null, not as the value it used to hold', () => {
    expect(canonicalFromUnitField('', seeded, u.tread)).toBeNull()
    expect(canonicalFromUnitField('   ', seeded, u.tread)).toBeNull()
  })

  it('reads a field that was empty and stayed empty as null', () => {
    const blank: UnitFieldOrigin = { canonical: null, display: '' }
    expect(canonicalFromUnitField('', blank, u.tread)).toBeNull()
  })

  it('converts an entry typed into a field that started empty', () => {
    const blank: UnitFieldOrigin = { canonical: null, display: '' }
    // 4/32 in x 0.79375 = 3.175 mm
    expect(canonicalFromUnitField('4', blank, u.tread)).toBe(3.175)
  })

  it('rejects text that is not a number instead of storing NaN', () => {
    const blank: UnitFieldOrigin = { canonical: null, display: '' }
    expect(canonicalFromUnitField('abc', blank, u.tread)).toBeNull()
  })

  it('is an identity for a metric field, where display and canonical agree', () => {
    const metric = makeUnitFormat(METRIC)
    const origin = seedUnitField(7.5, metric.tread)
    expect(origin.display).toBe('7.50')
    expect(canonicalFromUnitField('7.50', origin, metric.tread)).toBe(7.5)
    expect(canonicalFromUnitField('8', origin, metric.tread)).toBe(8)
  })

  it('returns the ORIGINAL canonical when the control hands back its own spelling of the seeded value', () => {
    // ★ The spelling gap, which is a data defect and not a tidiness one.
    // `toInputValue` writes `toFixed(precision)`, so 9.07 kg seeds a lb field
    // as '20.00'. A <select> option value and a react-hook-form NUMBER field
    // both round-trip through `Number`, so the only string they can offer back
    // is '20'. String equality alone reads that as an EDIT and reconverts:
    // 20 lb is 9.07184 kg, so a user who opened a propane record and saved it
    // untouched moved the stored tank size.
    //
    // Phase 3a task 3c met this on the fuel odometer and dodged it by pinning
    // `mi` and `km` to zero decimals, where the two spellings coincide. Mass
    // carries two decimals, so the dodge does not reach it and the comparison
    // has to be about the QUANTITY rather than about the characters.
    const um = makeUnitFormat({ ...METRIC, mass: 'lb' })
    const origin = seedUnitField(9.07, um.mass)
    expect(origin.display).toBe('20.00')
    expect(canonicalFromUnitField('20', origin, um.mass)).toBe(9.07)
    // The number the string comparison alone would have stored.
    expect(canonicalFromUnitField('20', origin, um.mass)).not.toBe(9.07184)
    // A real edit still converts: 21 lb x 0.453592 = 9.525432 kg.
    expect(canonicalFromUnitField('21', origin, um.mass)).toBe(9.525432)
    // ★ Folded here rather than standing alone, because on its own it holds at
    // t=0 and would assert nothing. `Number('')` is 0, so a numeric untouched
    // test that skipped the empty-origin guard would read a typed 0 as
    // "unchanged" and store null where the user entered a real zero.
    const blank: UnitFieldOrigin = { canonical: null, display: '' }
    expect(canonicalFromUnitField('0', blank, um.mass)).toBe(0)
  })

  it('honours a per-quantity override rather than the preset it came from', () => {
    // A custom user with metric everything but imperial tread.
    const custom: UnitSet = { ...METRIC, tread: 'in32' }
    const cu = makeUnitFormat(custom)
    const origin = seedUnitField(7.5, cu.tread)
    expect(origin.display).toBe('9')
    expect(canonicalFromUnitField('10', origin, cu.tread)).toBe(7.9375)
  })
})
