/**
 * Round 2 of Task 2: the consumption half of defect L1, fixed at the DISPATCH.
 *
 * `UnitConverter` keeps the gallon and MPG factors in mutable statics, and
 * `useGallonStandardSync` drives them from the INSTANCE setting. Every
 * consumption and fuel-rate helper reads those statics rather than taking a
 * unit set, so a user resolving `gal_uk` on a US-default instance saw their
 * volume and price in imperial gallons (round 1) beside an MPG computed on US
 * ones: two gallons on one screen, and the MPG is a wrong number rather than
 * merely an inconsistent one.
 *
 * Rather than change 31 call sites, this hook makes the statics resolve from
 * the client's own answer. `useUnitPreference().gallonStandard` already
 * implements the four-rung precedence with the account's `resolved_units` on
 * rung 1, and until now it had no consumer at all.
 *
 * ★ It writes `UnitConverter`, NOT the store. The store persists to
 * localStorage and is browser-owned (an anonymous choice, or the instance
 * reconcile); writing a per-account answer into it would overwrite a key no
 * account owns. That distinction is asserted below, not just described.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ gallonStandard: 'us' as 'us' | 'uk' }))
vi.mock('../useUnitPreference', () => ({
  useUnitPreference: () => ({
    system: 'imperial' as const,
    showBoth: false,
    gallonStandard: h.gallonStandard,
    units: undefined,
  }),
}))

import { setGallonStandard as storeSet, getGallonStandard as storeGet } from '../../utils/gallonStandardStore'
import { UK_IMPERIAL_UNITS } from '../../__tests__/factories'
import { UnitConverter, UnitFormatter } from '../../utils/units'
import { formatFuelRate, makeUnitFormat } from '../../utils/unitFormat'
import { useResolvedGallonSync } from '../useResolvedGallonSync'

/**
 * Seed the module-singleton store.
 *
 * It no-ops on an unchanged value, so a naive single write establishes no
 * state at all and a test can pass having proved nothing. Flip away first.
 */
function seedStore(value: 'us' | 'uk'): void {
  storeSet(value === 'us' ? 'uk' : 'us')
  storeSet(value)
}

beforeEach(() => {
  h.gallonStandard = 'us'
  seedStore('us')
})

