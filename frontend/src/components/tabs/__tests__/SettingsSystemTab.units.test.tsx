/**
 * The Units card describes the set the account RESOLVES to, per quantity.
 *
 * Two defects, one old and one this file now pins:
 *
 * 1. Migration 093 materialises a UK instance's imperial users as
 *    `unit_preference='custom'`. Branching the gallon sub-panel on
 *    `unitPreference === 'imperial'` removed their only UI for changing gallon
 *    flavour. The panel follows the resolved system instead.
 *
 * 2. ★ The description used to be one of two fixed sentences chosen by that
 *    same collapsed binary system, which is derived from VOLUME (spec D8). A
 *    `{volume:'L', distance:'mi', pressure:'psi'}` account was therefore told
 *    "Using metric units: liters, kilometers, L/100km, °C, bar, kg, Nm" while
 *    it renders miles and PSI. Plan 3b ruling R1 calls that a false statement
 *    rather than copy needing an exemption, so the sentence is COMPOSED from
 *    the resolved set. The assertions below quote what a user reads.
 *
 * ★ THE DESCRIPTION KEY IS RESOLVED THROUGH THE APP'S OWN i18next INSTANCE,
 * not through a hand-rolled substitution. The composed list contains `/` in
 * three of its labels (`L/100km`, `km/L`, `/32 in`), and i18next escapes
 * interpolated values by default; only `src/i18n.ts`'s `escapeValue: false`
 * makes them render as themselves. A test that spelled its own `.replace()`
 * would assert a sentence no user can get. Every other key echoes, matching the
 * global mock.
 *
 * The two-option toggle itself still shows the raw stored value (a per-quantity
 * editor is phase 4) and is deliberately not asserted here.
 */
import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext'
import {
  IMPERIAL_UNITS,
  METRIC_UNITS,
  UK_IMPERIAL_UNITS,
  makeUser,
  type User,
} from '@/__tests__/factories'
import type { UnitSet } from '@/types/units'

/** The composed description, as the component asks for it. */
const DESCRIPTION_KEY = 'units.resolvedDescription'

const h = vi.hoisted(() => ({
  user: null as User | null,
  resolve: null as ((key: string, opts?: Record<string, unknown>) => string) | null,
}))

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

// See SettingsSystemTab.test.tsx: the global setup mock returns a fresh `t`
// per call, which re-fires load effects forever. Pin a stable reference.
vi.mock('react-i18next', () => {
  const t = (key: string, opts?: Record<string, unknown>): string => h.resolve?.(key, opts) ?? key
  return {
    useTranslation: () => ({
      t,
      i18n: { language: 'en', changeLanguage: () => Promise.resolve() },
    }),
    Trans: ({ children }: { children: React.ReactNode }) => children,
    initReactI18next: { type: '3rdParty', init: () => {} },
  }
})

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isAdmin: true,
    user: h.user,
    refreshUser: vi.fn(),
  }),
}))

// Children with their own data fetching; not under test here.
vi.mock('@/components/ArchivedVehiclesList', () => ({ default: () => null }))
vi.mock('@/components/modals/OIDCModal', () => ({ default: () => null }))
vi.mock('@/components/modals/FamilyManagementModal', () => ({ default: () => null }))

import i18n from '@/i18n'
import api from '@/services/api'
import SettingsSystemTab from '../SettingsSystemTab'

h.resolve = (key, opts) =>
  key === DESCRIPTION_KEY ? i18n.t(`settings:${key}`, opts ?? {}) : key

const mockedApi = vi.mocked(api)

function ActiveSystemTab(): React.ReactElement {
  const { setCurrentTabId } = useSettings()
  useEffect(() => {
    setCurrentTabId('system')
  }, [setCurrentTabId])
  return <SettingsSystemTab />
}

function renderTab(): void {
  render(
    <SettingsProvider>
      <ActiveSystemTab />
    </SettingsProvider>,
  )
}

describe('SettingsSystemTab — units card follows the resolved system', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    h.user = null
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { settings: [{ key: 'timezone', value: 'UTC' }] },
        })
      }
      if (url === '/auth/users/count') return Promise.resolve({ data: { count: 2 } })
      if (url === '/dashboard') return Promise.resolve({ data: { total_vehicles: 0 } })
      if (url === '/health') return Promise.resolve({ data: { authenticator_detected: false } })
      return Promise.resolve({ data: {} })
    })
    mockedApi.post.mockResolvedValue({ data: { settings: [], total: 0 } })
    mockedApi.put.mockResolvedValue({ data: {} })
  })

  it('keeps the gallon-standard panel for a custom user resolving to UK gallons', async () => {
    h.user = makeUser({ unit_preference: 'custom', resolved_units: UK_IMPERIAL_UNITS })

    renderTab()

    expect(await screen.findByText('units.gallonStandard')).toBeInTheDocument()
  })

  it('hides the gallon-standard panel for a custom user resolving to litres', async () => {
    h.user = makeUser({ unit_preference: 'custom', resolved_units: METRIC_UNITS })

    renderTab()

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/settings'))
    expect(screen.queryByText('units.gallonStandard')).not.toBeInTheDocument()
  })

  it('still shows the panel for a preset imperial user', async () => {
    h.user = makeUser({ unit_preference: 'imperial', resolved_units: IMPERIAL_UNITS })

    renderTab()

    expect(await screen.findByText('units.gallonStandard')).toBeInTheDocument()
  })

  it('still hides the panel for a preset metric user', async () => {
    h.user = makeUser({ unit_preference: 'metric', resolved_units: METRIC_UNITS })

    renderTab()

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith('/settings'))
    expect(screen.queryByText('units.gallonStandard')).not.toBeInTheDocument()
  })
})

