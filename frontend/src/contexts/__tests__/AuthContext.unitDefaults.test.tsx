/**
 * `/settings/public` has published a resolved unit set for clients with no user
 * since phase 1 and `AuthContext` threw it away, so an anonymous visitor on a
 * metric-default instance rendered IMPERIAL.
 *
 * Two properties are pinned here, and the first is the one that made the bug
 * survive four phases: `loadUser` returns early when `auth_mode === 'none'`, so
 * the one mode that has no user to carry a preference is the mode that never
 * reached the parse. The default must therefore be read BEFORE that return.
 *
 * These tests drive the REAL AuthProvider and the REAL useUnitPreference, with
 * only the HTTP layer mocked, so they prove the wiring end to end rather than
 * agreeing with a mocked context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { makeUser } from '@/__tests__/factories'
import { AuthProvider, useAuth } from '../AuthContext'
import { useUnitPreference } from '@/hooks/useUnitPreference'

vi.mock('../../services/api', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  }
  return {
    default: mockApi,
    setCSRFToken: vi.fn(),
    getCSRFToken: vi.fn(),
    clearCSRFToken: vi.fn(),
    setApiAuthMode: vi.fn(),
  }
})

import api from '../../services/api'

const mockedApi = vi.mocked(api)

/** METRIC_PRESET, exactly as `/api/settings/public` serves it. */
const METRIC_RAW =
  '{"consumption": "l_100km", "distance": "km", "length": "m", "mass": "kg", "pressure": "kpa", "secondary_gallon": "us", "speed": "kmh", "temperature": "c", "torque": "nm", "tread": "mm", "volume": "L"}'

/** UK_IMPERIAL_PRESET (migration 093's UK_IMPERIAL_SET), as served. */
const UK_IMPERIAL_RAW =
  '{"consumption": "mpg_uk", "distance": "mi", "length": "ft", "mass": "lb", "pressure": "psi", "secondary_gallon": "uk", "speed": "mph", "temperature": "f", "torque": "lbft", "tread": "in32", "volume": "gal_uk"}'

function Consumer() {
  const { defaultUnitPrefs, loading, authMode } = useAuth()
  const { system } = useUnitPreference()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="auth-mode">{authMode}</span>
      <span data-testid="defaults-present">{String(defaultUnitPrefs !== null)}</span>
      <span data-testid="defaults-volume">{defaultUnitPrefs?.volume ?? 'none'}</span>
      <span data-testid="defaults-distance">{defaultUnitPrefs?.distance ?? 'none'}</span>
      <span data-testid="defaults-pressure">{defaultUnitPrefs?.pressure ?? 'none'}</span>
      <span data-testid="defaults-secondary-gallon">
        {defaultUnitPrefs?.secondary_gallon ?? 'none'}
      </span>
      <span data-testid="system">{system}</span>
    </div>
  )
}

function mountWithPublicSettings(settings: Array<{ key: string; value?: string | null }>) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/settings/public') return Promise.resolve({ data: { settings } })
    if (url === '/auth/me') return Promise.reject({ response: { status: 401 } })
    return Promise.reject(new Error('unexpected url'))
  })
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  )
}

describe('AuthContext default_unit_prefs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('parses the default before the auth_mode=none early return', async () => {
    mountWithPublicSettings([
      { key: 'auth_mode', value: 'none' },
      { key: 'default_unit_prefs', value: METRIC_RAW },
    ])

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('auth-mode')).toHaveTextContent('none')
    expect(screen.getByTestId('defaults-present')).toHaveTextContent('true')
    expect(screen.getByTestId('defaults-volume')).toHaveTextContent('L')
    expect(screen.getByTestId('defaults-distance')).toHaveTextContent('km')
    expect(screen.getByTestId('defaults-pressure')).toHaveTextContent('kpa')
    expect(screen.getByTestId('defaults-secondary-gallon')).toHaveTextContent('us')
    // /auth/me is still never probed: bug #98's guard is untouched.
    const requestedUrls = mockedApi.get.mock.calls.map((call: unknown[]) => call[0])
    expect(requestedUrls).not.toContain('/auth/me')
  })

  it('an anonymous visitor on a metric-default instance renders metric', async () => {
    // The shipped defect, end to end. A stale legacy key says imperial and the
    // instance default says metric; the instance default is the higher rung.
    localStorage.setItem('unit_preference', 'imperial')

    mountWithPublicSettings([
      { key: 'auth_mode', value: 'local' },
      { key: 'default_unit_prefs', value: METRIC_RAW },
    ])

    await waitFor(() => {
      expect(screen.getByTestId('system')).toHaveTextContent('metric')
    })
  })

  it('an anonymous visitor on a UK-imperial instance renders imperial', async () => {
    // The browser says metric, so 'imperial' here cannot be the rung-3 value
    // and cannot be the final hardcoded fallback either.
    localStorage.setItem('unit_preference', 'metric')

    mountWithPublicSettings([
      { key: 'auth_mode', value: 'none' },
      { key: 'default_unit_prefs', value: UK_IMPERIAL_RAW },
    ])

    await waitFor(() => {
      expect(screen.getByTestId('system')).toHaveTextContent('imperial')
    })
    expect(screen.getByTestId('defaults-volume')).toHaveTextContent('gal_uk')
    expect(screen.getByTestId('defaults-secondary-gallon')).toHaveTextContent('uk')
  })

  it('an authenticated account outranks the instance default', async () => {
    localStorage.setItem('unit_preference', 'metric')
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/settings/public') {
        return Promise.resolve({
          data: {
            settings: [
              { key: 'auth_mode', value: 'local' },
              { key: 'default_unit_prefs', value: METRIC_RAW },
            ],
          },
        })
      }
      if (url === '/auth/me') {
        return Promise.resolve({ data: makeUser({ unit_preference: 'imperial' }) })
      }
      return Promise.reject(new Error('unexpected url'))
    })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('system')).toHaveTextContent('imperial')
    })
    // The instance default is still retained; it just lost.
    expect(screen.getByTestId('defaults-volume')).toHaveTextContent('L')
  })

  it('drops to the legacy localStorage key when the published row is malformed', async () => {
    localStorage.setItem('unit_preference', 'metric')

    mountWithPublicSettings([
      { key: 'auth_mode', value: 'none' },
      { key: 'default_unit_prefs', value: '{not json' },
    ])

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('defaults-present')).toHaveTextContent('false')
    expect(screen.getByTestId('system')).toHaveTextContent('metric')
  })

  it('drops to the legacy localStorage key when the instance publishes no default', async () => {
    localStorage.setItem('unit_preference', 'metric')

    mountWithPublicSettings([{ key: 'auth_mode', value: 'none' }])

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('defaults-present')).toHaveTextContent('false')
    expect(screen.getByTestId('system')).toHaveTextContent('metric')
  })

  it('retains no default when the settings fetch fails outright', async () => {
    mockedApi.get.mockImplementation(() => Promise.reject(new Error('offline')))

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('defaults-present')).toHaveTextContent('false')
    expect(screen.getByTestId('system')).toHaveTextContent('imperial')
  })
})
