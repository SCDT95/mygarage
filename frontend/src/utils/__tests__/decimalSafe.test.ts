/**
 * The volume and price entry/storage boundary, driven by a resolved `UnitSet`.
 *
 * Defect L1: these helpers took a binary `UnitSystem` and multiplied by a
 * hardcoded `3.78541` under a comment claiming the factor was "mirrored from
 * UnitConverter", which stopped being true when the UK gallon shipped in
 * v3.1.0. A UK user entering 6.00/gal stored 6.00 / 3.78541 = 1.585/L instead
 * of 6.00 / 4.54609 = 1.320/L, 20.1 percent high, and the form read it back
 * through the same wrong factor so nothing on screen disagreed.
 *
 * Substituting the dynamic `UnitConverter.gallonsToLiters` would NOT have been
 * the fix: its flavour comes from the instance-wide gallon setting
 * (`useGallonStandardSync`), while phase 1 gave each account its own
 * `resolved_units`. Every test below that names a gallon therefore pins the
 * INSTANCE standard to `us` first, so a helper still reading the global cannot
 * pass a `gal_uk` case.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { makeUnitSet } from '@/__tests__/factories'
import { priceToCanonical, priceToDisplay, toCanonicalLiters } from '../decimalSafe'
import { UnitConverter } from '../units'

const METRIC = makeUnitSet()
const US = makeUnitSet({ volume: 'gal_us', mass: 'lb', secondary_gallon: 'us' })
/** A UK-gallon user. On this instance the global standard stays `us` below. */
const UK = makeUnitSet({ volume: 'gal_uk', mass: 'lb', secondary_gallon: 'uk' })

beforeEach(() => {
  // The instance-wide flavour, as `useGallonStandardSync` would leave it on a
  // US-default install. Nothing here may consult it.
  UnitConverter.setGallonStandard('us')
})

describe('toCanonicalLiters', () => {
  it('converts on the resolved volume token, not the instance gallon standard', () => {
    // 10 x 3.78541 = 37.8541 -> 37.854 at the API contract's 3 decimal places.
    expect(toCanonicalLiters(10, US)).toBe(37.854)
    // 10 x 4.54609 = 45.4609 -> 45.461. The instance standard is `us`, so a
    // helper reading the global would answer 37.854 here.
    expect(toCanonicalLiters(10, UK)).toBe(45.461)
    expect(UnitConverter.getGallonStandard()).toBe('us')
  })

  it('leaves a litre entry as it was typed, apart from the wire precision', () => {
    expect(toCanonicalLiters(50, METRIC)).toBe(50)
    // `liters` and `propane_liters` declare `decimal_places=3` in the API
    // schema, and pydantic REJECTS a fourth. A metric user typing 47.3176 used
    // to post it verbatim and take a 422.
    expect(toCanonicalLiters(47.3176, METRIC)).toBe(47.318)
  })

  it('returns null for an absent or unparseable entry, and a number for a real one', () => {
    expect(toCanonicalLiters(null, UK)).toBeNull()
    expect(toCanonicalLiters(undefined, METRIC)).toBeNull()
    expect(toCanonicalLiters(NaN, UK)).toBeNull()
    expect(toCanonicalLiters(0, UK)).toBe(0)
    expect(toCanonicalLiters(1, UK)).toBe(4.546)
  })
})

describe('the boundary this task moved, and the ones 3b then deleted', () => {
  it('moves volume onto the resolved set', () => {
    // Volume: resolved-set driven, and the instance standard is `us`.
    expect(toCanonicalLiters(10, UK)).toBe(45.461)
  })

  // ★ Distance, mass and length used to be asserted here in their binary form,
  // as `toCanonicalKm(100, 'metric')` and two siblings. Phase 3b task 5 DELETED
  // all three under ruling R8: each took a `UnitSystem` collapsed from the
  // user's VOLUME choice and wrote a canonical value off it, so a
  // `{volume:'L', distance:'mi'}` user's 500 miles stored as 500 km. Those
  // assertions are not moved or replaced here because there is nothing left in
  // this file to assert them against; what replaced the helpers is
  // `seedUnitField` / `canonicalFromUnitField` in `utils/unitFormat.ts`, tested
  // beside it. That the three stay deleted is asserted structurally, in
  // `utils/__tests__/unitsBinaryApiSurface.test.ts`.
})