describe('useResolvedGallonSync', () => {
  it('applies the ACCOUNT\'s gallon over the instance value already in the store', () => {
    seedStore('us')
    h.gallonStandard = 'uk'
    expect(UnitConverter.getGallonStandard()).toBe('us')

    renderHook(() => useResolvedGallonSync())

    expect(UnitConverter.getGallonStandard()).toBe('uk')
  })

  it('writes the converter and leaves the browser-owned store untouched', () => {
    seedStore('us')
    h.gallonStandard = 'uk'

    renderHook(() => useResolvedGallonSync())

    expect(UnitConverter.getGallonStandard()).toBe('uk')
    // The store, and the localStorage key it owns, still hold the instance
    // answer: an account preference must not overwrite a browser-held choice.
    expect(storeGet()).toBe('us')
    expect(localStorage.getItem('imperial_gallon_standard')).toBe('us')
  })

  it('re-asserts after the instance value is written mid-session', () => {
    // The admin's gallon toggle writes the store, and the store writes the same
    // static. Without a re-assert the converter would stay on the instance
    // answer for the rest of the session.
    //
    // ★ The store must actually CHANGE here. Its setter no-ops on an unchanged
    // value, so seeding it to 'us' and then writing 'us' again writes nothing
    // at all and this test asserts a property it never exercised. It did
    // exactly that until mutation R2 survived: start on the client's own
    // flavour, and let the toggle move the store AWAY from it.
    seedStore('uk')
    h.gallonStandard = 'uk'
    renderHook(() => useResolvedGallonSync())
    expect(UnitConverter.getGallonStandard()).toBe('uk')

    act(() => {
      storeSet('us')
    })

    // The store took the instance answer, as it should; the converter did not.
    expect(storeGet()).toBe('us')
    expect(UnitConverter.getGallonStandard()).toBe('uk')
  })

  it('leaves a client whose own answer IS the store value exactly where it was', () => {
    // Rungs 2 to 4 return the store's cached value, so nothing should move.
    seedStore('uk')
    h.gallonStandard = 'uk'

    renderHook(() => useResolvedGallonSync())

    expect(UnitConverter.getGallonStandard()).toBe('uk')
    expect(storeGet()).toBe('uk')
  })

  it('★ the whole fuel row agrees, and no longer needs this hook to', () => {
    // The readings a fuel row puts side by side must divide into each other.
    // 45.4609 L over 482.802 km is 10.00 imperial gallons over 300 miles, so
    // 30.0 MPG; on US gallons the SAME row is 12.01 gal and 24.98 MPG. Round 1
    // moved the volume column onto the account's gallon and left consumption on
    // the instance's, which put a 25.0 MPG badge beside a 10.00 gal cell.
    //
    // ★ THE ASSERTION IS THE INDEPENDENCE, not the agreement. Task 6b moved
    // consumption and the fuel rate onto the account's own tokens, so every
    // cell below is already right with the converter still holding 'us' and the
    // hook not yet rendered. That is what makes the four expectations BEFORE
    // `renderHook` the interesting ones: they fail the day a cell is routed
    // back through `UnitConverter`'s mutable, instance-following statics, which
    // is exactly how this defect was introduced the first time.
    seedStore('us')
    h.gallonStandard = 'uk'
    const u = makeUnitFormat(UK_IMPERIAL_UNITS)
    expect(UnitConverter.getGallonStandard()).toBe('us')
    expect(UnitFormatter.formatVolume(45.4609, UK_IMPERIAL_UNITS)).toBe('10.00 gal')
    // Distance never had a gallon in it; through the resolved `mi` adapter
    // since task 6 deleted the binary formatter. 482.802 / 1.60934 = 300.
    expect(u.distance.format(482.802)).toBe('300 mi')
    expect(u.consumption.format(9.4160546)).toBe('30.0 MPG')
    expect(formatFuelRate(UK_IMPERIAL_UNITS, 4.54609)).toBe('1.00 gal/hr')

    renderHook(() => useResolvedGallonSync())

    expect(UnitConverter.getGallonStandard()).toBe('uk')
    expect(UnitFormatter.formatVolume(45.4609, UK_IMPERIAL_UNITS)).toBe('10.00 gal')
    expect(u.distance.format(482.802)).toBe('300 mi')
    expect(u.consumption.format(9.4160546)).toBe('30.0 MPG')
    expect(formatFuelRate(UK_IMPERIAL_UNITS, 4.54609)).toBe('1.00 gal/hr')
    // 300 / 10.00 = 30.0, and every cell names the same gallon either way.
  })

  it('★ still moves the converter statics, which is all it is for now', () => {
    // 45.4609 L over 482.802 km is 10.00 imperial gallons over 300 miles, so
    // 30.0 MPG. On US gallons the same row reads 24.98, understated by a sixth.
    //
    // ★ These two converters are what the hook still reaches, and after task 6b
    // no production file calls either: every user-visible consumption reading
    // goes through the resolved token asserted in the test above. The hook, the
    // `subscribeToConverterGallon` repaint machinery and `UnitConverter`'s
    // mutable factors are now a closed loop with no consumer, which is a
    // deletion for whoever owns the gallon-standard machinery, not for the
    // consumption family. Until then this pins that the dispatch still works.
    seedStore('us')
    h.gallonStandard = 'uk'
    expect(UnitConverter.l100kmToMpg(9.4160546)).toBe(25)

    renderHook(() => useResolvedGallonSync())

    expect(UnitConverter.l100kmToMpg(9.4160546)).toBe(30)
    expect(UnitConverter.mpgToL100km(30)).toBe(9.4)
  })
})
