/**
 * The four-rung precedence, one test per rung boundary.
 *
 * Highest wins:
 *   1. an authenticated user's `resolved_units`;
 *   2. an explicit anonymous choice, meaning the `unit_preference` localStorage
 *      key is PRESENT and holds a value the app recognises;
 *   3. `default_unit_prefs` from `/settings/public`;
 *   4. imperial, which nothing post-093 should reach.
 *
 * Rung 3 did not exist before this change: the hook went straight from an
 * authenticated user to `localStorage.getItem('unit_preference') || 'imperial'`,
 * so an anonymous visitor on a metric-default instance got imperial no matter
 * what the admin had configured.
 *
 * ★ The ordering of 2 against 3 is the correction round 1 got wrong, and it is
 * not a detail. `default_unit_prefs` is a DEFAULT: what you get before you
 * choose, not something that overrides a choice already made. On an
 * `auth_mode=none` instance the `unit_preference` key is the ONLY units control
 * that exists (`SettingsSystemTab.tsx` writes it for a client with no account,
 * and `ProtectedRoute` lets `auth_mode=none` reach `/settings`), while migration
 * 093 seeds `default_unit_prefs` to the imperial or UK-imperial preset and never
 * to metric. Letting the default outrank the key made metric unreachable on
 * those instances, with the toggle still highlighting the choice it could no
 * longer honour.
 *
 * Every test pins the rung ABOVE against a DIFFERENT answer on the rung below,
 * so a hook that consulted the wrong one cannot pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { IMPERIAL_UNITS, METRIC_UNITS, makeUnitSet, makeUser, type User } from '@/__tests__/factories'
import type { UnitSet } from '@/types/units'
import { setGallonStandard } from '@/utils/gallonStandardStore'
import { binarySystemFor } from '@/types/units'
import { gallonStandardFor } from '@/utils/publicUnitDefaults'

const h = vi.hoisted(() => ({
  user: null as User | null,
  defaultUnitPrefs: null as UnitSet | null,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: h.user,
    isAuthenticated: h.user !== null,
    defaultUnitPrefs: h.defaultUnitPrefs,
  }),
}))

import { useUnitPreference } from '../useUnitPreference'

describe('useUnitPreference precedence', () => {
  beforeEach(() => {
    localStorage.clear()
    h.user = null
    h.defaultUnitPrefs = null
    // The module-level gallon store survives between tests; pin it to the
    // historical default so a rung-1 answer of 'uk' can only have come from the
    // set under test.
    setGallonStandard('us')
    localStorage.clear()
  })

  describe('rung 1 beats rung 2', () => {
    it('an account beats an explicit anonymous choice left in the browser', () => {
      localStorage.setItem('unit_preference', 'metric')
      h.user = makeUser({ unit_preference: 'imperial', resolved_units: IMPERIAL_UNITS })

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('imperial')
    })

    it("the account's showBoth beats the browser key", () => {
      localStorage.setItem('show_both_units', 'false')
      h.user = makeUser({ show_both_units: true })

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.showBoth).toBe(true)
    })
  })

  describe('rung 1 beats rung 3', () => {
    it('an imperial account stays imperial on a metric-default instance', () => {
      h.user = makeUser({ unit_preference: 'imperial', resolved_units: IMPERIAL_UNITS })
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('imperial')
    })

    it('a metric account stays metric on an imperial-default instance', () => {
      h.user = makeUser({ unit_preference: 'metric', resolved_units: METRIC_UNITS })
      h.defaultUnitPrefs = IMPERIAL_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })

    it("the account's own gallon flavour beats the instance default's", () => {
      h.user = makeUser({
        unit_preference: 'custom',
        resolved_units: makeUnitSet({ volume: 'gal_uk', secondary_gallon: 'uk' }),
      })
      h.defaultUnitPrefs = IMPERIAL_UNITS // gal_us

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })

    it('an account with no resolved units keeps the cached gallon standard', () => {
      // A browser holding a bundle against an older backend. It must not be
      // pushed onto the instance default, which it did not ask for.
      setGallonStandard('uk')
      h.user = makeUser({ resolved_units: undefined })
      h.defaultUnitPrefs = IMPERIAL_UNITS // gal_us

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })
  })

  describe('rung 2 beats rung 3: a choice already made outranks a default', () => {
    it('an anonymous metric choice survives an imperial instance default', () => {
      // ★ The `auth_mode=none` household. This is the only units control such an
      // instance has, and migration 093 can only ever seed imperial or
      // UK-imperial, so losing here makes metric permanently unreachable.
      localStorage.setItem('unit_preference', 'metric')
      h.defaultUnitPrefs = IMPERIAL_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })

    it('an anonymous imperial choice survives a metric instance default', () => {
      localStorage.setItem('unit_preference', 'imperial')
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('imperial')
    })

    it('a browser that chose keeps its own gallon flavour too', () => {
      // The same anonymous Settings panel writes both keys, so a client holding
      // an explicit units choice holds an explicit gallon choice as well.
      localStorage.setItem('unit_preference', 'imperial')
      setGallonStandard('uk')
      h.defaultUnitPrefs = IMPERIAL_UNITS // gal_us

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })

    it('an unrecognised stored value is noise, not a choice, and falls through', () => {
      // `storedSystem || 'imperial'` used to hand this straight back as a
      // UnitSystem, a value the type says cannot exist. A key the app cannot
      // read is not a recorded choice.
      localStorage.setItem('unit_preference', 'furlongs')
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })
  })

  describe('rung 3: the instance default, for a browser that never chose', () => {
    it('a metric instance default applies when the browser holds no choice', () => {
      // The shipped defect this task exists to fix, and the corrected ordering
      // does not weaken it: no key means no choice, so the default answers.
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })

    it('a UK-gallon instance default beats the cached us gallon standard', () => {
      h.defaultUnitPrefs = makeUnitSet({ volume: 'gal_uk', secondary_gallon: 'uk' })

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })

    it('a litre instance default takes its gallon flavour from secondary_gallon', () => {
      h.defaultUnitPrefs = makeUnitSet({ volume: 'L', secondary_gallon: 'uk' })

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })

    it('still reads showBoth from the browser, which the unit set does not publish', () => {
      localStorage.setItem('show_both_units', 'true')
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      // Anchored to rung 3 actually being the rung taken, so this cannot pass
      // by reading the same browser key from rung 4.
      expect(result.current.system).toBe('metric')
      expect(result.current.showBoth).toBe(true)
    })
  })

  describe('rung 4, which nothing post-093 should reach', () => {
    it('falls back to imperial when neither the browser nor the instance answers', () => {
      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('imperial')
    })

    it('takes the gallon standard from the cache', () => {
      setGallonStandard('uk')

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.gallonStandard).toBe('uk')
    })
  })
})

/**
 * The resolved `UnitSet` the hook now publishes alongside the binary system.
 *
 * `useUnitFormat()` closes over this, so every rung has to produce a complete
 * set, and the set has to AGREE with the `system` and `gallonStandard` the same
 * call returns. Two independently derived answers on one screen is the failure
 * this workstream keeps finding, so the agreement is asserted at every rung
 * rather than assumed.
 */