describe('priceToDisplay / priceToCanonical — per_volume', () => {
  it('scales the canonical $/L by the resolved set\'s litres-per-unit', () => {
    // Real bug repro: stored $1.136/L reads $4.30/gal on US gallons and
    // $5.16/gal on imperial ones. 1.136 x 3.78541 = 4.30022576 -> 4.300;
    // 1.136 x 4.54609 = 5.16435824 -> 5.164.
    expect(priceToDisplay(1.136, US, 'per_volume')).toBe(4.3)
    expect(priceToDisplay(1.136, UK, 'per_volume')).toBe(5.164)
    // A litre user's price IS canonical: no conversion, and no re-rounding of
    // a stored value they never touched.
    expect(priceToDisplay(1.135845, METRIC, 'per_volume')).toBe(1.135845)
  })

  it('divides an entered price by the resolved set\'s litres-per-unit', () => {
    // 6.00/gal is 6 / 4.54609 = 1.31981548979 $/L for an imperial gallon and
    // 6 / 3.78541 = 1.58503306115 for a US one. The 20.1 percent that L1 was.
    expect(priceToCanonical(6, UK, 'per_volume')).toBe(1.31981548979)
    expect(priceToCanonical(6, US, 'per_volume')).toBe(1.58503306115)
    expect(priceToCanonical(1.136, METRIC, 'per_volume')).toBe(1.136)
  })

  it('round-trips an entered UK price through canonical and back unchanged', () => {
    const typed = 6
    const canonical = priceToCanonical(typed, UK, 'per_volume')
    expect(canonical).toBe(1.31981548979)
    expect(priceToDisplay(canonical, UK, 'per_volume')).toBe(typed)
  })

  it('accepts the string an API response carries', () => {
    expect(priceToDisplay('1.136', UK, 'per_volume')).toBe(5.164)
  })
})

describe('priceToDisplay / priceToCanonical — per_weight', () => {
  it('scales by the resolved MASS token, independently of the volume one', () => {
    // $2.2046/kg is about $1.00/lb; $1.00/lb is 1 / 0.453592 = 2.20462442018.
    expect(priceToDisplay(2.2046, UK, 'per_weight')).toBe(1)
    expect(priceToCanonical(1, UK, 'per_weight')).toBe(2.20462442018)
    // A kilogram user's price is already canonical, even though the same set
    // names a gallon for volume.
    const kgWithGallons = makeUnitSet({ volume: 'gal_uk', mass: 'kg' })
    expect(priceToDisplay(2.2046, kgWithGallons, 'per_weight')).toBe(2.2046)
  })
})

describe('priceToDisplay / priceToCanonical — bases with no unit to convert', () => {
  it('leaves per_kwh, per_tank and an unknown basis alone on a gallon set', () => {
    expect(priceToDisplay(0.13, UK, 'per_kwh')).toBe(0.13)
    expect(priceToCanonical(0.13, UK, 'per_kwh')).toBe(0.13)
    expect(priceToDisplay(25, UK, 'per_tank')).toBe(25)
    expect(priceToCanonical(25, UK, 'per_tank')).toBe(25)
    expect(priceToDisplay(1.136, UK, null)).toBe(1.136)
    expect(priceToDisplay(1.136, UK, undefined)).toBe(1.136)
    expect(priceToDisplay(1.136, UK, 'something_else')).toBe(1.136)
    // Same set, same value, a basis that DOES name a unit: proves the four
    // pass-throughs above are the basis dispatch and not a dead helper.
    expect(priceToDisplay(1.136, UK, 'per_volume')).toBe(5.164)
  })

  it('returns null for an absent or unparseable price, and converts a real one', () => {
    expect(priceToDisplay(null, UK, 'per_volume')).toBeNull()
    expect(priceToDisplay(undefined, METRIC, 'per_volume')).toBeNull()
    expect(priceToDisplay('not a number', UK, 'per_volume')).toBeNull()
    expect(priceToCanonical(NaN, UK, 'per_volume')).toBeNull()
    expect(priceToCanonical(6, UK, 'per_volume')).toBe(1.31981548979)
  })
})
