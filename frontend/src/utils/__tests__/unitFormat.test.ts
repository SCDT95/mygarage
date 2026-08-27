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
  makeUnitFormat,
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

  it('honours a per-quantity override rather than the preset it came from', () => {
    // A custom user with metric everything but imperial tread.
    const custom: UnitSet = { ...METRIC, tread: 'in32' }
    const cu = makeUnitFormat(custom)
    const origin = seedUnitField(7.5, cu.tread)
    expect(origin.display).toBe('9')
    expect(canonicalFromUnitField('10', origin, cu.tread)).toBe(7.9375)
  })
})
