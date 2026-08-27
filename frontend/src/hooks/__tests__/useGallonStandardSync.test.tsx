/**
 * The gallon cache's precedence, which is the half of this wiring that is not
 * obvious from either file alone.
 *
 * `gallonStandardStore` seeds itself from localStorage SYNCHRONOUSLY at module
 * load, before any fetch, and this hook deliberately keeps that local value when
 * a reconcile FAILS. Both behaviours are correct on their own terms; together
 * they let a stale local key outlive a good server answer.
 *
 * The rule, and it is what these tests pin: a FAILED reconcile keeps the cache
 * unchanged, a SUCCESSFUL one replaces it. And a successfully parsed
 * `default_unit_prefs` outranks the retiring `imperial_gallon_standard` row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { GallonStandard } from '@/utils/units'
import {
  getGallonStandard,
  setGallonStandard,
  subscribeToGallonStandard,
} from '@/utils/gallonStandardStore'

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}))

import api from '@/services/api'
import { useGallonStandardSync } from '../useGallonStandardSync'

const mockedApi = vi.mocked(api)

const STORAGE_KEY = 'imperial_gallon_standard'

/** IMPERIAL_PRESET (US gallons), exactly as `/api/settings/public` serves it. */
const US_IMPERIAL_RAW =
  '{"consumption": "mpg_us", "distance": "mi", "length": "ft", "mass": "lb", "pressure": "psi", "secondary_gallon": "us", "speed": "mph", "temperature": "f", "torque": "lbft", "tread": "in32", "volume": "gal_us"}'

/** UK_IMPERIAL_PRESET (migration 093's UK_IMPERIAL_SET), as served. */
const UK_IMPERIAL_RAW =
  '{"consumption": "mpg_uk", "distance": "mi", "length": "ft", "mass": "lb", "pressure": "psi", "secondary_gallon": "uk", "speed": "mph", "temperature": "f", "torque": "lbft", "tread": "in32", "volume": "gal_uk"}'

/** METRIC_PRESET, whose litre primary defers to secondary_gallon ("us"). */
const METRIC_RAW =
  '{"consumption": "l_100km", "distance": "km", "length": "m", "mass": "kg", "pressure": "kpa", "secondary_gallon": "us", "speed": "kmh", "temperature": "c", "torque": "nm", "tread": "mm", "volume": "L"}'

function servePublicSettings(settings: Array<{ key: string; value?: string | null }>): void {
  mockedApi.get.mockResolvedValue({ data: { settings } })
}

/**
 * Put the cache in a known state, store AND localStorage.
 *
 * `setGallonStandard` no-ops on an unchanged value (deliberately, so a re-sync
 * cannot loop renders) and the store is a module singleton that carries across
 * tests, so setting the wanted value directly may write nothing at all. Flip
 * away first.
 *
 * @param standard The standard the browser should be cached on.
 */
function seedCache(standard: GallonStandard): void {
  setGallonStandard(standard === 'us' ? 'uk' : 'us')
  setGallonStandard(standard)
}

/** Let the hook's fetch, its .then and the store write all settle. */
async function settle(): Promise<void> {
  await waitFor(() => {
    expect(mockedApi.get).toHaveBeenCalledWith('/settings/public')
  })
  await Promise.resolve()
  await Promise.resolve()
}

describe('useGallonStandardSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('a successful reconcile replaces a stale local key', async () => {
    // The browser is cached on UK; the instance default now says litres, whose
    // secondary_gallon is US. The retiring key deliberately still says 'uk', so
    // a US answer can ONLY have come from the parsed default: this cannot pass
    // by falling through to the legacy row or by leaving the cache alone.
    seedCache('uk')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('uk')
    servePublicSettings([
      { key: 'imperial_gallon_standard', value: 'uk' },
      { key: 'default_unit_prefs', value: METRIC_RAW },
    ])

    renderHook(() => useGallonStandardSync())

    await waitFor(() => {
      expect(getGallonStandard()).toBe('us')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('us')
  })

  it('and replaces it in the other direction', async () => {
    seedCache('us')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('us')
    servePublicSettings([
      { key: 'imperial_gallon_standard', value: 'us' },
      { key: 'default_unit_prefs', value: UK_IMPERIAL_RAW },
    ])

    renderHook(() => useGallonStandardSync())

    await waitFor(() => {
      expect(getGallonStandard()).toBe('uk')
    })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('uk')
  })

  it('a failed reconcile keeps the cache unchanged', async () => {
    seedCache('uk')
    const listener = vi.fn()
    const unsubscribe = subscribeToGallonStandard(listener)
    mockedApi.get.mockRejectedValue(new Error('offline'))

    renderHook(() => useGallonStandardSync())
    await settle()

    expect(getGallonStandard()).toBe('uk')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('uk')
    // The store notifies on every change, so silence is proof of no write.
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('takes a US-gallon default as US even when the retiring key says uk', async () => {
    // D4b end to end: the gallon PRIMARY states its own flavour, so this is not
    // reading secondary_gallon, and it is certainly not reading the legacy row.
    seedCache('uk')
    servePublicSettings([
      { key: 'imperial_gallon_standard', value: 'uk' },
      { key: 'default_unit_prefs', value: US_IMPERIAL_RAW },
    ])

    renderHook(() => useGallonStandardSync())

    await waitFor(() => {
      expect(getGallonStandard()).toBe('us')
    })
  })

  it('falls back to the legacy key when the published default is malformed', async () => {
    seedCache('us')
    servePublicSettings([
      { key: 'imperial_gallon_standard', value: 'uk' },
      { key: 'default_unit_prefs', value: '{not json' },
    ])

    renderHook(() => useGallonStandardSync())

    await waitFor(() => {
      expect(getGallonStandard()).toBe('uk')
    })
  })

  it('falls back to the legacy key when the instance publishes no default', async () => {
    seedCache('us')
    servePublicSettings([{ key: 'imperial_gallon_standard', value: 'uk' }])

    renderHook(() => useGallonStandardSync())

    await waitFor(() => {
      expect(getGallonStandard()).toBe('uk')
    })
  })
})