describe('the resolved unit set', () => {
  // Its own reset, not the outer suite's: `h` is module-scoped and the gallon
  // store is a module singleton, so a leftover user from the block above wins
  // rung 1 here and every rung-2/3/4 assertion below passes or fails for the
  // wrong reason.
  beforeEach(() => {
    localStorage.clear()
    h.user = null
    h.defaultUnitPrefs = null
    setGallonStandard('us')
  })

  it('rung 1: hands an account its own set through, overrides and all', () => {
    // A per-quantity set no preset can produce: metric everything, imperial
    // tread. A hook that rebuilt the set from the binary system would answer
    // 'mm' here, and a hook that rebuilt it from the imperial preset 'psi'.
    const resolved = makeUnitSet({ tread: 'in32' })
    h.user = makeUser({ unit_preference: 'custom', resolved_units: resolved })

    const { result } = renderHook(() => useUnitPreference())

    expect(result.current.units.tread).toBe('in32')
    expect(result.current.units.pressure).toBe('kpa')
    expect(result.current.units.volume).toBe('L')
  })

  it('rung 1: falls back to a preset when a stale bundle has no resolved set', () => {
    setGallonStandard('uk')
    h.user = makeUser({ unit_preference: 'imperial', resolved_units: undefined })

    const { result } = renderHook(() => useUnitPreference())

    expect(result.current.units.volume).toBe('gal_uk')
    expect(result.current.units.tread).toBe('in32')
  })

  it('rung 2: expands an explicit anonymous choice with the browser gallon', () => {
    localStorage.setItem('unit_preference', 'metric')
    setGallonStandard('uk')
    h.defaultUnitPrefs = IMPERIAL_UNITS

    const { result } = renderHook(() => useUnitPreference())

    // Metric from the key, UK from the store, and NOT the instance default.
    expect(result.current.units.volume).toBe('L')
    expect(result.current.units.secondary_gallon).toBe('uk')
  })

  it('rung 3: hands the instance default through, overrides and all', () => {
    h.defaultUnitPrefs = makeUnitSet({ pressure: 'bar', tread: 'in32' })

    const { result } = renderHook(() => useUnitPreference())

    expect(result.current.units.pressure).toBe('bar')
    expect(result.current.units.tread).toBe('in32')
  })

  it('rung 4: falls back to imperial carrying the cached gallon standard', () => {
    setGallonStandard('uk')

    const { result } = renderHook(() => useUnitPreference())

    expect(result.current.units.volume).toBe('gal_uk')
    expect(result.current.units.consumption).toBe('mpg_uk')
  })

  it('agrees with the system and gallon standard it returns, at every rung', () => {
    const cases: Array<{ rung: string; arrange: () => void }> = [
      {
        rung: '1',
        arrange: () => {
          h.user = makeUser({
            unit_preference: 'custom',
            resolved_units: makeUnitSet({ volume: 'gal_uk', secondary_gallon: 'uk' }),
          })
        },
      },
      {
        rung: '2',
        arrange: () => {
          localStorage.setItem('unit_preference', 'metric')
          setGallonStandard('uk')
        },
      },
      { rung: '3', arrange: () => { h.defaultUnitPrefs = METRIC_UNITS } },
      { rung: '4', arrange: () => { setGallonStandard('uk') } },
    ]

    for (const { rung, arrange } of cases) {
      localStorage.clear()
      h.user = null
      h.defaultUnitPrefs = null
      setGallonStandard('us')
      arrange()

      const { result } = renderHook(() => useUnitPreference())

      expect(binarySystemFor(result.current.units.volume), `rung ${rung}`).toBe(
        result.current.system
      )
      expect(gallonStandardFor(result.current.units), `rung ${rung}`).toBe(
        result.current.gallonStandard
      )
    }
  })
})
