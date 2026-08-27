/**
 * The three-rung precedence, one test per rung boundary.
 *
 * Highest wins:
 *   1. an authenticated user's `resolved_units`;
 *   2. otherwise `default_unit_prefs` from `/settings/public`;
 *   3. otherwise the browser-owned legacy localStorage keys.
 *
 * Rung 2 did not exist before this change: the hook went straight from an
 * authenticated user to `localStorage.getItem('unit_preference') || 'imperial'`,
 * so an anonymous visitor on a metric-default instance got imperial no matter
 * what the admin had configured.
 *
 * Every test pins the rung ABOVE against a DIFFERENT answer on the rung below,
 * so a hook that silently consulted the wrong one cannot pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { IMPERIAL_UNITS, METRIC_UNITS, makeUnitSet, makeUser, type User } from '@/__tests__/factories'
import type { UnitSet } from '@/types/units'
import { setGallonStandard } from '@/utils/gallonStandardStore'

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
    // historical default so a rung-1 or rung-2 answer of 'uk' can only have
    // come from the set under test.
    setGallonStandard('us')
    localStorage.clear()
  })

  describe('rung 1 beats rung 2', () => {
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

    it("the account's showBoth beats the browser key", () => {
      localStorage.setItem('show_both_units', 'false')
      h.user = makeUser({ show_both_units: true })

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.showBoth).toBe(true)
    })
  })

  describe('rung 2 beats rung 3', () => {
    it('a metric instance default beats a stale imperial localStorage key', () => {
      localStorage.setItem('unit_preference', 'imperial')
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })

    it('an imperial instance default beats a stale metric localStorage key', () => {
      localStorage.setItem('unit_preference', 'metric')
      h.defaultUnitPrefs = IMPERIAL_UNITS

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('imperial')
    })

    it("a UK-gallon instance default beats the cached 'us' gallon standard", () => {
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
      localStorage.setItem('unit_preference', 'imperial')
      h.defaultUnitPrefs = METRIC_UNITS

      const { result } = renderHook(() => useUnitPreference())

      // Anchored to rung 2 actually being the rung taken, so this cannot pass
      // by reading the same browser key from rung 3.
      expect(result.current.system).toBe('metric')
      expect(result.current.showBoth).toBe(true)
    })
  })

  describe('rung 3, when nothing above it answers', () => {
    it('reads the legacy localStorage key', () => {
      localStorage.setItem('unit_preference', 'metric')

      const { result } = renderHook(() => useUnitPreference())

      expect(result.current.system).toBe('metric')
    })

    it('falls back to imperial when the browser has nothing either', () => {
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