describe('SettingsSystemTab — the description is composed from the resolved set', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    h.user = null
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { settings: [{ key: 'timezone', value: 'UTC' }] },
        })
      }
      if (url === '/auth/users/count') return Promise.resolve({ data: { count: 2 } })
      if (url === '/dashboard') return Promise.resolve({ data: { total_vehicles: 0 } })
      if (url === '/health') return Promise.resolve({ data: { authenticator_detected: false } })
      return Promise.resolve({ data: {} })
    })
    mockedApi.post.mockResolvedValue({ data: { settings: [], total: 0 } })
    mockedApi.put.mockResolvedValue({ data: {} })
  })

  /** Mount as a custom account on `units` and return what the card says. */
  async function describedUnits(units: UnitSet): Promise<string> {
    h.user = makeUser({ unit_preference: 'custom', resolved_units: units })
    renderTab()
    const paragraph = await screen.findByText(/^Using these units: /)
    return paragraph.textContent ?? ''
  }

  it('names miles and PSI for the litres-and-miles account R1 describes', async () => {
    // The exact set from plan 3b R1. `binarySystemFor('L')` is metric, so the
    // retired copy told this reader "kilometers ... bar".
    const units: UnitSet = { ...METRIC_UNITS, distance: 'mi', pressure: 'psi' }
    expect(await describedUnits(units)).toBe(
      'Using these units: mi, km/h, m, L, L/100km, PSI, °C, kg, Nm, mm',
    )
  })

  it('names Celsius, Nm and mm for an otherwise imperial account', async () => {
    // Collapses to imperial (gallons), so the retired copy claimed °F, lb-ft
    // and the 1/32-inch tread this account does not use.
    const units: UnitSet = { ...IMPERIAL_UNITS, temperature: 'c', torque: 'nm', tread: 'mm' }
    expect(await describedUnits(units)).toBe(
      'Using these units: mi, mph, ft, gal, MPG, PSI, °C, lb, Nm, mm',
    )
  })

  it('names km/L and bar, which neither retired sentence could say', async () => {
    // `km_l` and `bar` are in no preset, so no fixed sentence could ever name
    // them: the metric one said `L/100km` and `bar`, and the metric PRESET
    // resolves `kpa`. Both halves were wrong in opposite directions.
    const units: UnitSet = {
      ...METRIC_UNITS,
      speed: 'mph',
      consumption: 'km_l',
      pressure: 'bar',
      mass: 'lb',
    }
    expect(await describedUnits(units)).toBe(
      'Using these units: km, mph, m, L, km/L, bar, °C, lb, Nm, mm',
    )
  })

  it('describes a preset imperial account in the units it renders', async () => {
    h.user = makeUser({ unit_preference: 'imperial', resolved_units: IMPERIAL_UNITS })

    renderTab()

    expect(
      await screen.findByText(
        'Using these units: mi, mph, ft, gal, MPG, PSI, °F, lb, lb-ft, /32 in',
      ),
    ).toBeInTheDocument()
  })

  it('describes a preset metric account with kPa, which the retired copy called bar', async () => {
    h.user = makeUser({ unit_preference: 'metric', resolved_units: METRIC_UNITS })

    renderTab()

    expect(
      await screen.findByText('Using these units: km, km/h, m, L, L/100km, kPa, °C, kg, Nm, mm'),
    ).toBeInTheDocument()
  })

  it('switches with the optimistic toggle rather than lagging refreshUser()', async () => {
    // The account stays imperial for the whole test: `useAuth` is mocked with a
    // fixed user and `refreshUser` is a no-op, so a description read from the
    // hook alone would never move. The preset branch of `displayUnits` is what
    // makes the copy follow the click.
    h.user = makeUser({ unit_preference: 'imperial', resolved_units: IMPERIAL_UNITS })

    renderTab()

    expect(
      await screen.findByText(
        'Using these units: mi, mph, ft, gal, MPG, PSI, °F, lb, lb-ft, /32 in',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByText('units.metric'))

    expect(
      await screen.findByText('Using these units: km, km/h, m, L, L/100km, kPa, °C, kg, Nm, mm'),
    ).toBeInTheDocument()
  })
})
